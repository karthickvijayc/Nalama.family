# nalama.family — Health Connect & Gym Workout Data Integration Architecture & Implementation Plan

## 1. Executive Summary & Vision

`nalama.family` is built on a **Zero-Database, Bring-Your-Own-Storage (BYOS)** architecture powered by Google Drive and Gemini. This document defines the comprehensive design, canonical schema specifications, translation target templates, and execution roadmap for reading and integrating raw exported data from **Health Connect, iOS Health, Android Health Data Exporter, and Gym Workout Apps (Hevy, Strong, etc.)**.

The architecture establishes:
1. **Granular Canonical Translation Targets** (in Google Drive JSON / CSV / Google Sheets formats) structured for maximum LLM semantic reasoning and sub-second querying.
2. **Multi-Source Adapter Matrix** supporting automated daily exports, third-party apps, iOS Apple Health exports, Hevy API sync scripts, and Tasker/Google Apps Script automations.
3. **Partitioned Ingestion Engine** that reads imported metrics without payload bottlenecks and reconciles them into the app's monthly log partitions (`logs_YYYY_MM.json`), verified fact memory (`context_memory.json`), and family care digests (`care_digest.json`).
4. **Contextual Coaching & Vitals Visualization** to empower the 4 coaching rooms (Workout, Diet, Medical, Reflection) with deep biometric and resistance training metrics.

---

## 2. Ingestion Variations & Source Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 EXTERNAL DATA SOURCES                                  │
├───────────────────────────────┬────────────────────────────────────────────────────────┤
│   HEALTH & BIOMETRICS         │   GYM & RESISTANCE WORKOUTS                            │
│   • Var 1.A: Health Connect   │   • Var 2.A: Hevy App API Script                       │
│     (Daily scheduled export)  │     (G-Drive sync / JSON / XLSX)                       │
│   • Var 1.B: Android App      │   • Var 2.B: Other Gym Apps                            │
│     ("Health Data Export")    │     (Strong, JEFIT, FitNotes, Apple Fitness)           │
│   • Var 1.C: iOS Health /     │                                                        │
│     Auto Export / Shortcuts   │                                                        │
└───────────────┬───────────────┴────────────────────────────┬───────────────────────────┘
                │                                            │
                ▼                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL TRANSLATION LAYER (Outside App)                        │
│          (Google Apps Script / Tasker / Python / Sheets / Shortcuts Automation)        │
│          Normalizes raw exports into Canonical Micro-Detail Templates                  │
└───────────────────────────────┬────────────────────────────┬───────────────────────────┘
                                │                            │
                                ▼                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     CANONICAL TEMPLATES IN GOOGLE DRIVE (/nalama.family/imports/)       │
├────────────────────────────────────────┬───────────────────────────────────────────────┤
│ 1. `health_biometrics_daily.json`      │ 2. `workout_sessions_granular.json`           │
│    (Activity, Vitals, Sleep, Body)     │    (Session overview + per-set micro log)     │
└────────────────────────────────────────┴───────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      NALAMA.FAMILY INGESTION & RECONCILIATION ENGINE                   │
│ • Incremental De-duplication (UUID / composite date+metric hash)                       │
│ • Partition update into `logs_YYYY_MM.json`                                            │
│ • Fact extraction trigger -> `context_memory.json` (PRs, vitals baseline, volume)      │
│ • Caregiver update trigger -> `care_digest.json`                                       │
│ • Contextual feed to Coaching Rooms (Workout & Movement, Recovery, Medical)           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Source Variations Supported:
- **Variation 1.A — Health Connect Daily Scheduled Export**: Android 14+ native Health Connect scheduled syncs (JSON/CSV) capturing step cadences, active energy, heart rate series, sleep stages, SpO2, and resting heart rates.
- **Variation 1.B — Android "Health Data Export" / Biometrics Tracker**: Multi-sheet / multi-table exports capturing Activity, Body Measurements, Sleep, and Vitals with min/max/avg distributions (matching `public/template/Example of Health Data Exporter - Biometrics Tracker.xlsx`).
- **Variation 1.C — iOS Health Auto-Export / Apple Shortcuts**: Workflows reading HealthKit and writing XML/JSON/CSV directly to the user's Google Drive folder.
- **Variation 2.A — Hevy API Script**: Google Apps Script / Tasker / Python worker invoking `https://api.hevyapp.com/v1/workouts` and producing structured session + set logs (matching `public/template/Export Template Hevy Workout.xlsx`).
- **Variation 2.B — Other Gym Apps**: Strong, JEFIT, FitNotes, Boostcamp, RepCount exporting workout sessions with exercise naming, set tags (warmup/normal/failure/drop), RPE, weight, and reps.

---

## 3. Canonical Translation Target Specifications (Granular Micro-Detail Schema)

To enable external scripts (Tasker, Google Apps Script, Python, Shortcuts) and the in-app parser to speak a single unified language with maximum semantic resolution for Gemini models, we define two granular canonical schemas:

### 3.1 Health & Biometrics Granular Schema (`health_biometrics_daily.json`)

```typescript
export interface CanonicalHealthExport {
  exportVersion: "1.0";
  sourceApp: string; // e.g. "HealthConnect" | "HealthDataExport" | "AppleHealth" | "SamsungHealth"
  timezone: string; // e.g. "Asia/Kolkata" | "America/Los_Angeles"
  exportedAt: string; // ISO 8601
  dailyRecords: CanonicalDailyHealthRecord[];
}

export interface CanonicalDailyHealthRecord {
  date: string; // "YYYY-MM-DD"
  sources: string[]; // e.g. ["com.sec.android.app.shealth", "com.google.android.apps.fitness"]
  
  // 1. Activity & Energy
  activity: {
    steps?: number;
    distanceMeters?: number;
    elevationMeters?: number;
    floorsClimbed?: number;
    totalCaloriesKcal?: number;
    activeCaloriesKcal?: number;
    wheelchairPushes?: number;
    activeDurationMinutes?: number;
    powerWatts?: { min?: number; max?: number; avg?: number };
    speedMps?: { min?: number; max?: number; avg?: number };
    vo2MaxMlKgMin?: { min?: number; max?: number; avg?: number };
  };

  // 2. Sleep Architecture & Recovery
  sleep?: {
    startTime?: string; // "YYYY-MM-DDTHH:mm:ss"
    endTime?: string;
    totalSleepMinutes?: number;
    lightSleepMinutes?: number;
    deepSleepMinutes?: number;
    remSleepMinutes?: number;
    awakeMinutes?: number;
    sleepEfficiencyScore?: number; // 0-100
  };

  // 3. Cardiovascular & Vitals
  vitals?: {
    heartRateBpm?: { min?: number; max?: number; avg?: number };
    restingHeartRateBpm?: { min?: number; max?: number; avg?: number };
    heartRateVariabilityMs?: { min?: number; max?: number; avg?: number };
    oxygenSaturationPct?: { min?: number; max?: number; avg?: number }; // SpO2
    respiratoryRateBreathsPerMin?: { min?: number; max?: number; avg?: number };
    bloodPressureMmHg?: { systolic?: number; diastolic?: number; pulse?: number };
    bloodGlucoseMmolL?: { min?: number; max?: number; avg?: number; fasting?: boolean };
    bodyTemperatureCelsius?: number;
  };

  // 4. Body Composition & Anthropometry
  bodyMeasurements?: {
    timestamp?: string;
    weightKg?: number;
    heightMeters?: number;
    bodyFatPct?: number;
    leanBodyMassKg?: number;
    boneMassKg?: number;
    bmi?: number;
  };
}
```

### 3.2 Gym Workout & Resistance Training Micro Schema (`workout_sessions_granular.json`)

```typescript
export interface CanonicalWorkoutExport {
  exportVersion: "1.0";
  sourceApp: string; // e.g. "Hevy" | "Strong" | "FitNotes" | "Manual"
  syncedAt: string; // ISO 8601
  workouts: CanonicalWorkoutSession[];
}

export interface CanonicalWorkoutSession {
  workoutId: string; // Unique ID (e.g. Hevy UUID or hash)
  date: string; // "YYYY-MM-DD"
  title: string; // e.g. "Day 1 - Push & Core", "Upper Body Power"
  startTime: string; // ISO or "HH:mm"
  endTime: string;
  durationMinutes: number;
  
  // Aggregate Volume & Metrics
  totalVolumeKg: number;
  totalSets: number;
  totalReps?: number;
  avgHeartRateBpm?: number;
  maxHeartRateBpm?: number;
  caloriesActualHr?: number;
  caloriesEstMet?: number;
  notes?: string;

  // Micro-Detail Exercise & Set Log (Crucial for progressive overload reasoning)
  exercises: CanonicalExerciseGroup[];
}

export interface CanonicalExerciseGroup {
  exerciseName: string; // e.g. "Bench Press (Dumbbell)", "Goblet Squat"
  muscleGroup?: string; // e.g. "Chest", "Quads", "Back"
  equipment?: string; // e.g. "Dumbbell", "Barbell", "Machine", "Cable"
  notes?: string;
  sets: CanonicalWorkoutSet[];
}

export interface CanonicalWorkoutSet {
  setNumber: number; // 1, 2, 3...
  setType: "warmup" | "normal" | "failure" | "drop" | "rest_pause";
  weightKg: number;
  reps: number;
  rpe?: number; // Rate of Perceived Exertion (1-10)
  setVolumeKg: number; // weightKg * reps
  durationSeconds?: number;
  distanceMeters?: number;
  restSecondsAfter?: number;
}
```

---

## 4. Google Drive Folder & File Layout

All imported files reside inside a dedicated `/nalama.family/imports/` subfolder in the user's Google Drive:

```
Google Drive Root
└── /nalama.family/
    ├── context_memory.json                 (Verified facts, medical conditions, targets)
    ├── logs_2026_09.json                   (Monthly partition for active app logs)
    ├── /family_share/
    │   └── care_digest.json                (Caregiver timeline updates)
    └── /imports/                           <-- NEW AUTOMATION & INTEGRATION DIRECTORY
        ├── /health_data/
        │   ├── biometrics_daily.json       (Canonical Health target file)
        │   └── archive/                    (Processed raw xlsx / csv / json)
        └── /gym_workouts/
            ├── hevy_workouts.json          (Canonical Gym workout target file)
            └── archive/                    (Processed raw workout exports)
```

---

## 5. Architectural Flow & Reconciliation Strategy

### 5.1 Reconciliation Lifecycle

```
[Import Trigger (File Drop or Drive Sync)]
                 │
                 ▼
[File Detection & Signature Parser]
   ├─ If .xlsx / .csv -> Parse into Memory via Sheet Parser
   └─ If Canonical JSON -> Direct Schema Validation
                 │
                 ▼
[De-duplication Engine]
   • Compare workoutId / date against existing entries in `logs_YYYY_MM.json`
   • Avoid duplicate calorie/active minute entries
                 │
                 ▼
[Partition Update (`logs_YYYY_MM.json`)]
   • Automatically inserts structured workout cards (with volume, sets, exercise breakdown)
   • Automatically updates daily totals (steps, sleep hours, active minutes, vitals)
                 │
                 ▼
[Asynchronous LLM Fact Extraction]
   • Gemini analyzes workout progression -> Updates `context_memory.json` with:
     - New PRs (Personal Records, e.g. "Bench Press 50kg for 8 reps")
     - Recovery score & Sleep duration trends
     - Average weekly workout volume
                 │
                 ▼
[Live UI & Coaching Room Reflection]
   • Dashboard rings (Active time, Calories, Steps, Sleep) update instantly
   • Workout Room can answer: "What was my dumbbell bench volume last week?"
   • Mindful Recovery Room can correlate sleep stages with workout intensity
```

---

## 6. Implementation Plan: Phased Execution Roadmap

### Phase 8: Canonical Import Infrastructure & Drive Storage
- **Task 8.1**: Create `src/lib/importers/types.ts` defining canonical schemas (`CanonicalHealthExport`, `CanonicalWorkoutExport`).
- **Task 8.2**: Update `src/lib/drive.ts` with `getOrCreateImportsFolder`, `readImportFile`, and `writeCanonicalImportFile`.
- **Task 8.3**: Add `/nalama.family/imports/` initialization to the GIS login flow.

### Phase 9: Multi-Format Parsers & External Translators
- **Task 9.1**: **Excel / CSV / JSON Parser Engine**:
  - Integrate `xlsx` / `papaparse` parser to read uploaded templates directly:
    - `Export Template Hevy Workout.xlsx` (Workout_Sessions + Exercise_Sets_Log)
    - `Example of Health Data Exporter - Biometrics Tracker.xlsx` (Activity, Body Measurements, Sleep, Vitals)
- **Task 9.2**: **Server-Side Ingestion Endpoint (`/api/import-health-data` & `/api/import-workout-data`)**:
  - Handles parsing, normalization, de-duplication, and mapping into `logs_YYYY_MM.json`.
- **Task 9.3**: **External Automation Template Scripts**:
  - Deliver copy-pasteable **Google Apps Script** and **Tasker Webhook** templates inside the documentation/settings for:
    - Automated Hevy API polling -> Google Drive writing
    - Health Connect daily export translation

### Phase 10: In-App Import & Sync UI (Settings & Dashboard)
- **Task 10.1**: **Direct File Upload & Import Dropzone** in Settings:
  - Supports dragging `.xlsx`, `.csv`, `.json` from Health Data Exporter or Hevy.
  - Live preview modal showing parsed sessions, sets, vitals, and sleep stages before committing to Drive.
- **Task 10.2**: **Auto-Sync Google Drive Watcher**:
  - App checks `/nalama.family/imports/` on launch for newly placed files and imports them automatically with a notification banner.

### Phase 11: LLM Reasoning & Coaching Room Enhancement
- **Task 11.1**: **Fact Extraction Extension**:
  - Update `/api/extract-context` to recognize resistance training metrics, body composition changes, and sleep HRV vitals.
- **Task 11.2**: **Coaching Room Integration**:
  - Equip `Workout & Movement` room with exercise set logs, RPE analysis, and progressive overload recommendations.
  - Equip `Mindful Recovery` room with sleep stage distribution and resting heart rate trends.

---

## 7. Verification & Success Criteria

1. **Format Agility**: Successfully parses both sample `.xlsx` files (`Export Template Hevy Workout.xlsx` and `Example of Health Data Exporter - Biometrics Tracker.xlsx`) and converts them into canonical JSON.
2. **Zero-Database Integrity**: All imported sessions and biometrics are written directly to Google Drive without server persistence.
3. **Partition Efficiency**: Monthly log files remain lightweight (< 60 KB) with clean set aggregation.
4. **LLM Coaching Context**: Coaching Rooms can answer granular queries about specific exercise sets, weights, sleep stages, and vitals.
