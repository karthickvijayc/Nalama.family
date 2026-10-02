/**
 * Ingestion & Translation Parser for External Health & Workout Data
 * Supports:
 * - Canonical Health Export JSON (`health_biometrics_daily.json` / any variant)
 * - Canonical Workout Export JSON (`workout_sessions_granular.json` / `hevy_workouts.json`)
 * - CSV exports from Health Connect, Samsung Health, Apple Health Auto-Export, Hevy CSV, Strong CSV, FitNotes CSV
 */

import { CanonicalHealthExport, CanonicalWorkoutExport, CanonicalWorkoutSession, CanonicalDailyHealthRecord } from './types';
import { HealthLogEntry, TimeBucket } from '../../types';
import * as XLSX from 'xlsx';

export interface ParseResult {
  sourceType: 'health_json' | 'workout_json' | 'health_csv' | 'workout_csv' | 'excel_workbook' | 'unknown';
  healthRecords?: CanonicalDailyHealthRecord[];
  workoutSessions?: CanonicalWorkoutSession[];
  convertedLogs: HealthLogEntry[];
  summary: string;
  error?: string;
}

/**
 * RFC-4180 compliant CSV parser that handles multiline fields, double quotes, and commas inside quotes.
 */
export function parseCSV(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  if (!csvText || !csvText.trim()) return { headers: [], rows: [] };

  // Strip UTF-8 BOM if present
  const cleanCsv = csvText.replace(/^\uFEFF/, '');

  // Detect delimiter (semicolon vs comma)
  const firstNewline = cleanCsv.indexOf('\n');
  const firstLine = firstNewline !== -1 ? cleanCsv.substring(0, firstNewline) : cleanCsv;
  const delimiter = (!firstLine.includes(',') && firstLine.includes(';')) ? ';' : ',';

  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = '';
  let inQuotes = false;
  const len = cleanCsv.length;

  for (let i = 0; i < len; i++) {
    const char = cleanCsv[i];
    if (char === '"') {
      if (inQuotes && i + 1 < len && cleanCsv[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRecord.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && i + 1 < len && cleanCsv[i + 1] === '\n') {
        i++;
      }
      currentRecord.push(currentField.trim());
      currentField = '';
      if (currentRecord.some(col => col.length > 0)) {
        records.push(currentRecord);
      }
      currentRecord = [];
    } else {
      currentField += char;
    }
  }

  // Handle final trailing field/record
  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField.trim());
    if (currentRecord.some(col => col.length > 0)) {
      records.push(currentRecord);
    }
  }

  if (records.length < 2) return { headers: [], rows: [] };

  const rawHeaders = records[0];
  const cleanHeaders = rawHeaders.map(h => h.replace(/^["']|["']$/g, '').trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const vals = records[i];
    if (vals.length === 0 || (vals.length === 1 && !vals[0])) continue;
    const rowObj: Record<string, string> = {};
    cleanHeaders.forEach((h, idx) => {
      rowObj[h] = vals[idx] !== undefined ? vals[idx].replace(/^["']|["']$/g, '').trim() : '';
    });
    rows.push(rowObj);
  }

  return { headers: cleanHeaders, rows };
}

/**
 * Determines whether a string or value contains a valid date component (year, month name, or date format)
 * rather than a pure time string like "07:15" or "11:32:00".
 */
export function hasDateComponent(str: any): boolean {
  if (!str) return false;
  const s = String(str).trim();
  // Check if it's an Excel numeric serial date (e.g. 45558)
  if (typeof str === 'number' || (!isNaN(Number(s)) && Number(s) > 30000 && Number(s) < 70000)) {
    return true;
  }
  // Check 4-digit year (e.g. 2024, 2025, 2026)
  if (/\b20\d{2}\b/.test(s)) return true;
  // Check month names (Jan, Feb, Sep, October, etc.)
  if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(s)) return true;
  // Check date pattern YYYY-MM-DD or DD/MM/YYYY or MM-DD-YYYY
  if (/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(s)) return true;
  return false;
}

/**
 * Standardize any date format into canonical "YYYY-MM-DD"
 */
export function normalizeDateStr(rawDate: any): string {
  const today = new Date();
  const todayIso = today.toISOString().split('T')[0];
  const maxFutureIso = new Date(today.getTime() + 86400000 * 1.5).toISOString().split('T')[0];

  if (!rawDate) return todayIso;

  // Handle Excel numeric serial dates (e.g. 45558)
  if (typeof rawDate === 'number' || (!isNaN(Number(rawDate)) && Number(rawDate) > 30000 && Number(rawDate) < 70000)) {
    const serial = Number(rawDate);
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      const res = d.toISOString().split('T')[0];
      return res > maxFutureIso ? todayIso : res;
    }
  }

  const rawStr = String(rawDate).trim();

  // 1. Text Month formats (e.g. "1 Oct 2026, 07:56", "15 Jul 2026, 09:52", "Oct 1, 2026", "1-Oct-2026")
  const MONTH_MAP: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  const textMonthMatch = rawStr.match(/^(\d{1,2})[-/ ]+([A-Za-z]{3,9})[-/ ,]+(\d{4})/) ||
                         rawStr.match(/^([A-Za-z]{3,9})[-/ ]+(\d{1,2})[-/ ,]+(\d{4})/);
  if (textMonthMatch) {
    const isFirstNum = !isNaN(Number(textMonthMatch[1]));
    const day = isFirstNum ? parseInt(textMonthMatch[1], 10) : parseInt(textMonthMatch[2], 10);
    const monthName = (isFirstNum ? textMonthMatch[2] : textMonthMatch[1]).toLowerCase();
    const year = parseInt(textMonthMatch[3], 10);
    const m = MONTH_MAP[monthName] || MONTH_MAP[monthName.slice(0, 3)];
    if (m && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
      const res = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return res > maxFutureIso ? todayIso : res;
    }
  }

  // 2. Standard numeric dates - strip time part ONLY if preceded by date characters (YYYY-MM-DD or DD/MM/YYYY)
  let str = rawStr;
  const timeSplit = rawStr.match(/^(\d{1,4}[-/]\d{1,2}[-/]\d{1,4})[T ]/);
  if (timeSplit) {
    str = timeSplit[1];
  }

  // 3. Match YYYY-MM-DD or YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = Math.max(1, Math.min(12, parseInt(ymd[2], 10)));
    const d = Math.max(1, Math.min(31, parseInt(ymd[3], 10)));
    const res = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return res > maxFutureIso ? todayIso : res;
  }

  // 4. Match DD-MM-YYYY, DD/MM/YYYY, MM-DD-YYYY, or MM/DD/YYYY
  const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const p1 = parseInt(dmy[1], 10);
    const p2 = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);

    let m: number;
    let d: number;

    if (p1 > 12 && p2 <= 12) {
      // p1 is day, p2 is month (e.g. 24/09/2026)
      m = p2;
      d = p1;
    } else if (p1 <= 12 && p2 > 12) {
      // p1 is month, p2 is day (e.g. 09/24/2026)
      m = p1;
      d = p2;
    } else {
      // Ambiguous (both <= 12, e.g. 01/10/2026 vs 10/01/2026)
      const optP2Month = `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      const optP1Month = `${year}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;

      // Check future constraint first
      if (optP2Month > maxFutureIso && optP1Month <= maxFutureIso) {
        m = p1;
        d = p2;
      } else if (optP1Month > maxFutureIso && optP2Month <= maxFutureIso) {
        m = p2;
        d = p1;
      } else {
        // Smart proximity disambiguation:
        const diffP2 = Math.abs(new Date(optP2Month).getTime() - today.getTime()) / 86400000;
        const diffP1 = Math.abs(new Date(optP1Month).getTime() - today.getTime()) / 86400000;

        // If one is recent (<= 45 days) and the other is distant (> 90 days), prefer recent!
        if (diffP2 <= 45 && diffP1 > 90) {
          m = p2;
          d = p1;
        } else if (diffP1 <= 45 && diffP2 > 90) {
          m = p1;
          d = p2;
        } else {
          // If equal proximity, default to DD/MM/YYYY (international/Android standard) unless explicit US slash
          if (str.includes('-')) {
            m = p2;
            d = p1;
          } else {
            if (diffP2 < diffP1) {
              m = p2;
              d = p1;
            } else {
              m = p1;
              d = p2;
            }
          }
        }
      }
    }

    m = Math.max(1, Math.min(12, m));
    d = Math.max(1, Math.min(31, d));
    const res = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return res > maxFutureIso ? todayIso : res;
  }

  // 5. Fallback to Date parser
  const parsed = new Date(rawStr);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const res = `${y}-${m}-${day}`;
    return res > maxFutureIso ? todayIso : res;
  }

  return todayIso;
}

/**
 * Robust duration parser for workouts (handles "1h 15m", "45m", "01:15:00", minutes)
 */
export function parseDurationMinutes(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '') return 45;
  if (typeof val === 'number') return isNaN(val) || val <= 0 ? 45 : val;
  const str = String(val).trim();
  if (!isNaN(Number(str))) {
    const n = Number(str);
    return n > 0 ? n : 45;
  }
  const hMatch = str.match(/(\d+)\s*h(?:our)?s?/i);
  const mMatch = str.match(/(\d+)\s*m(?:in(?:ute)?s?)?/i);
  if (hMatch || mMatch) {
    const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
    const mins = mMatch ? parseInt(mMatch[1], 10) : 0;
    const total = (hours * 60) + mins;
    return total > 0 ? total : 45;
  }
  const timeParts = str.split(':');
  if (timeParts.length === 3) {
    const h = parseInt(timeParts[0], 10) || 0;
    const m = parseInt(timeParts[1], 10) || 0;
    return (h * 60) + m;
  }
  if (timeParts.length === 2) {
    return parseInt(timeParts[0], 10) || 45;
  }
  const p = parseFloat(str);
  return isNaN(p) || p <= 0 ? 45 : p;
}

/**
 * Format a Date object into display time like "7:30 AM"
 */
function formatDisplayTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format a Date object into display date like "Sep 6, 2026"
 */
function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Ingests and converts a Canonical Workout Session into a structured HealthLogEntry
 */
export function convertWorkoutSessionToLogEntry(session: CanonicalWorkoutSession): HealthLogEntry {
  const sessionDateStr = normalizeDateStr(session.date);
  const dateParts = sessionDateStr.split('-');
  const rawYear = parseInt(dateParts[0], 10);
  const year = !isNaN(rawYear) && rawYear > 2000 ? rawYear : new Date().getFullYear();
  const rawMonth = parseInt(dateParts[1], 10);
  const month = !isNaN(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth - 1 : new Date().getMonth();
  const rawDay = parseInt(dateParts[2], 10);
  const day = !isNaN(rawDay) && rawDay >= 1 && rawDay <= 31 ? rawDay : new Date().getDate();

  let startHour = 8;
  let startMin = 0;
  if (session.startTime) {
    if (session.startTime.includes('T')) {
      const dParsed = new Date(session.startTime);
      if (!isNaN(dParsed.getTime())) {
        startHour = dParsed.getHours();
        startMin = dParsed.getMinutes();
      }
    } else {
      const timeMatch = session.startTime.match(/(\d+):(\d+)/);
      if (timeMatch) {
        startHour = parseInt(timeMatch[1], 10);
        startMin = parseInt(timeMatch[2], 10);
      }
    }
  }

  let d = new Date(year, month, day, startHour, startMin);
  if (isNaN(d.getTime())) {
    d = new Date();
  }

  // Safety guard against future workout timestamps (allowing max 24h for timezones)
  const maxFutureAllowed = Date.now() + 86400000;
  if (d.getTime() > maxFutureAllowed) {
    console.warn(`[WorkoutParser] Detected future timestamp (${d.toISOString()}) for workout "${session.title || 'Gym Session'}". Clamping to current timestamp.`);
    d = new Date();
  }

  const isoTimestamp = d.toISOString();
  const displayDate = formatDisplayDate(d);
  const displayTime = formatDisplayTime(d);

  // Determine time bucket
  let timeBucket: TimeBucket = 'Morning';
  if (startHour >= 5 && startHour < 12) timeBucket = 'Morning';
  else if (startHour >= 12 && startHour < 17) timeBucket = 'Afternoon';
  else if (startHour >= 17 && startHour < 21) timeBucket = 'Evening';
  else timeBucket = 'Night';

  // Build micro-detail exercise transcript
  const exerciseSummaries = (session.exercises || []).map(ex => {
    const setCount = ex.sets?.length || 0;
    const maxWeight = Math.max(...(ex.sets || []).map(s => s.weightKg || 0), 0);
    const topReps = ex.sets?.[0]?.reps || 0;
    const weightStr = maxWeight > 0 ? ` @ ${maxWeight}kg` : '';
    const metaParts: string[] = [];
    if (ex.targetMuscleGroup) metaParts.push(ex.targetMuscleGroup);
    if (ex.equipment) metaParts.push(ex.equipment);
    const metaStr = metaParts.length > 0 ? ` [${metaParts.join(' / ')}]` : '';
    return `${ex.exerciseName}${metaStr} (${setCount} sets${weightStr}${topReps ? `, ${topReps} reps` : ''})`;
  });

  const detailLines: string[] = [];
  detailLines.push(`🏋️ Workout: ${session.title || 'Gym Session'}`);
  detailLines.push(`• Duration: ${session.durationMinutes || 45} mins | Total Volume: ${(session.totalVolumeKg || 0).toLocaleString()} kg | Sets: ${session.totalSets || 0}`);
  if (session.caloriesActualHr || session.caloriesEstMet) {
    detailLines.push(`• Calories Burned: ${session.caloriesActualHr || session.caloriesEstMet} kcal`);
  }
  if (session.avgHeartRateBpm) {
    detailLines.push(`• Avg Heart Rate: ${session.avgHeartRateBpm} bpm (Max: ${session.maxHeartRateBpm || '--'} bpm)`);
  }
  if (exerciseSummaries.length > 0) {
    detailLines.push(`• Exercises: ${exerciseSummaries.join(', ')}`);
  }
  if (session.notes && session.notes.trim()) {
    detailLines.push(`• Notes: "${session.notes.trim()}"`);
  }

  const transcript = detailLines.join('\n');
  const headline = session.title ? session.title.slice(0, 30) : 'Gym Workout';

  return {
    id: `import-workout-${session.workoutId || `${sessionDateStr}-${Date.now()}`}`,
    timestamp: isoTimestamp,
    displayTime,
    displayDate,
    transcript,
    category: 'workout',
    source: 'synced',
    headline,
    caloriesBurned: session.caloriesActualHr || session.caloriesEstMet || Math.round((session.durationMinutes || 45) * 6),
    activeMinutes: session.durationMinutes || 45,
    heartRate: session.avgHeartRateBpm,
    timeBucket,
    processed: true
  };
}

/**
 * Ingests and converts a Canonical Daily Health Record into structured HealthLogEntries (Vitals, Sleep, Activity)
 */
export function convertDailyHealthRecordToLogEntries(record: CanonicalDailyHealthRecord): HealthLogEntry[] {
  const entries: HealthLogEntry[] = [];
  const dateStr = normalizeDateStr(record.date);
  const dateParts = dateStr.split('-');
  const rawYear = parseInt(dateParts[0], 10);
  const year = !isNaN(rawYear) && rawYear > 2000 ? rawYear : new Date().getFullYear();
  const rawMonth = parseInt(dateParts[1], 10);
  const month = !isNaN(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth - 1 : new Date().getMonth();
  const rawDay = parseInt(dateParts[2], 10);
  const day = !isNaN(rawDay) && rawDay >= 1 && rawDay <= 31 ? rawDay : new Date().getDate();

  // 1. Sleep Log Entry (Classified as Morning reflection of previous night)
  if (record.sleep && (record.sleep.totalSleepMinutes || record.sleep.deepSleepMinutes)) {
    const sleepDate = new Date(year, month, day, 7, 0);
    const totalHours = ((record.sleep.totalSleepMinutes || 0) / 60).toFixed(1);
    const deepMins = record.sleep.deepSleepMinutes || 0;
    const remMins = record.sleep.remSleepMinutes || 0;
    const lightMins = record.sleep.lightSleepMinutes || 0;
    const awakeMins = record.sleep.awakeMinutes || 0;
    const efficiency = record.sleep.sleepEfficiencyScore ? ` | Efficiency: ${record.sleep.sleepEfficiencyScore}%` : '';
    
    const lines = [
      `😴 Sleep Summary: ${totalHours} hrs total sleep`,
      `• Stages: Deep: ${deepMins}m, REM: ${remMins}m, Light: ${lightMins}m${awakeMins ? `, Awake: ${awakeMins}m` : ''}${efficiency}`
    ];
    if (record.sleep.sleepScore) {
      lines.push(`• Sleep Quality Score: ${record.sleep.sleepScore}/100`);
    }

    entries.push({
      id: `import-sleep-${dateStr}`,
      timestamp: !isNaN(sleepDate.getTime()) ? sleepDate.toISOString() : new Date().toISOString(),
      displayTime: formatDisplayTime(sleepDate),
      displayDate: formatDisplayDate(sleepDate),
      transcript: lines.join('\n'),
      category: 'general',
      source: 'synced',
      headline: 'Sleep Architecture',
      sleepMinutes: record.sleep.totalSleepMinutes,
      sleepHours: parseFloat(totalHours),
      sleepEfficiency: record.sleep.sleepEfficiencyScore,
      timeBucket: 'Morning',
      processed: true
    });
  }

  // 2. Daily Steps & Activity Entry
  if (record.activity && (record.activity.steps || record.activity.activeCaloriesKcal || record.activity.totalCaloriesKcal || record.activity.activeDurationMinutes)) {
    const actDate = new Date(year, month, day, 20, 0);
    const steps = record.activity.steps || 0;
    const activeCal = record.activity.activeCaloriesKcal || record.activity.totalCaloriesKcal || 0;
    const activeMins = record.activity.activeDurationMinutes || Math.round(steps / 100);
    const distKm = record.activity.distanceMeters ? (record.activity.distanceMeters / 1000).toFixed(2) : null;
    
    const lines = [
      `🚶 Daily Activity: ${steps.toLocaleString()} steps`,
      `• Active Energy: ${activeCal} kcal burned | Active Time: ${activeMins} mins`
    ];
    if (distKm) lines.push(`• Distance Covered: ${distKm} km`);
    if (record.activity.vo2MaxMlKgMin?.avg) {
      lines.push(`• Estimated VO2 Max: ${record.activity.vo2MaxMlKgMin.avg.toFixed(1)} ml/kg/min`);
    }

    entries.push({
      id: `import-activity-${dateStr}`,
      timestamp: !isNaN(actDate.getTime()) ? actDate.toISOString() : new Date().toISOString(),
      displayTime: formatDisplayTime(actDate),
      displayDate: formatDisplayDate(actDate),
      transcript: lines.join('\n'),
      category: 'workout',
      source: 'synced',
      headline: 'Daily Step Activity',
      caloriesBurned: activeCal,
      activeMinutes: activeMins,
      steps: steps > 0 ? steps : undefined,
      timeBucket: 'Evening',
      processed: true
    });
  }

  // 3. Vitals & Biometrics Entry
  if (record.vitals && (record.vitals.restingHeartRateBpm || record.vitals.bloodPressureMmHg || record.vitals.heartRateVariabilityMs || record.vitals.oxygenSaturationPct)) {
    const vitDate = new Date(year, month, day, 9, 30);
    const lines: string[] = [`🩺 Biometric Vitals Sync:`];
    
    let rhrVal: number | undefined = undefined;
    if (record.vitals.restingHeartRateBpm?.avg || record.vitals.restingHeartRateBpm?.min) {
      const rhr = record.vitals.restingHeartRateBpm.avg || record.vitals.restingHeartRateBpm.min;
      rhrVal = rhr;
      const min = record.vitals.restingHeartRateBpm.min;
      const max = record.vitals.restingHeartRateBpm.max;
      if (min !== undefined && max !== undefined && (min !== max || min !== rhr)) {
        lines.push(`• Resting Heart Rate: ${rhr} bpm (Range: ${min}-${max} bpm)`);
      } else {
        lines.push(`• Resting Heart Rate: ${rhr} bpm`);
      }
    }
    if (record.vitals.heartRateVariabilityMs?.avg || record.vitals.hrvRmssdMs?.avg) {
      const hrv = record.vitals.heartRateVariabilityMs?.avg || record.vitals.hrvRmssdMs?.avg;
      lines.push(`• Heart Rate Variability (HRV): ${hrv} ms`);
    }
    if (record.vitals.oxygenSaturationPct?.avg) {
      lines.push(`• Blood Oxygen (SpO2): ${record.vitals.oxygenSaturationPct.avg.toFixed(0)}%`);
    }
    if (record.vitals.bloodPressureMmHg?.systolic && record.vitals.bloodPressureMmHg?.diastolic) {
      const pulseStr = record.vitals.bloodPressureMmHg.pulse ? ` (Pulse: ${record.vitals.bloodPressureMmHg.pulse} bpm)` : '';
      lines.push(`• Blood Pressure: ${record.vitals.bloodPressureMmHg.systolic}/${record.vitals.bloodPressureMmHg.diastolic} mmHg${pulseStr}`);
    }
    if (record.vitals.bloodGlucoseMmolL?.avg) {
      lines.push(`• Blood Glucose: ${record.vitals.bloodGlucoseMmolL.avg} mmol/L`);
    }

    entries.push({
      id: `import-vitals-${dateStr}`,
      timestamp: !isNaN(vitDate.getTime()) ? vitDate.toISOString() : new Date().toISOString(),
      displayTime: formatDisplayTime(vitDate),
      displayDate: formatDisplayDate(vitDate),
      transcript: lines.join('\n'),
      category: 'event',
      source: 'synced',
      headline: 'Vitals & Biomarkers',
      restingHeartRate: rhrVal,
      heartRate: record.vitals.heartRateBpm?.avg,
      timeBucket: 'Morning',
      processed: true
    });
  }

  // 4. Body Composition Measurement
  if (record.bodyMeasurements && (record.bodyMeasurements.weightKg || record.bodyMeasurements.bodyFatPct)) {
    const bodyDate = new Date(year, month, day, 8, 0);
    const weight = record.bodyMeasurements.weightKg;
    const bodyFat = record.bodyMeasurements.bodyFatPct;
    const lines = [`⚖️ Body Composition:`];
    if (weight) lines.push(`• Weight: ${weight} kg`);
    if (bodyFat) lines.push(`• Body Fat: ${bodyFat}%`);
    if (record.bodyMeasurements.leanBodyMassKg) lines.push(`• Lean Body Mass: ${record.bodyMeasurements.leanBodyMassKg} kg`);
    if (record.bodyMeasurements.boneMassKg) lines.push(`• Bone Mass: ${record.bodyMeasurements.boneMassKg} kg`);

    entries.push({
      id: `import-body-${dateStr}`,
      timestamp: !isNaN(bodyDate.getTime()) ? bodyDate.toISOString() : new Date().toISOString(),
      displayTime: formatDisplayTime(bodyDate),
      displayDate: formatDisplayDate(bodyDate),
      transcript: lines.join('\n'),
      category: 'event',
      source: 'synced',
      headline: 'Body Measurements',
      weight: weight,
      timeBucket: 'Morning',
      processed: true
    });
  }

  return entries;
}

/**
 * Universal content parser that detects JSON or CSV, canonical vs raw tabular data
 */
export function parseImportFileContent(filename: string, rawContent: string): ParseResult {
  const trimmed = rawContent.trim();
  const lowerName = filename.toLowerCase();

  // 1. JSON Detection & Parsing
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      let data = JSON.parse(trimmed);

      // Unwrap webhook wrapper or nested structures
      if (typeof data?.jsonData === 'string') {
        try { data = JSON.parse(data.jsonData); } catch (_) {}
      } else if (data?.jsonData && typeof data.jsonData === 'object') {
        data = data.jsonData;
      }
      if (data?.data && typeof data.data === 'object' && !data.workouts && !data.dailyRecords) {
        data = data.data;
      }
      if (data?.payload && typeof data.payload === 'object' && !data.workouts && !data.dailyRecords) {
        data = data.payload;
      }
      if (data?.records && !data.dailyRecords) {
        data.dailyRecords = data.records;
      }
      if (data?.sessions && !data.workouts) {
        data.workouts = data.sessions;
      }

      // A. Canonical Workout Export JSON
      if (data.workouts && Array.isArray(data.workouts)) {
        const canonicalWorkouts = data as CanonicalWorkoutExport;
        const convertedLogs = canonicalWorkouts.workouts.map(convertWorkoutSessionToLogEntry);
        return {
          sourceType: 'workout_json',
          workoutSessions: canonicalWorkouts.workouts,
          convertedLogs,
          summary: `Imported ${canonicalWorkouts.workouts.length} workout sessions (${convertedLogs.length} logs created)`
        };
      }

      // Direct array of workout sessions
      if (Array.isArray(data) && data[0]?.exercises) {
        const convertedLogs = data.map(convertWorkoutSessionToLogEntry);
        return {
          sourceType: 'workout_json',
          workoutSessions: data,
          convertedLogs,
          summary: `Imported ${data.length} workout sessions`
        };
      }

      // B. Canonical Health Export JSON
      if (data.dailyRecords && Array.isArray(data.dailyRecords)) {
        const canonicalHealth = data as CanonicalHealthExport;
        const convertedLogs = canonicalHealth.dailyRecords.flatMap(convertDailyHealthRecordToLogEntries);
        return {
          sourceType: 'health_json',
          healthRecords: canonicalHealth.dailyRecords,
          convertedLogs,
          summary: `Imported ${canonicalHealth.dailyRecords.length} daily health records (${convertedLogs.length} logs created)`
        };
      }

      // Direct array of daily health records
      if (Array.isArray(data) && (data[0]?.activity || data[0]?.vitals || data[0]?.sleep)) {
        const convertedLogs = data.flatMap(convertDailyHealthRecordToLogEntries);
        return {
          sourceType: 'health_json',
          healthRecords: data,
          convertedLogs,
          summary: `Imported ${data.length} daily biometric records`
        };
      }

      // Direct array of flat daily health records
      if (Array.isArray(data) && data.length > 0 && (data[0].steps !== undefined || data[0].Steps !== undefined || data[0].date !== undefined || data[0].Date !== undefined)) {
        const healthRecords: CanonicalDailyHealthRecord[] = data.map((row: any) => {
          const date = normalizeDateStr(row['date'] || row['Date'] || row['timestamp']);
          const steps = parseInt(String(row['steps'] || row['Steps'] || row['step_count'] || '0'), 10);
          const dist = parseFloat(String(row['distance_meters'] || row['Distance (m)'] || row['distance'] || '0'));
          const totalCal = parseFloat(String(row['total_calories_kcal'] || row['Total Calories (kcal)'] || row['total_calories'] || '0'));
          const activeCal = parseFloat(String(row['active_calories_kcal'] || row['Active Calories (kcal)'] || row['active_calories'] || '0'));
          const activeMins = parseInt(String(row['active_duration_minutes'] || row['Active Time (min)'] || row['active_minutes'] || '0'), 10);
          const totalSleep = parseInt(String(row['total_sleep_minutes'] || row['total_sleep'] || '0'), 10);
          const rhrAvg = parseFloat(String(row['resting_hr_avg'] || row['resting_heart_rate'] || '0'));
          const hrAvg = parseFloat(String(row['hr_avg'] || row['heart_rate'] || '0'));
          return {
            date,
            sources: ['Import'],
            activity: (steps > 0 || totalCal > 0 || activeCal > 0 || activeMins > 0) ? {
              steps: steps > 0 ? steps : undefined,
              distanceMeters: dist > 0 ? dist : undefined,
              totalCaloriesKcal: totalCal > 0 ? totalCal : undefined,
              activeCaloriesKcal: activeCal > 0 ? activeCal : undefined,
              activeDurationMinutes: activeMins > 0 ? activeMins : undefined
            } : {},
            sleep: totalSleep > 0 ? { totalSleepMinutes: totalSleep } : {},
            vitals: (rhrAvg > 0 || hrAvg > 0) ? {
              restingHeartRateBpm: rhrAvg > 0 ? { avg: rhrAvg } : undefined,
              heartRateBpm: hrAvg > 0 ? { avg: hrAvg } : undefined
            } : {},
            bodyMeasurements: row['weight_kg'] ? { weightKg: parseFloat(String(row['weight_kg'])) } : {}
          };
        });
        const convertedLogs = healthRecords.flatMap(convertDailyHealthRecordToLogEntries);
        if (convertedLogs.length > 0) {
          return {
            sourceType: 'health_json',
            healthRecords,
            convertedLogs,
            summary: `Imported ${healthRecords.length} daily health records (${convertedLogs.length} logs created)`
          };
        }
      }
    } catch (err: any) {
      console.warn('JSON parsing attempt failed, checking CSV:', err);
    }
  }

  // 2. CSV Parsing
  const { headers, rows } = parseCSV(rawContent);
  if (headers.length > 0 && rows.length > 0) {
    const headerStr = headers.join(' ').toLowerCase();

    // A. Workout CSV (e.g., Hevy, Strong, FitNotes)

    // Headers typically contain: workout_id, title, exercise_name, set_number, weight_kg, reps, or Workout Title, Set #, etc.
    if (
      headerStr.includes('workout') || 
      headerStr.includes('exercise') || 
      headerStr.includes('set_number') ||
      headerStr.includes('set #') || 
      headerStr.includes('set') || 
      lowerName.includes('hevy') || 
      lowerName.includes('workout') || 
      lowerName.includes('strong')
    ) {
      // Group rows by workout title + date + start time
      const sessionMap = new Map<string, CanonicalWorkoutSession>();

      rows.forEach((row) => {
        // Explicitly prioritize date columns over start_time (which usually only holds HH:mm)
        const rawDateVal = 
          (row['date'] && hasDateComponent(row['date']) ? row['date'] : null) ||
          (row['Date'] && hasDateComponent(row['Date']) ? row['Date'] : null) ||
          (row['Start Date'] && hasDateComponent(row['Start Date']) ? row['Start Date'] : null) ||
          (row['start_date'] && hasDateComponent(row['start_date']) ? row['start_date'] : null) ||
          (row['workout_date'] && hasDateComponent(row['workout_date']) ? row['workout_date'] : null) ||
          (row['Workout Date'] && hasDateComponent(row['Workout Date']) ? row['Workout Date'] : null) ||
          (row['Date/Time'] && hasDateComponent(row['Date/Time']) ? row['Date/Time'] : null) ||
          (row['Timestamp'] && hasDateComponent(row['Timestamp']) ? row['Timestamp'] : null) ||
          (row['start_time'] && hasDateComponent(row['start_time']) ? row['start_time'] : null) ||
          (row['Start Time'] && hasDateComponent(row['Start Time']) ? row['Start Time'] : null) ||
          row['date'] || row['Date'] || row['Start Date'] || row['start_time'] || row['Start Time'];

        const date = normalizeDateStr(rawDateVal);
        const title = (row['title'] || row['Workout Title'] || row['Workout Name'] || row['Routine'] || 'Gym Workout').trim();

        // Extract clean start time (e.g. "07:56" or "18:30")
        const startTimeStr = String(row['start_time'] || row['Start Time'] || '').trim();
        const timeMatch = startTimeStr.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i);
        const cleanStartTime = timeMatch ? timeMatch[1] : (startTimeStr || '08:00');

        // Robust workout ID:
        // Use workout_id if explicitly provided; otherwise combine date + cleanStartTime + title
        const workoutId = row['workout_id'] || row['Workout ID'] || row['Hevy Workout ID'] || 
          `${date}-${cleanStartTime.replace(/[^a-zA-Z0-9]/g, '')}-${title.replace(/\s+/g, '_')}`;

        const rowNotes = (row['description'] || row['notes'] || row['Workout Notes'] || row['Notes'] || '').trim();

        if (!sessionMap.has(workoutId)) {
          // Duration calculation from duration_minutes or duration_seconds or (end_time - start_time)
          let durMins = parseDurationMinutes(row['duration_minutes'] || row['Duration (min)'] || row['Duration'] || row['duration']);
          if (durMins === 45 && (row['duration_seconds'] || row['Duration (s)'])) {
            const secs = parseFloat(row['duration_seconds'] || row['Duration (s)'] || '0');
            if (!isNaN(secs) && secs > 0) durMins = Math.round(secs / 60);
          }
          const endTimeStr = String(row['end_time'] || row['End Time'] || '').trim();
          if (durMins === 45 && startTimeStr && endTimeStr) {
            const sD = new Date(startTimeStr);
            const eD = new Date(endTimeStr);
            if (!isNaN(sD.getTime()) && !isNaN(eD.getTime()) && eD.getTime() > sD.getTime()) {
              durMins = Math.round((eD.getTime() - sD.getTime()) / 60000);
            }
          }

          sessionMap.set(workoutId, {
            workoutId,
            date,
            title,
            startTime: cleanStartTime,
            endTime: endTimeStr,
            durationMinutes: durMins,
            totalVolumeKg: parseFloat(row['total_volume_kg'] || row['Total Volume (kg)'] || '0') || 0,
            totalSets: parseInt(row['total_sets'] || row['Total Sets'] || '0', 10) || 0,
            avgHeartRateBpm: parseFloat(row['avg_hr_bpm'] || row['Avg Heart Rate (bpm)'] || row['Avg Heart Rate'] || '0') || undefined,
            maxHeartRateBpm: parseFloat(row['max_hr_bpm'] || row['Max Heart Rate (bpm)'] || row['Max Heart Rate'] || '0') || undefined,
            caloriesActualHr: parseFloat(row['calories'] || row['Calories (Actual / HR)'] || row['Calories'] || '0') || undefined,
            caloriesEstMet: parseFloat(row['Calories (Est. MET)'] || '0') || undefined,
            notes: rowNotes || undefined,
            exercises: []
          });
        }

        const session = sessionMap.get(workoutId)!;
        if (rowNotes && !session.notes) {
          session.notes = rowNotes;
        }

        // Support both official Hevy (exercise_title) and standard naming (exercise_name)
        const exerciseName = (row['exercise_title'] || row['exercise_name'] || row['Exercise Name'] || row['Exercise'] || row['exercise'] || '').trim();
        if (exerciseName) {
          let exGroup = session.exercises.find(e => e.exerciseName === exerciseName);
          if (!exGroup) {
            const targetMuscleGroup = row['target_muscle_group'] || row['Muscle Group'] || undefined;
            const equipment = row['equipment'] || row['Equipment'] || undefined;
            exGroup = { exerciseName, targetMuscleGroup, equipment, sets: [], notes: rowNotes || undefined };
            session.exercises.push(exGroup);
          } else if (rowNotes && !exGroup.notes) {
            exGroup.notes = rowNotes;
          }

          let weightKg = parseFloat(row['weight_kg'] || row['Weight (kg)'] || row['Weight'] || '0') || 0;
          if (weightKg === 0 && (row['weight_lbs'] || row['Weight (lbs)'])) {
            const lbs = parseFloat(row['weight_lbs'] || row['Weight (lbs)'] || '0');
            if (!isNaN(lbs) && lbs > 0) weightKg = Math.round(lbs * 0.45359237 * 10) / 10;
          }

          const reps = parseInt(row['reps'] || row['Reps'] || '0', 10) || 0;
          const rpe = parseFloat(row['rpe'] || row['RPE'] || '0') || undefined;
          const setNumber = parseInt(row['set_index'] || row['set_number'] || row['Set #'] || row['Set Order'] || String(exGroup.sets.length + 1), 10) || exGroup.sets.length + 1;
          const setTypeRaw = String(row['set_type'] || row['Set Type'] || row['Type'] || 'normal').toLowerCase();
          const setType: any = ['warmup', 'failure', 'drop', 'dropset', 'rest_pause'].includes(setTypeRaw) 
            ? (setTypeRaw === 'dropset' ? 'drop' : setTypeRaw) 
            : 'normal';

          exGroup.sets.push({
            setNumber,
            setType,
            weightKg,
            reps,
            rpe,
            setVolumeKg: weightKg * reps,
            durationSeconds: parseFloat(row['duration_seconds'] || row['Duration (s)'] || '0') || undefined,
            distanceMeters: parseFloat(row['distance_meters'] || row['Distance (m)'] || '0') || undefined
          });
        }
      });

      const workoutSessions = Array.from(sessionMap.values());
      // Calculate missing volumes or sets
      workoutSessions.forEach(session => {
        if (session.totalSets === 0) {
          session.totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
        }
        if (session.totalVolumeKg === 0) {
          const calculatedVolume = session.exercises.reduce((sum, ex) => 
            sum + ex.sets.reduce((sSum, s) => sSum + (s.setVolumeKg || (s.weightKg * s.reps)), 0)
          , 0);
          session.totalVolumeKg = Math.round(calculatedVolume);
        }
      });

      const convertedLogs = workoutSessions.map(convertWorkoutSessionToLogEntry);
      return {
        sourceType: 'workout_csv',
        workoutSessions,
        convertedLogs,
        summary: `Parsed ${rows.length} CSV rows into ${workoutSessions.length} workout sessions (${convertedLogs.length} logs)`
      };
    }

    // B. Health / Biometrics CSV (e.g. Health Connect, Health Data Exporter, Activity, Sleep, Vitals)
    const dailyMap = new Map<string, CanonicalDailyHealthRecord>();

    rows.forEach(row => {
      const rawDate = 
        (row['date'] && hasDateComponent(row['date']) ? row['date'] : null) ||
        (row['Date'] && hasDateComponent(row['Date']) ? row['Date'] : null) ||
        (row['Date/Time'] && hasDateComponent(row['Date/Time']) ? row['Date/Time'] : null) ||
        (row['Timestamp'] && hasDateComponent(row['Timestamp']) ? row['Timestamp'] : null) ||
        row['date'] || row['Date'] || row['Date/Time'] || row['Timestamp'] || row['start_time'];
      const date = normalizeDateStr(rawDate);
      if (!dailyMap.has(date)) {
        const rawSources = row['sources'] || row['Source(s)'] || row['source'] || 'HealthConnect';
        const sources = typeof rawSources === 'string' ? rawSources.split(';').map(s => s.trim()).filter(Boolean) : ['HealthConnect'];
        dailyMap.set(date, {
          date,
          sources: sources.length > 0 ? sources : ['HealthConnect'],
          activity: {},
          sleep: {},
          vitals: {},
          bodyMeasurements: {}
        });
      }
      const rec = dailyMap.get(date)!;

      // Activity columns
      const steps = parseInt(row['steps'] || row['Steps'] || '0', 10);
      if (steps > 0 || row['steps'] !== undefined || row['Steps'] !== undefined) {
        rec.activity = rec.activity || {};
        rec.activity.steps = steps;
      }
      const distance = parseFloat(row['distance_meters'] || row['Distance (m)'] || row['Distance'] || '0');
      if (distance > 0) {
        rec.activity = rec.activity || {};
        rec.activity.distanceMeters = distance;
      }
      const totalCal = parseFloat(row['total_calories_kcal'] || row['Total Calories (kcal)'] || '0');
      const activeCal = parseFloat(row['active_calories_kcal'] || row['Active Calories (kcal)'] || row['Calories'] || '0');
      if (totalCal > 0 || activeCal > 0) {
        rec.activity = rec.activity || {};
        if (totalCal > 0) rec.activity.totalCaloriesKcal = totalCal;
        if (activeCal > 0) rec.activity.activeCaloriesKcal = activeCal;
      }
      const activeMins = parseInt(row['active_duration_minutes'] || row['Active Time (min)'] || '0', 10);
      if (activeMins > 0) {
        rec.activity = rec.activity || {};
        rec.activity.activeDurationMinutes = activeMins;
      }
      const vo2Max = parseFloat(row['vo2_max_avg'] || row['VO2 max avg (ml/min/kg)'] || '0');
      if (vo2Max > 0) {
        rec.activity = rec.activity || {};
        rec.activity.vo2MaxMlKgMin = { avg: vo2Max };
      }

      // Sleep columns
      const totalSleep = parseInt(row['total_sleep_minutes'] || '0', 10);
      const lightSleep = parseInt(row['light_sleep_minutes'] || row['Light Sleep (min)'] || '0', 10);
      const deepSleep = parseInt(row['deep_sleep_minutes'] || row['Deep Sleep (min)'] || '0', 10);
      const remSleep = parseInt(row['rem_sleep_minutes'] || row['REM Sleep (min)'] || '0', 10);
      const awake = parseInt(row['awake_minutes'] || row['Awake (min)'] || '0', 10);
      const sleepScore = parseInt(row['sleep_efficiency_score'] || row['Sleep Score'] || '0', 10);

      if (totalSleep > 0 || lightSleep > 0 || deepSleep > 0 || remSleep > 0) {
        rec.sleep = rec.sleep || {};
        rec.sleep.lightSleepMinutes = lightSleep;
        rec.sleep.deepSleepMinutes = deepSleep;
        rec.sleep.remSleepMinutes = remSleep;
        rec.sleep.awakeMinutes = awake;
        rec.sleep.totalSleepMinutes = totalSleep > 0 ? totalSleep : (lightSleep + deepSleep + remSleep);
        if (sleepScore > 0) rec.sleep.sleepEfficiencyScore = sleepScore;
      }

      // Vitals columns
      const rhrMin = parseFloat(row['resting_hr_min'] || '0');
      const rhrMax = parseFloat(row['resting_hr_max'] || '0');
      const rhrAvg = parseFloat(row['resting_hr_avg'] || row['Resting heart rate avg (bpm)'] || '0');
      if (rhrAvg > 0 || rhrMin > 0 || rhrMax > 0) {
        rec.vitals = rec.vitals || {};
        rec.vitals.restingHeartRateBpm = {
          min: rhrMin > 0 ? rhrMin : undefined,
          max: rhrMax > 0 ? rhrMax : undefined,
          avg: rhrAvg > 0 ? rhrAvg : undefined
        };
      }
      const hrAvg = parseFloat(row['Heart rate avg (bpm)'] || '0');
      if (hrAvg > 0) {
        rec.vitals = rec.vitals || {};
        rec.vitals.heartRateBpm = { avg: hrAvg };
      }
      const hrvAvg = parseFloat(row['hrv_ms_avg'] || row['Heart rate variability avg (ms)'] || '0');
      if (hrvAvg > 0) {
        rec.vitals = rec.vitals || {};
        rec.vitals.heartRateVariabilityMs = { avg: hrvAvg };
      }
      const spo2Avg = parseFloat(row['oxygen_saturation_pct_avg'] || row['Oxygen saturation avg (%)'] || '0');
      if (spo2Avg > 0) {
        rec.vitals = rec.vitals || {};
        rec.vitals.oxygenSaturationPct = { avg: spo2Avg };
      }
      // Blood Pressure
      const sys = parseFloat(row['bp_systolic'] || '0');
      const dia = parseFloat(row['bp_diastolic'] || '0');
      const pulse = parseFloat(row['bp_pulse'] || '0');
      if (sys > 0 && dia > 0) {
        rec.vitals = rec.vitals || {};
        rec.vitals.bloodPressureMmHg = {
          systolic: sys,
          diastolic: dia,
          pulse: pulse > 0 ? pulse : undefined
        };
      }

      // Body Measurements
      const weight = parseFloat(row['weight_kg'] || row['Weight (kg)'] || row['Weight'] || '0');
      if (weight > 0) {
        rec.bodyMeasurements = rec.bodyMeasurements || {};
        rec.bodyMeasurements.weightKg = weight;
      }
      const bodyFat = parseFloat(row['body_fat_pct'] || row['Body Fat (%)'] || '0');
      if (bodyFat > 0) {
        rec.bodyMeasurements = rec.bodyMeasurements || {};
        rec.bodyMeasurements.bodyFatPct = bodyFat;
      }
      const leanMass = parseFloat(row['lean_body_mass_kg'] || row['Lean body mass (kg)'] || '0');
      if (leanMass > 0) {
        rec.bodyMeasurements = rec.bodyMeasurements || {};
        rec.bodyMeasurements.leanBodyMassKg = leanMass;
      }
    });

    const healthRecords = Array.from(dailyMap.values());
    const convertedLogs = healthRecords.flatMap(convertDailyHealthRecordToLogEntries);
    return {
      sourceType: 'health_csv',
      healthRecords,
      convertedLogs,
      summary: `Parsed ${rows.length} CSV rows into ${healthRecords.length} daily biometric records (${convertedLogs.length} logs)`
    };
  }

  return {
    sourceType: 'unknown',
    convertedLogs: [],
    summary: 'Unrecognized file format (must be valid JSON, CSV, or Excel format matching canonical schema)',
    error: 'Unrecognized structure'
  };
}

/**
 * Parses binary Excel workbook (.xlsx / .xls) buffer into canonical health/workout records
 * Supports both multi-sheet template formats:
 * 1. Health Data Exporter: Sheets ("Activity", "Body Measurements", "Sleep", "Vitals")
 * 2. Hevy / Gym Workout Exporter: Sheets ("Workout_Sessions", "Exercise_Sets_Log") or unified table
 */
export function parseExcelBuffer(filename: string, buffer: ArrayBuffer): ParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetNames = workbook.SheetNames;
    if (!sheetNames || sheetNames.length === 0) {
      return {
        sourceType: 'unknown',
        convertedLogs: [],
        summary: `Empty workbook in file: ${filename}`,
        error: 'Empty workbook'
      };
    }

    const lowerSheetNames = sheetNames.map(s => s.toLowerCase());
    const lowerName = filename.toLowerCase();

    // Check if it's a Hevy / Workout Excel workbook
    const hasWorkoutSheets = lowerSheetNames.some(s => s.includes('workout') || s.includes('exercise') || s.includes('set') || s.includes('hevy'));
    const isWorkoutFile = hasWorkoutSheets || lowerName.includes('hevy') || lowerName.includes('workout') || lowerName.includes('gym');

    if (isWorkoutFile) {
      // Look for sessions sheet and sets sheet, or parse all rows
      const sessionsSheetName = sheetNames.find(s => s.toLowerCase().includes('session') || s.toLowerCase().includes('workout')) || sheetNames[0];
      const setsSheetName = sheetNames.find(s => s.toLowerCase().includes('set') || s.toLowerCase().includes('exercise'));

      const sessionsSheet = workbook.Sheets[sessionsSheetName];
      const rawSessionRows: any[] = XLSX.utils.sheet_to_json(sessionsSheet);

      const sessionMap = new Map<string, CanonicalWorkoutSession>();

      // Parse sessions overview
      rawSessionRows.forEach(row => {
        const workoutId = String(row['Workout ID'] || row['workout_id'] || row['ID'] || row['Date'] || `session-${Date.now()}`);
        const date = String(row['Date'] || row['date'] || new Date().toISOString().split('T')[0]).split('T')[0];
        const title = row['Workout Title'] || row['Title'] || row['Name'] || row['title'] || 'Gym Workout';
        const duration = parseFloat(row['Duration (min)'] || row['Duration'] || row['duration'] || '45') || 45;
        const totalVolumeKg = parseFloat(row['Total Volume (kg)'] || row['Volume'] || '0') || 0;
        const totalSets = parseInt(row['Total Sets'] || row['Sets'] || '0', 10) || 0;
        const calories = parseFloat(row['Calories (kcal)'] || row['Calories'] || '0') || undefined;

        sessionMap.set(workoutId, {
          workoutId,
          date,
          title,
          durationMinutes: duration,
          totalVolumeKg,
          totalSets,
          caloriesActualHr: calories,
          notes: row['Notes'] || row['notes'] || undefined,
          exercises: []
        });
      });

      // Parse exercise sets if separate sheet or if combined in same sheet
      const setsSheet = setsSheetName ? workbook.Sheets[setsSheetName] : sessionsSheet;
      const rawSetRows: any[] = XLSX.utils.sheet_to_json(setsSheet);

      rawSetRows.forEach(row => {
        const workoutId = String(row['Workout ID'] || row['workout_id'] || row['ID'] || row['Date'] || '');
        let session = workoutId ? sessionMap.get(workoutId) : null;
        if (!session && sessionMap.size === 1) {
          session = Array.from(sessionMap.values())[0];
        }
        if (!session && (row['Date'] || row['Workout Title'])) {
          const fallbackId = String(row['Date'] || `session-${Date.now()}`);
          session = {
            workoutId: fallbackId,
            date: String(row['Date'] || new Date().toISOString().split('T')[0]).split('T')[0],
            title: row['Workout Title'] || row['Exercise Name'] || 'Gym Workout',
            durationMinutes: 45,
            totalVolumeKg: 0,
            totalSets: 0,
            exercises: []
          };
          sessionMap.set(fallbackId, session);
        }

        if (session) {
          const exerciseName = row['Exercise Name'] || row['Exercise'] || row['exercise'] || '';
          if (exerciseName) {
            let exGroup = session.exercises.find(e => e.exerciseName === exerciseName);
            if (!exGroup) {
              exGroup = { exerciseName, sets: [] };
              session.exercises.push(exGroup);
            }

            const weightKg = parseFloat(row['Weight (kg)'] || row['Weight'] || '0') || 0;
            const reps = parseInt(row['Reps'] || row['reps'] || '0', 10) || 0;
            const rpe = parseFloat(row['RPE'] || row['rpe'] || '0') || undefined;
            const setNumber = parseInt(row['Set #'] || row['Set Order'] || String(exGroup.sets.length + 1), 10) || exGroup.sets.length + 1;
            const setTypeRaw = String(row['Set Type'] || row['Type'] || 'normal').toLowerCase();
            const setType: any = ['warmup', 'failure', 'drop', 'rest_pause'].includes(setTypeRaw) ? setTypeRaw : 'normal';

            exGroup.sets.push({
              setNumber,
              setType,
              weightKg,
              reps,
              rpe,
              setVolumeKg: weightKg * reps,
              durationSeconds: parseFloat(row['Duration (s)'] || '0') || undefined,
              distanceMeters: parseFloat(row['Distance (m)'] || '0') || undefined
            });
          }
        }
      });

      const workoutSessions = Array.from(sessionMap.values());
      workoutSessions.forEach(session => {
        if (session.totalSets === 0) {
          session.totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
        }
        if (session.totalVolumeKg === 0) {
          session.totalVolumeKg = session.exercises.reduce((sum, ex) => 
            sum + ex.sets.reduce((sSum, s) => sSum + (s.setVolumeKg || (s.weightKg * s.reps)), 0)
          , 0);
        }
      });

      const convertedLogs = workoutSessions.map(convertWorkoutSessionToLogEntry);
      return {
        sourceType: 'excel_workbook',
        workoutSessions,
        convertedLogs,
        summary: `Parsed Excel workbook "${filename}" (${sheetNames.length} sheets) into ${workoutSessions.length} workout sessions (${convertedLogs.length} logs)`
      };
    }

    // Otherwise, parse as Health Data Exporter / Biometrics Workbook (Activity, Vitals, Sleep, Body Measurements)
    const dailyMap = new Map<string, CanonicalDailyHealthRecord>();

    sheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      const lowerSheet = sheetName.toLowerCase();

      rows.forEach(row => {
        const date = String(row['Date'] || row['date'] || row['Date/Time']?.split(' ')[0] || new Date().toISOString().split('T')[0]).split('T')[0];
        if (!dailyMap.has(date)) {
          dailyMap.set(date, {
            date,
            sources: [row['Source(s)'] || row['source'] || sheetName],
            activity: {},
            sleep: {},
            vitals: {},
            bodyMeasurements: {}
          });
        }
        const rec = dailyMap.get(date)!;

        // Activity metrics
        if (lowerSheet.includes('activity') || row['Steps'] || row['Total Calories (kcal)']) {
          rec.activity = rec.activity || {};
          if (row['Steps']) rec.activity.steps = parseInt(String(row['Steps']), 10);
          if (row['Distance (m)']) rec.activity.distanceMeters = parseFloat(String(row['Distance (m)']));
          if (row['Total Calories (kcal)']) rec.activity.totalCaloriesKcal = parseFloat(String(row['Total Calories (kcal)']));
          if (row['Active Calories (kcal)']) rec.activity.activeCaloriesKcal = parseFloat(String(row['Active Calories (kcal)']));
          if (row['VO2 max avg (ml/min/kg)']) rec.activity.vo2MaxMlKgMin = { avg: parseFloat(String(row['VO2 max avg (ml/min/kg)'])) };
        }

        // Sleep metrics
        if (lowerSheet.includes('sleep') || row['Light Sleep (min)'] || row['Deep Sleep (min)']) {
          rec.sleep = rec.sleep || {};
          if (row['Light Sleep (min)']) rec.sleep.lightSleepMinutes = parseFloat(String(row['Light Sleep (min)']));
          if (row['Deep Sleep (min)']) rec.sleep.deepSleepMinutes = parseFloat(String(row['Deep Sleep (min)']));
          if (row['REM Sleep (min)']) rec.sleep.remSleepMinutes = parseFloat(String(row['REM Sleep (min)']));
          if (row['Awake (min)']) rec.sleep.awakeMinutes = parseFloat(String(row['Awake (min)']));
          rec.sleep.totalSleepMinutes = (rec.sleep.lightSleepMinutes || 0) + (rec.sleep.deepSleepMinutes || 0) + (rec.sleep.remSleepMinutes || 0);
        }

        // Vitals metrics
        if (lowerSheet.includes('vital') || row['Heart rate avg (bpm)'] || row['Resting heart rate avg (bpm)']) {
          rec.vitals = rec.vitals || {};
          if (row['Heart rate avg (bpm)']) rec.vitals.heartRateBpm = { avg: parseFloat(String(row['Heart rate avg (bpm)'])) };
          if (row['Resting heart rate avg (bpm)']) rec.vitals.restingHeartRateBpm = { avg: parseFloat(String(row['Resting heart rate avg (bpm)'])) };
          if (row['Heart rate variability avg (ms)']) rec.vitals.heartRateVariabilityMs = { avg: parseFloat(String(row['Heart rate variability avg (ms)'])) };
          if (row['Oxygen saturation avg (%)']) rec.vitals.oxygenSaturationPct = { avg: parseFloat(String(row['Oxygen saturation avg (%)'])) };
        }

        // Body Measurements
        if (lowerSheet.includes('body') || lowerSheet.includes('measurement') || row['Weight (kg)']) {
          rec.bodyMeasurements = rec.bodyMeasurements || {};
          if (row['Weight (kg)']) rec.bodyMeasurements.weightKg = parseFloat(String(row['Weight (kg)']));
          if (row['Body Fat (%)']) rec.bodyMeasurements.bodyFatPct = parseFloat(String(row['Body Fat (%)']));
          if (row['Lean body mass (kg)']) rec.bodyMeasurements.leanBodyMassKg = parseFloat(String(row['Lean body mass (kg)']));
        }
      });
    });

    const healthRecords = Array.from(dailyMap.values());
    const convertedLogs = healthRecords.flatMap(convertDailyHealthRecordToLogEntries);

    return {
      sourceType: 'excel_workbook',
      healthRecords,
      convertedLogs,
      summary: `Parsed Excel workbook "${filename}" (${sheetNames.length} sheets) into ${healthRecords.length} daily biometric records (${convertedLogs.length} logs)`
    };
  } catch (err: any) {
    console.warn(`Failed to parse Excel buffer for ${filename}:`, err);
    return {
      sourceType: 'unknown',
      convertedLogs: [],
      summary: `Excel parsing error in ${filename}: ${err.message || 'Corrupt format'}`,
      error: err.message
    };
  }
}
