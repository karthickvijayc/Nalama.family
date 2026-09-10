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
 * Parses simple CSV content into headers and row objects
 */
export function parseCSV(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };

  // Parse CSV line taking quotes into account
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const rawHeaders = parseLine(lines[0]);
  const cleanHeaders = rawHeaders.map(h => h.replace(/^["']|["']$/g, '').trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
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
  const sessionDateStr = session.date || new Date().toISOString().split('T')[0];
  const dateParts = sessionDateStr.split('-');
  const year = parseInt(dateParts[0], 10) || new Date().getFullYear();
  const month = parseInt(dateParts[1], 10) - 1 || new Date().getMonth();
  const day = parseInt(dateParts[2], 10) || new Date().getDate();

  let startHour = 8;
  let startMin = 0;
  if (session.startTime) {
    const timeMatch = session.startTime.match(/(\d+):(\d+)/);
    if (timeMatch) {
      startHour = parseInt(timeMatch[1], 10);
      startMin = parseInt(timeMatch[2], 10);
    }
  }

  const d = new Date(year, month, day, startHour, startMin);
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
    return `${ex.exerciseName} (${setCount} sets${weightStr}${topReps ? `, ${topReps} reps` : ''})`;
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
  if (session.notes) {
    detailLines.push(`• Notes: "${session.notes}"`);
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
    source: 'manual',
    headline,
    caloriesBurned: session.caloriesActualHr || session.caloriesEstMet || Math.round((session.durationMinutes || 45) * 6),
    activeMinutes: session.durationMinutes || 45,
    timeBucket,
    processed: true
  };
}

/**
 * Ingests and converts a Canonical Daily Health Record into structured HealthLogEntries (Vitals, Sleep, Activity)
 */
export function convertDailyHealthRecordToLogEntries(record: CanonicalDailyHealthRecord): HealthLogEntry[] {
  const entries: HealthLogEntry[] = [];
  const dateStr = record.date || new Date().toISOString().split('T')[0];
  const dateParts = dateStr.split('-');
  const year = parseInt(dateParts[0], 10) || new Date().getFullYear();
  const month = parseInt(dateParts[1], 10) - 1 || new Date().getMonth();
  const day = parseInt(dateParts[2], 10) || new Date().getDate();

  // 1. Sleep Log Entry (Classified as Morning reflection of previous night)
  if (record.sleep && (record.sleep.totalSleepMinutes || record.sleep.deepSleepMinutes)) {
    const sleepDate = new Date(year, month, day, 7, 0);
    const totalHours = ((record.sleep.totalSleepMinutes || 0) / 60).toFixed(1);
    const deepMins = record.sleep.deepSleepMinutes || 0;
    const remMins = record.sleep.remSleepMinutes || 0;
    const lightMins = record.sleep.lightSleepMinutes || 0;
    const efficiency = record.sleep.sleepEfficiencyScore ? ` | Efficiency: ${record.sleep.sleepEfficiencyScore}%` : '';
    
    const lines = [
      `😴 Sleep Summary: ${totalHours} hrs total sleep`,
      `• Stages: Deep: ${deepMins}m, REM: ${remMins}m, Light: ${lightMins}m${efficiency}`
    ];
    if (record.sleep.sleepScore) {
      lines.push(`• Sleep Quality Score: ${record.sleep.sleepScore}/100`);
    }

    entries.push({
      id: `import-sleep-${dateStr}`,
      timestamp: sleepDate.toISOString(),
      displayTime: formatDisplayTime(sleepDate),
      displayDate: formatDisplayDate(sleepDate),
      transcript: lines.join('\n'),
      category: 'general',
      source: 'manual',
      headline: 'Sleep Architecture',
      timeBucket: 'Morning',
      processed: true
    });
  }

  // 2. Daily Steps & Activity Entry
  if (record.activity && (record.activity.steps || record.activity.activeCaloriesKcal || record.activity.activeDurationMinutes)) {
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
      timestamp: actDate.toISOString(),
      displayTime: formatDisplayTime(actDate),
      displayDate: formatDisplayDate(actDate),
      transcript: lines.join('\n'),
      category: 'workout',
      source: 'manual',
      headline: 'Daily Step Activity',
      caloriesBurned: activeCal,
      activeMinutes: activeMins,
      timeBucket: 'Evening',
      processed: true
    });
  }

  // 3. Vitals & Biometrics Entry
  if (record.vitals && (record.vitals.restingHeartRateBpm || record.vitals.bloodPressureMmHg || record.vitals.heartRateVariabilityMs || record.vitals.oxygenSaturationPct)) {
    const vitDate = new Date(year, month, day, 9, 30);
    const lines: string[] = [`🩺 Biometric Vitals Sync:`];
    
    if (record.vitals.restingHeartRateBpm?.avg || record.vitals.restingHeartRateBpm?.min) {
      const rhr = record.vitals.restingHeartRateBpm.avg || record.vitals.restingHeartRateBpm.min;
      lines.push(`• Resting Heart Rate: ${rhr} bpm`);
    }
    if (record.vitals.heartRateVariabilityMs?.avg || record.vitals.hrvRmssdMs?.avg) {
      const hrv = record.vitals.heartRateVariabilityMs?.avg || record.vitals.hrvRmssdMs?.avg;
      lines.push(`• Heart Rate Variability (HRV): ${hrv} ms`);
    }
    if (record.vitals.oxygenSaturationPct?.avg) {
      lines.push(`• Blood Oxygen (SpO2): ${record.vitals.oxygenSaturationPct.avg.toFixed(0)}%`);
    }
    if (record.vitals.bloodPressureMmHg?.systolic && record.vitals.bloodPressureMmHg?.diastolic) {
      lines.push(`• Blood Pressure: ${record.vitals.bloodPressureMmHg.systolic}/${record.vitals.bloodPressureMmHg.diastolic} mmHg`);
    }
    if (record.vitals.bloodGlucoseMmolL?.avg) {
      lines.push(`• Blood Glucose: ${record.vitals.bloodGlucoseMmolL.avg} mmol/L`);
    }

    entries.push({
      id: `import-vitals-${dateStr}`,
      timestamp: vitDate.toISOString(),
      displayTime: formatDisplayTime(vitDate),
      displayDate: formatDisplayDate(vitDate),
      transcript: lines.join('\n'),
      category: 'event',
      source: 'manual',
      headline: 'Vitals & Biomarkers',
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
      timestamp: bodyDate.toISOString(),
      displayTime: formatDisplayTime(bodyDate),
      displayDate: formatDisplayDate(bodyDate),
      transcript: lines.join('\n'),
      category: 'event',
      source: 'manual',
      headline: 'Body Measurements',
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
      const data = JSON.parse(trimmed);

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
    } catch (err: any) {
      console.warn('JSON parsing attempt failed, checking CSV:', err);
    }
  }

  // 2. CSV Parsing
  const { headers, rows } = parseCSV(rawContent);
  if (headers.length > 0 && rows.length > 0) {
    const headerStr = headers.join(' ').toLowerCase();

    // A. Workout CSV (e.g., Hevy, Strong, FitNotes)
    // Headers typically contain: Date, Workout Title, Exercise Name, Set #, Weight, Reps
    if (
      headerStr.includes('workout') || 
      headerStr.includes('exercise') || 
      headerStr.includes('set') || 
      lowerName.includes('hevy') || 
      lowerName.includes('workout') || 
      lowerName.includes('strong')
    ) {
      // Group rows by workout title + date
      const sessionMap = new Map<string, CanonicalWorkoutSession>();

      rows.forEach((row, idx) => {
        const date = row['Date'] || row['date'] || row['Start Date'] || new Date().toISOString().split('T')[0];
        const title = row['Workout Title'] || row['Workout Name'] || row['title'] || 'Gym Workout';
        const workoutId = row['Hevy Workout ID'] || row['Workout ID'] || `${date}-${title.replace(/\s+/g, '_')}`;

        if (!sessionMap.has(workoutId)) {
          sessionMap.set(workoutId, {
            workoutId,
            date,
            title,
            startTime: row['Start Time'] || row['start_time'] || '08:00',
            endTime: row['End Time'] || row['end_time'] || '',
            durationMinutes: parseFloat(row['Duration (min)'] || row['duration'] || '45') || 45,
            totalVolumeKg: parseFloat(row['Total Volume (kg)'] || '0') || 0,
            totalSets: parseInt(row['Total Sets'] || '0', 10) || 0,
            avgHeartRateBpm: parseFloat(row['Avg Heart Rate (bpm)'] || row['Avg Heart Rate'] || '0') || undefined,
            maxHeartRateBpm: parseFloat(row['Max Heart Rate (bpm)'] || row['Max Heart Rate'] || '0') || undefined,
            caloriesActualHr: parseFloat(row['Calories (Actual / HR)'] || row['Calories'] || '0') || undefined,
            caloriesEstMet: parseFloat(row['Calories (Est. MET)'] || '0') || undefined,
            notes: row['Workout Notes'] || row['Notes'] || undefined,
            exercises: []
          });
        }

        const session = sessionMap.get(workoutId)!;
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
          const setTypeRaw = (row['Set Type'] || row['Type'] || 'normal').toLowerCase();
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
      });

      const workoutSessions = Array.from(sessionMap.values());
      // Calculate missing volumes or sets
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
        sourceType: 'workout_csv',
        workoutSessions,
        convertedLogs,
        summary: `Parsed ${rows.length} CSV rows into ${workoutSessions.length} workout sessions (${convertedLogs.length} logs)`
      };
    }

    // B. Health / Biometrics CSV (e.g. Health Data Exporter, Activity, Sleep, Vitals)
    const dailyMap = new Map<string, CanonicalDailyHealthRecord>();

    rows.forEach(row => {
      const date = row['Date'] || row['date'] || row['Date/Time']?.split(' ')[0] || new Date().toISOString().split('T')[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, {
          date,
          sources: [row['Source(s)'] || row['source'] || 'CSV_Import'],
          activity: {},
          sleep: {},
          vitals: {},
          bodyMeasurements: {}
        });
      }
      const rec = dailyMap.get(date)!;

      // Activity columns
      if (row['Steps'] || row['steps']) {
        rec.activity = rec.activity || {};
        rec.activity.steps = parseInt(row['Steps'] || row['steps'] || '0', 10);
      }
      if (row['Distance (m)'] || row['Distance']) {
        rec.activity = rec.activity || {};
        rec.activity.distanceMeters = parseFloat(row['Distance (m)'] || row['Distance'] || '0');
      }
      if (row['Total Calories (kcal)'] || row['Active Calories (kcal)'] || row['Calories']) {
        rec.activity = rec.activity || {};
        rec.activity.totalCaloriesKcal = parseFloat(row['Total Calories (kcal)'] || '0');
        rec.activity.activeCaloriesKcal = parseFloat(row['Active Calories (kcal)'] || row['Calories'] || '0');
      }
      if (row['VO2 max avg (ml/min/kg)']) {
        rec.activity = rec.activity || {};
        rec.activity.vo2MaxMlKgMin = { avg: parseFloat(row['VO2 max avg (ml/min/kg)']) };
      }

      // Sleep columns
      if (row['Light Sleep (min)'] || row['Deep Sleep (min)'] || row['REM Sleep (min)']) {
        rec.sleep = rec.sleep || {};
        rec.sleep.lightSleepMinutes = parseFloat(row['Light Sleep (min)'] || '0');
        rec.sleep.deepSleepMinutes = parseFloat(row['Deep Sleep (min)'] || '0');
        rec.sleep.remSleepMinutes = parseFloat(row['REM Sleep (min)'] || '0');
        rec.sleep.awakeMinutes = parseFloat(row['Awake (min)'] || '0');
        rec.sleep.totalSleepMinutes = (rec.sleep.lightSleepMinutes || 0) + (rec.sleep.deepSleepMinutes || 0) + (rec.sleep.remSleepMinutes || 0);
      }

      // Vitals columns
      if (row['Heart rate avg (bpm)'] || row['Resting heart rate avg (bpm)']) {
        rec.vitals = rec.vitals || {};
        if (row['Heart rate avg (bpm)']) rec.vitals.heartRateBpm = { avg: parseFloat(row['Heart rate avg (bpm)']) };
        if (row['Resting heart rate avg (bpm)']) rec.vitals.restingHeartRateBpm = { avg: parseFloat(row['Resting heart rate avg (bpm)']) };
      }
      if (row['Heart rate variability avg (ms)']) {
        rec.vitals = rec.vitals || {};
        rec.vitals.heartRateVariabilityMs = { avg: parseFloat(row['Heart rate variability avg (ms)']) };
      }
      if (row['Oxygen saturation avg (%)']) {
        rec.vitals = rec.vitals || {};
        rec.vitals.oxygenSaturationPct = { avg: parseFloat(row['Oxygen saturation avg (%)']) };
      }

      // Body Measurements
      if (row['Weight (kg)'] || row['Weight']) {
        rec.bodyMeasurements = rec.bodyMeasurements || {};
        rec.bodyMeasurements.weightKg = parseFloat(row['Weight (kg)'] || row['Weight'] || '0');
      }
      if (row['Body Fat (%)']) {
        rec.bodyMeasurements = rec.bodyMeasurements || {};
        rec.bodyMeasurements.bodyFatPct = parseFloat(row['Body Fat (%)']);
      }
      if (row['Lean body mass (kg)']) {
        rec.bodyMeasurements = rec.bodyMeasurements || {};
        rec.bodyMeasurements.leanBodyMassKg = parseFloat(row['Lean body mass (kg)']);
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
