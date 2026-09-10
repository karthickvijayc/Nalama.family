/**
 * Canonical Schema for External Health, Biometrics, and Gym Workout Ingestion
 * 
 * Generic, highly extensible, and future-proofed across all common platforms:
 * - Android Health Connect / Health Data Exporter / Samsung Health / Google Fit
 * - iOS Apple Health / HealthKit / Auto Export / Shortcuts
 * - Smart Wearables & Rings: Oura, Whoop, Garmin, Fitbit, Polar, Withings, Apple Watch, Galaxy Watch
 * - Resistance & Gym Trackers: Hevy, Strong, FitNotes, JEFIT, Boostcamp, RepCount, Caliber
 * - Glucose & CGM / Vitals: Dexcom, Abbott FreeStyle Libre, Omron Blood Pressure, KardiaMobile ECG
 */

export interface CanonicalHealthExport {
  exportVersion: "1.0" | "2.0";
  sourceApp: string; // e.g., "HealthConnect", "AppleHealth", "SamsungHealth", "Garmin", "Oura", "Whoop", "Fitbit", "CustomScript"
  timezone?: string; // e.g., "Asia/Kolkata", "America/New_York"
  exportedAt: string; // ISO 8601
  dailyRecords: CanonicalDailyHealthRecord[];
}

export interface MinMaxAvg<T = number> {
  min?: T;
  max?: T;
  avg?: T;
  median?: T;
  samplesCount?: number;
}

export interface CanonicalDailyHealthRecord {
  date: string; // "YYYY-MM-DD"
  sources?: string[]; // e.g., ["com.sec.android.app.shealth", "com.google.android.apps.fitness", "com.apple.Health"]
  timezone?: string;

  // 1. Activity & Energy
  activity?: {
    steps?: number;
    distanceMeters?: number;
    elevationMeters?: number;
    floorsClimbed?: number;
    totalCaloriesKcal?: number;
    activeCaloriesKcal?: number;
    basalCaloriesKcal?: number;
    activeDurationMinutes?: number;
    sedentaryMinutes?: number;
    wheelchairPushes?: number;
    cyclingDistanceMeters?: number;
    swimmingDistanceMeters?: number;
    powerWatts?: MinMaxAvg;
    speedMps?: MinMaxAvg;
    cadenceRpm?: MinMaxAvg;
    vo2MaxMlKgMin?: MinMaxAvg;
    exerciseSessionsCount?: number;
  };

  // 2. Sleep Architecture & Recovery
  sleep?: {
    startTime?: string; // ISO or "YYYY-MM-DDTHH:mm:ss"
    endTime?: string;
    totalSleepMinutes?: number; // Time asleep
    timeInBedMinutes?: number;
    lightSleepMinutes?: number;
    deepSleepMinutes?: number;
    remSleepMinutes?: number;
    awakeMinutes?: number;
    sleepEfficiencyScore?: number; // 0 - 100 percentage
    sleepScore?: number; // Wearable score (0-100)
    readinessScore?: number; // Recovery / Readiness (e.g. Oura/Whoop 0-100)
    snoringMinutes?: number;
    skinTemperatureDeviationCelsius?: number; // Baseline delta
  };

  // 3. Cardiovascular & Vitals
  vitals?: {
    heartRateBpm?: MinMaxAvg;
    restingHeartRateBpm?: MinMaxAvg;
    walkingHeartRateAvgBpm?: number;
    heartRateVariabilityMs?: MinMaxAvg; // SDNN or RMSSD in ms
    hrvRmssdMs?: MinMaxAvg;
    hrvSdnnMs?: MinMaxAvg;
    oxygenSaturationPct?: MinMaxAvg; // SpO2 (e.g. 95-100%)
    respiratoryRateBreathsPerMin?: MinMaxAvg;
    bloodPressureMmHg?: {
      systolic?: number;
      diastolic?: number;
      pulse?: number;
      category?: string; // "normal", "elevated", "hypertension_stage1", "hypertension_stage2"
    };
    bloodGlucoseMmolL?: MinMaxAvg & {
      fasting?: boolean;
      postPrandial?: boolean;
      unit?: "mmol/L" | "mg/dL";
      valueMgDl?: number;
    };
    bodyTemperatureCelsius?: number;
    hydrationMl?: number;
    stressLevel?: {
      score?: number; // 0-100
      status?: "low" | "medium" | "high" | "rest";
    };
  };

  // 4. Body Composition & Anthropometry
  bodyMeasurements?: {
    timestamp?: string;
    weightKg?: number;
    heightMeters?: number;
    bmi?: number;
    bodyFatPct?: number;
    leanBodyMassKg?: number;
    boneMassKg?: number;
    muscleMassKg?: number;
    visceralFatLevel?: number;
    bodyWaterPct?: number;
    waistCircumferenceCm?: number;
  };

  // 5. Environmental & Mindful Wellbeing
  mindfulness?: {
    mindfulMinutes?: number;
    meditationSessionsCount?: number;
    daylightExposureMinutes?: number;
  };

  // Extensibility pocket for vendor-specific custom metrics
  customMetrics?: Record<string, any>;
}

export interface CanonicalWorkoutExport {
  exportVersion: "1.0" | "2.0";
  sourceApp: string; // e.g. "Hevy", "Strong", "FitNotes", "Boostcamp", "AppleFitness", "Garmin", "Manual"
  syncedAt: string; // ISO 8601
  workouts: CanonicalWorkoutSession[];
}

export interface CanonicalWorkoutSession {
  workoutId: string; // Unique ID (e.g. Hevy UUID or hash)
  date: string; // "YYYY-MM-DD"
  title: string; // e.g. "Upper Body Strength", "Leg Day A", "Full Body Circuit"
  startTime?: string; // ISO or "HH:mm"
  endTime?: string;
  durationMinutes: number;
  
  // Aggregate Session Volume & Bio-Metrics
  totalVolumeKg: number;
  totalSets: number;
  totalReps?: number;
  avgHeartRateBpm?: number;
  maxHeartRateBpm?: number;
  caloriesActualHr?: number;
  caloriesEstMet?: number;
  perceivedExertionRpe?: number; // 1-10 session RPE
  notes?: string;

  // Micro-Detail Exercise & Set Log (Essential for progressive overload calculation)
  exercises: CanonicalExerciseGroup[];

  // Extensibility field
  rawMetadata?: Record<string, any>;
}

export interface CanonicalExerciseGroup {
  exerciseName: string; // e.g. "Bench Press (Dumbbell)", "Goblet Squat", "Lat Pulldown"
  targetMuscleGroup?: string; // e.g. "Chest", "Quads", "Back", "Shoulders", "Core"
  equipment?: string; // e.g. "Dumbbell", "Barbell", "Machine", "Cable", "Bodyweight", "Kettlebell"
  notes?: string;
  sets: CanonicalWorkoutSet[];
}

export interface CanonicalWorkoutSet {
  setNumber: number; // 1, 2, 3...
  setType: "warmup" | "normal" | "failure" | "drop" | "rest_pause" | "cooldown";
  weightKg: number;
  reps: number;
  rpe?: number; // Rate of Perceived Exertion (1-10)
  rir?: number; // Reps In Reserve (0-5)
  setVolumeKg?: number; // weightKg * reps
  durationSeconds?: number; // for isometric holds / planks
  distanceMeters?: number; // for carries / sled pushes
  restSecondsAfter?: number;
  notes?: string;
}

export interface ImportSyncEvent {
  id: string;
  timestamp: string;
  status: 'checking' | 'processing' | 'success' | 'error' | 'idle';
  message: string;
  details?: {
    healthFilesCount?: number;
    workoutFilesCount?: number;
    recordsImported?: number;
    workoutsImported?: number;
    logsAddedCount?: number;
    errors?: string[];
  };
}
