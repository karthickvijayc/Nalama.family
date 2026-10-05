import { HealthLogEntry, UserProfile, UserTargets, TrendMetricType, TrendTimeframe, TrendDataPoint, TrendMetricSummary } from '../types';

/**
 * Extracts numeric weight from a health log entry or its transcript.
 */
export function extractWeightFromLog(log: HealthLogEntry): number | null {
  if (typeof log.weight === 'number' && log.weight > 0) {
    return log.weight;
  }
  if (!log.transcript) return null;
  
  // Format: "• Weight: 75.4 kg" or "Weight: 75 kg"
  const m1 = log.transcript.match(/•?\s*Weight:\s*([0-9]+(?:\.[0-9]+)?)\s*kg/i);
  if (m1) {
    const val = parseFloat(m1[1]);
    if (!isNaN(val) && val >= 30 && val <= 300) return Math.round(val * 10) / 10;
  }
  // Format: "weighed 76.5 kg" or "weight is 76.5 kg"
  const m2 = log.transcript.match(/(?:weight|weigh(?:ed)?|⚖️)\s*(?:is|was|at|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:kg|kilos?)/i);
  if (m2) {
    const val = parseFloat(m2[1]);
    if (!isNaN(val) && val >= 30 && val <= 300) return Math.round(val * 10) / 10;
  }
  return null;
}

/**
 * Parses user profile weight string (e.g. "78 kg" -> 78).
 */
export function parseProfileWeight(weightStr?: string | number): number | null {
  if (!weightStr) return null;
  const num = parseFloat(String(weightStr).replace(/[^0-9.]/g, ''));
  return !isNaN(num) && num > 0 ? Math.round(num * 10) / 10 : null;
}

/**
 * Deterministic pseudo-random number generator for smooth, consistent baseline variations.
 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Generates dates between start and end (inclusive).
 */
function getDatesInRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const curr = new Date(startDate);
  curr.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (curr <= end) {
    dates.push(new Date(curr));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

/**
 * Formats a Date to YYYY-MM-DD.
 */
function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Formats date label for chart axis.
 */
function formatShortDate(d: Date, timeframe: TrendTimeframe): string {
  if (timeframe === 'month') {
    return `${d.getDate()}`;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Core engine that aggregates real logs and pregenerates realistic baseline trends
 * for missing historical dates across Month, 3M, 6M, and 12M timeframes.
 */
export function generateTrendMetrics(
  metric: TrendMetricType,
  timeframe: TrendTimeframe,
  logs: HealthLogEntry[],
  userProfile?: UserProfile | null
): TrendMetricSummary {
  const now = new Date();
  const todayKey = formatDateKey(now);

  // 1. Establish timeframe date boundaries
  let startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  if (timeframe === 'month') {
    // Current month: 1st of month to today (or end of month)
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (timeframe === '3m') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 90);
  } else if (timeframe === '6m') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 180);
  } else if (timeframe === '12m') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 365);
  }

  // 2. Extract targets & baseline references
  const targets = userProfile?.userTargets;
  const profileWeight = parseProfileWeight(userProfile?.weight) || 75;
  const targetWeight = parseProfileWeight(targets?.weight) || (profileWeight > 70 ? profileWeight - 3 : profileWeight);
  const targetSteps = targets?.steps || 10000;
  const targetActiveTime = targets?.activeTimeMins || 30;
  const targetHR = targets?.restingHeartRate || 70;
  const targetCalories = targets?.calories || 2200;
  const targetSleep = 8;
  const targetTasks = 100;

  // 3. Map real logs by dateKey
  const dailyRealData = new Map<string, {
    steps?: number;
    activeMins?: number;
    hcActiveMins?: number;
    workoutActiveMins?: number;
    heartRate?: number;
    weight?: number;
    caloriesBurned?: number;
    caloriesConsumed?: number;
    sleepHours?: number;
    tasksPct?: number;
  }>();

  let hasRealLogsForMetric = false;

  logs.forEach((log) => {
    if (!log.timestamp) return;
    const d = new Date(log.timestamp);
    if (isNaN(d.getTime())) return;
    const dateKey = formatDateKey(d);

    let dayEntry = dailyRealData.get(dateKey);
    if (!dayEntry) {
      dayEntry = {};
      dailyRealData.set(dateKey, dayEntry);
    }

    // Steps
    if (typeof log.steps === 'number' && log.steps > 0) {
      dayEntry.steps = Math.max(dayEntry.steps || 0, log.steps);
      if (metric === 'steps') hasRealLogsForMetric = true;
    } else if (log.transcript) {
      const stepMatch = log.transcript.match(/([\d,]+)\s*steps/i);
      if (stepMatch) {
        const val = parseInt(stepMatch[1].replace(/,/g, ''), 10);
        if (!isNaN(val) && val > 0) {
          dayEntry.steps = Math.max(dayEntry.steps || 0, val);
          if (metric === 'steps') hasRealLogsForMetric = true;
        }
      }
    }

    // Active minutes (Health Connect activity vs gym workout deduplication)
    const isHealthConnectActivity = log.id?.startsWith('import-activity-') || 
      log.headline === 'Daily Step Activity' || 
      log.transcript?.includes('Daily Activity:');

    let logMins = 0;
    if (typeof log.activeMinutes === 'number' && log.activeMinutes > 0) {
      logMins = log.activeMinutes;
    } else if (log.category === 'workout' && log.transcript) {
      const minMatch = log.transcript.match(/(\d+)\s*(?:mins|minutes)/i);
      if (minMatch) {
        const val = parseInt(minMatch[1], 10);
        if (!isNaN(val) && val > 0) logMins = val;
      }
    }

    if (logMins > 0) {
      if (isHealthConnectActivity) {
        dayEntry.hcActiveMins = Math.max(dayEntry.hcActiveMins || 0, logMins);
      } else {
        dayEntry.workoutActiveMins = (dayEntry.workoutActiveMins || 0) + logMins;
      }
      dayEntry.activeMins = dayEntry.hcActiveMins !== undefined ? dayEntry.hcActiveMins : dayEntry.workoutActiveMins;
      if (metric === 'active_time') hasRealLogsForMetric = true;
    }

    // Heart rate
    if (typeof log.restingHeartRate === 'number' && log.restingHeartRate > 0) {
      dayEntry.heartRate = log.restingHeartRate;
      if (metric === 'heart_rate') hasRealLogsForMetric = true;
    } else if (typeof log.heartRate === 'number' && log.heartRate > 0 && !dayEntry.heartRate) {
      dayEntry.heartRate = log.heartRate;
      if (metric === 'heart_rate') hasRealLogsForMetric = true;
    } else if (log.transcript && !dayEntry.heartRate) {
      const hrMatch = log.transcript.match(/(\d{2,3})\s*bpm/i);
      if (hrMatch) {
        const parsed = parseInt(hrMatch[1], 10);
        if (!isNaN(parsed) && parsed >= 40 && parsed <= 200) {
          dayEntry.heartRate = parsed;
          if (metric === 'heart_rate') hasRealLogsForMetric = true;
        }
      }
    }

    // Weight
    const w = extractWeightFromLog(log);
    if (w !== null) {
      dayEntry.weight = w;
      if (metric === 'weight') hasRealLogsForMetric = true;
    }

    // Calories
    if (log.category === 'workout') {
      const calBurn = typeof log.caloriesBurned === 'number' ? log.caloriesBurned : (typeof log.calories === 'number' ? log.calories : undefined);
      if (calBurn && calBurn > 0) {
        dayEntry.caloriesBurned = (dayEntry.caloriesBurned || 0) + calBurn;
        if (metric === 'calories') hasRealLogsForMetric = true;
      }
    } else if (log.category === 'meal') {
      if (typeof log.calories === 'number' && log.calories > 0) {
        dayEntry.caloriesConsumed = (dayEntry.caloriesConsumed || 0) + log.calories;
        if (metric === 'calories') hasRealLogsForMetric = true;
      }
    }

    // Sleep
    if (typeof log.sleepHours === 'number' && log.sleepHours > 0) {
      dayEntry.sleepHours = log.sleepHours;
      if (metric === 'sleep') hasRealLogsForMetric = true;
    } else if (log.transcript && !dayEntry.sleepHours) {
      const sleepMatch = log.transcript.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours)\s*(?:total\s*)?sleep/i);
      if (sleepMatch) {
        const parsed = parseFloat(sleepMatch[1]);
        if (!isNaN(parsed) && parsed > 0) {
          dayEntry.sleepHours = parsed;
          if (metric === 'sleep') hasRealLogsForMetric = true;
        }
      }
    }
  });

  // 4. Generate daily timeline points across the range
  const allDates = getDatesInRange(startDate, now);
  const rawPoints: TrendDataPoint[] = [];
  let hasPregeneratedData = false;

  allDates.forEach((date, index) => {
    const key = formatDateKey(date);
    const dayData = dailyRealData.get(key);
    const daySeed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    const dayOfWeek = date.getDay(); // 0 is Sunday, 6 is Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    let val = 0;
    let secVal: number | undefined = undefined;
    let target = 0;
    let isEstimated = false;

    switch (metric) {
      case 'steps':
        target = targetSteps;
        if (dayData?.steps !== undefined) {
          val = dayData.steps;
        } else {
          // Synthetic baseline steps around target with natural weekday/weekend variance
          isEstimated = true;
          hasPregeneratedData = true;
          const variance = (pseudoRandom(daySeed) - 0.45) * 3500;
          const weekendFactor = isWeekend ? -1200 : 400;
          val = Math.max(3200, Math.round(targetSteps + variance + weekendFactor));
        }
        break;

      case 'active_time':
        target = targetActiveTime;
        if (dayData?.activeMins !== undefined) {
          val = dayData.activeMins;
        } else {
          isEstimated = true;
          hasPregeneratedData = true;
          const rand = pseudoRandom(daySeed);
          // ~4 days a week active workout, rest days light movement
          const isWorkoutDay = rand > 0.35;
          val = isWorkoutDay ? Math.round(targetActiveTime + (rand - 0.5) * 25) : Math.round(10 + rand * 10);
        }
        break;

      case 'heart_rate':
        target = targetHR;
        if (dayData?.heartRate !== undefined) {
          val = dayData.heartRate;
        } else {
          isEstimated = true;
          hasPregeneratedData = true;
          const rand = pseudoRandom(daySeed);
          val = Math.round(targetHR + (rand - 0.5) * 6);
        }
        break;

      case 'weight':
        target = targetWeight;
        if (dayData?.weight !== undefined) {
          val = dayData.weight;
        } else {
          isEstimated = true;
          hasPregeneratedData = true;
          // Smooth progressive trajectory from baseline profile weight towards target weight over time
          const progress = index / Math.max(1, allDates.length - 1);
          const baseTrajectory = profileWeight - (profileWeight - targetWeight) * 0.4 * progress;
          // Subtle physiological water weight variance ±0.3kg
          const noise = (pseudoRandom(daySeed) - 0.5) * 0.6;
          val = Math.round((baseTrajectory + noise) * 10) / 10;
        }
        break;

      case 'calories':
        target = targetCalories;
        const burn = dayData?.caloriesBurned;
        const intake = dayData?.caloriesConsumed;

        if (burn !== undefined || intake !== undefined) {
          val = burn || 0;
          secVal = intake || 0;
        } else {
          isEstimated = true;
          hasPregeneratedData = true;
          const rand1 = pseudoRandom(daySeed);
          const rand2 = pseudoRandom(daySeed + 7);
          val = Math.round(350 + rand1 * 450); // Burned
          secVal = Math.round(targetCalories * 0.9 + (rand2 - 0.5) * 400); // Consumed
        }
        break;

      case 'sleep':
        target = targetSleep;
        if (dayData?.sleepHours !== undefined) {
          val = dayData.sleepHours;
        } else {
          isEstimated = true;
          hasPregeneratedData = true;
          const rand = pseudoRandom(daySeed);
          val = Math.round((7.2 + (rand - 0.5) * 1.6) * 10) / 10;
        }
        break;

      case 'tasks':
        target = targetTasks;
        if (dayData?.tasksPct !== undefined) {
          val = dayData.tasksPct;
        } else {
          isEstimated = true;
          hasPregeneratedData = true;
          const rand = pseudoRandom(daySeed);
          val = Math.round(75 + rand * 25);
        }
        break;
    }

    rawPoints.push({
      date: key,
      label: formatShortDate(date, timeframe),
      fullDateLabel: formatFullDate(date),
      timestamp: date.getTime(),
      value: val,
      secondaryValue: secVal,
      target,
      isEstimated
    });
  });

  // 5. Downsample / Group points for 3M, 6M, 12M to prevent overcrowded charts
  let displayPoints: TrendDataPoint[] = rawPoints;

  if (timeframe === '3m' && rawPoints.length > 20) {
    // Group by ~4 days
    displayPoints = aggregatePoints(rawPoints, 4);
  } else if (timeframe === '6m' && rawPoints.length > 25) {
    // Group weekly (7 days)
    displayPoints = aggregatePoints(rawPoints, 7);
  } else if (timeframe === '12m' && rawPoints.length > 30) {
    // Group bi-weekly (14 days)
    displayPoints = aggregatePoints(rawPoints, 14);
  }

  // 6. Calculate statistics
  const values = displayPoints.map(p => p.value);
  const currentVal = values.length > 0 ? values[values.length - 1] : null;
  const avgVal = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  const minVal = values.length > 0 ? Math.min(...values) : null;
  const maxVal = values.length > 0 ? Math.max(...values) : null;
  const firstVal = values.length > 0 ? values[0] : 0;
  const delta = (currentVal !== null && firstVal !== null) ? currentVal - firstVal : 0;

  const unitMap: Record<TrendMetricType, string> = {
    steps: 'steps',
    active_time: 'mins',
    heart_rate: 'bpm',
    weight: 'kg',
    calories: 'kcal',
    sleep: 'hrs',
    tasks: '%'
  };

  const titleMap: Record<TrendMetricType, string> = {
    steps: 'Daily Steps',
    active_time: 'Active Time',
    heart_rate: 'Resting Heart Rate',
    weight: 'Body Weight',
    calories: 'Calories Balance',
    sleep: 'Sleep & Recovery',
    tasks: 'Daily Task Completion'
  };

  const isWeight = metric === 'weight';
  const isSleep = metric === 'sleep';

  const formatNumber = (val: number | null): string => {
    if (val === null) return '-';
    if (isWeight || isSleep) {
      return (Math.round(val * 10) / 10).toFixed(1);
    }
    return Math.round(val).toLocaleString();
  };

  // Delta text logic
  let deltaText = '';
  let deltaPositive: boolean | null = null;
  if (Math.abs(delta) < 0.05) {
    deltaText = 'Stable over period';
    deltaPositive = null;
  } else if (delta > 0) {
    deltaText = `+${formatNumber(delta)} ${unitMap[metric]} over period`;
    deltaPositive = metric === 'weight' ? false : true;
  } else {
    deltaText = `${formatNumber(delta)} ${unitMap[metric]} over period`;
    deltaPositive = metric === 'weight' ? true : false;
  }

  let targetValNum: number | null = null;
  switch (metric) {
    case 'steps': targetValNum = targetSteps; break;
    case 'active_time': targetValNum = targetActiveTime; break;
    case 'heart_rate': targetValNum = targetHR; break;
    case 'weight': targetValNum = targetWeight; break;
    case 'calories': targetValNum = targetCalories; break;
    case 'sleep': targetValNum = targetSleep; break;
    case 'tasks': targetValNum = targetTasks; break;
  }

  return {
    metric,
    title: titleMap[metric],
    unit: unitMap[metric],
    currentValue: currentVal,
    currentFormatted: formatNumber(currentVal),
    averageValue: avgVal,
    averageFormatted: formatNumber(avgVal),
    minValue: minVal,
    minFormatted: formatNumber(minVal),
    maxValue: maxVal,
    maxFormatted: formatNumber(maxVal),
    targetValue: targetValNum,
    targetFormatted: formatNumber(targetValNum),
    deltaText,
    deltaPositive,
    points: displayPoints,
    hasRealData: hasRealLogsForMetric,
    hasPregeneratedData
  };
}

/**
 * Aggregates high-frequency points into evenly spaced chunks.
 */
function aggregatePoints(points: TrendDataPoint[], chunkSize: number): TrendDataPoint[] {
  const result: TrendDataPoint[] = [];
  for (let i = 0; i < points.length; i += chunkSize) {
    const chunk = points.slice(i, i + chunkSize);
    const midPoint = chunk[Math.floor(chunk.length / 2)];
    const avgVal = chunk.reduce((sum, p) => sum + p.value, 0) / chunk.length;
    const hasSec = chunk.some(p => p.secondaryValue !== undefined);
    const avgSec = hasSec ? chunk.reduce((sum, p) => sum + (p.secondaryValue || 0), 0) / chunk.length : undefined;
    const isEstimated = chunk.every(p => p.isEstimated);

    result.push({
      date: midPoint.date,
      label: midPoint.label,
      fullDateLabel: midPoint.fullDateLabel,
      timestamp: midPoint.timestamp,
      value: Math.round(avgVal * 10) / 10,
      secondaryValue: avgSec !== undefined ? Math.round(avgSec * 10) / 10 : undefined,
      target: midPoint.target,
      isEstimated
    });
  }
  return result;
}
