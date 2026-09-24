# Nalama Companion & Nalama.family Data Import Reconciliation Report

**Date & Time:** September 24, 2026 — 21:30 IST  
**Status:** Completed & Reconciled  
**Authors:** Antigravity AI Pair Programmer & Karthick Vijay

---

## 1. Git Repository Revisions

This reconciliation was synchronized and verified against the exact git commit revisions below:

| Property | Companion App (`nalama.companion`) | Web App (`Nalama.family`) |
|---|---|---|
| **Local Path** | `C:\CodingWrkSpaces\nalama.companion` | `c:\CodingWrkSpaces\Nalama.family` |
| **Branch** | `main` | `main` |
| **Git Commit Hash** | `9cd1565ee1d958cfd6d647acbcd0c7f476835e21` | `c1c45e6e4890d7c1b203b82193d6e9269b826e0a` (Base) |
| **Commit Date** | `Thu Sep 24 08:48:42 2026 +0530` | `Thu Sep 10 14:03:43 2026 +0530` |
| **Author** | Karthick Vijay (`karthickvijayc@gmail.com`) | Karthick Vijay (`karthickvijayc@gmail.com`) |
| **Commit Message** | `feat(auth): implement Google account picker and drive sync` | `chore: initialize project infrastructure` |
| **Remote Repository** | `https://github.com/karthickvijayc/nalama.companion.git` | `https://github.com/karthickvijayc/Nalama.family.git` |

---

## 2. Reconciled Architectural Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   COMPANION APP (C:\CodingWrkSpaces\nalama.companion)                  │
│                     Commit: 9cd1565ee1d958cfd6d647acbcd0c7f476835e21                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ • Native Android Health Connect & Hevy API Client                                      │
│ • Direct Google Drive v3 Client (GoogleDriveDirectClient.kt) via OAuth Access Token    │
│ • WorkManager periodic background sync (15m, 1h, 6h, 12h, 24h)                         │
│ • Initial Bulk Export:                                                                 │
│     - Hevy API paginated retrieval: https://api.hevyapp.com/v1/workouts?page=N        │
│     - Health Connect throttled day-by-day read chunked into 60-day batches             │
│ • 180-Day Retention Architecture:                                                      │
│     - Active window (<= 180 days): biometrics_daily.csv & hevy_workouts.csv            │
│     - Yearly archive partitions (> 180 days): biometrics_daily_YYYY.csv & *_YYYY.csv   │
│ • Target Directories:                                                                  │
│     - /nalama.family/imports/health_data/                                              │
│     - /nalama.family/imports/gym_workouts/                                             │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ Google Drive v3 CSV Sync
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      NALAMA.FAMILY IMPORT ENGINE (RECONCILED)                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ • Drive API Pagination: listImportFolderFiles loops with nextPageToken                 │
│ • Checksum Caching: Tracks md5Checksum / modifiedTime in UserProfile                   │
│ • Exact Schema Alignment: Parses snake_case Companion CSVs + legacy Excel templates   │
│ • Intra-Day In-Place Upserting: Updates existing logs if daytime metrics increase      │
│ • Monthly Partitions: Logs reconciled into /nalama.family/logs_YYYY_MM.json            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Schema Mapping Reference

### 3.1 Health Biometrics CSV (`biometrics_daily.csv` & `biometrics_daily_YYYY.csv`)

| Column Name | Type | Companion Source (`CsvConverter.kt`) | Reconciled Mapping in `parser.ts` |
|---|---|---|---|
| `date` | `String` | `"YYYY-MM-DD"` | `record.date` |
| `sources` | `String` | Semicolon-separated package names | `record.sources` |
| `steps` | `Long` | Daily total step count | `record.activity.steps` |
| `distance_meters` | `Double` | Total distance in meters | `record.activity.distanceMeters` |
| `total_calories_kcal`| `Double` | BMR + Active energy burned | `record.activity.totalCaloriesKcal` |
| `active_calories_kcal`| `Double` | Active movement calories | `record.activity.activeCaloriesKcal` |
| `active_duration_minutes`| `Long` | Active exercise time in mins | `record.activity.activeDurationMinutes` |
| `vo2_max_avg` | `Double` | VO2 Max estimate | `record.activity.vo2MaxMlKgMin.avg` |
| `total_sleep_minutes`| `Long` | Granular sleep total | `record.sleep.totalSleepMinutes` |
| `light_sleep_minutes`| `Long` | Light sleep stage | `record.sleep.lightSleepMinutes` |
| `deep_sleep_minutes` | `Long` | Deep sleep stage | `record.sleep.deepSleepMinutes` |
| `rem_sleep_minutes` | `Long` | REM sleep stage | `record.sleep.remSleepMinutes` |
| `awake_minutes` | `Long` | Sleep awake time | `record.sleep.awakeMinutes` |
| `sleep_efficiency_score`| `Int`| Efficiency percentage (0-100) | `record.sleep.sleepEfficiencyScore` |
| `resting_hr_min` | `Double` | Minimum resting HR | `record.vitals.restingHeartRateBpm.min` |
| `resting_hr_max` | `Double` | Maximum resting HR | `record.vitals.restingHeartRateBpm.max` |
| `resting_hr_avg` | `Double` | Average resting HR | `record.vitals.restingHeartRateBpm.avg` |
| `hrv_ms_avg` | `Double` | Heart rate variability (RMSSD) | `record.vitals.heartRateVariabilityMs.avg` |
| `oxygen_saturation_pct_avg`| `Double` | Blood oxygen SpO2 % | `record.vitals.oxygenSaturationPct.avg` |
| `bp_systolic` | `Double` | Blood pressure systolic | `record.vitals.bloodPressureMmHg.systolic` |
| `bp_diastolic` | `Double` | Blood pressure diastolic | `record.vitals.bloodPressureMmHg.diastolic` |
| `bp_pulse` | `Double` | Pulse rate with BP reading | `record.vitals.bloodPressureMmHg.pulse` |
| `weight_kg` | `Double` | Body weight in kilograms | `record.bodyMeasurements.weightKg` |
| `body_fat_pct` | `Double` | Body fat percentage | `record.bodyMeasurements.bodyFatPct` |
| `lean_body_mass_kg` | `Double` | Lean muscle mass in kg | `record.bodyMeasurements.leanBodyMassKg` |

---

### 3.2 Gym Workouts CSV (`hevy_workouts.csv` & `hevy_workouts_YYYY.csv`)

| Column Name | Type | Companion Source (`WorkoutCsvConverter.kt`) | Reconciled Mapping in `parser.ts` |
|---|---|---|---|
| `workout_id` | `String` | Hevy UUID or composite ID | `session.workoutId` |
| `date` | `String` | `"YYYY-MM-DD"` | `session.date` |
| `title` | `String` | Routine / Workout Title | `session.title` |
| `start_time` | `String` | `"HH:mm"` | `session.startTime` |
| `end_time` | `String` | `"HH:mm"` | `session.endTime` |
| `duration_minutes` | `Int` | Session duration in minutes | `session.durationMinutes` |
| `total_volume_kg` | `Int` | Total lifted load in kg | `session.totalVolumeKg` |
| `total_sets` | `Int` | Total sets completed | `session.totalSets` |
| `avg_hr_bpm` | `Int?` | Average session heart rate | `session.avgHeartRateBpm` |
| `max_hr_bpm` | `Int?` | Peak session heart rate | `session.maxHeartRateBpm` |
| `calories` | `Int?` | Calories burned (HR actual) | `session.caloriesActualHr` |
| `exercise_name` | `String` | Exercise title | `exerciseGroup.exerciseName` |
| `target_muscle_group`| `String?`| Primary muscle target | `exerciseGroup.targetMuscleGroup` |
| `equipment` | `String?`| Dumbbell, Barbell, Cable, etc. | `exerciseGroup.equipment` |
| `set_number` | `Int` | Set index (1, 2, 3...) | `set.setNumber` |
| `set_type` | `String` | `"normal"`, `"warmup"`, `"failure"`, `"drop"` | `set.setType` |
| `weight_kg` | `Double` | Set load in kilograms | `set.weightKg` |
| `reps` | `Int` | Repetitions completed | `set.reps` |
| `rpe` | `Double?`| Rate of Perceived Exertion (1-10)| `set.rpe` |
| `notes` | `String?`| Workout and exercise notes | `session.notes` |

---

## 4. Key Improvements Implemented

1. **Intra-Day In-Place Upserting**:
   - `syncEngine.ts` previously dropped incoming updates if a log with the same date/ID was present in the monthly partition.
   - Now checks if metrics (steps, calories, sleep, sets) have changed throughout the day and performs an in-place update while preserving IDs.

2. **File Checksum / Signature Caching**:
   - In `userProfile`, `lastImportFileHashes` caches file `md5Checksum` or `modifiedTime`.
   - Static yearly archives (`*_2025.csv`) and untouched active files are skipped on recurring app visits, reducing network calls and partition writes to sub-second evaluation.

3. **Google Drive API Pagination**:
   - `listImportFolderFiles` in `drive.ts` now loops through `nextPageToken` with `pageSize=100`, preventing archive partition truncation.

4. **Rich Multi-Discipline Transcripts**:
   - Workouts display equipment and muscle groups: e.g. `Bench Press (Dumbbell) [Chest / Dumbbell] (4 sets @ 26kg, 8 reps)`.
   - Vitals display pulse with blood pressure readings: `118/76 mmHg (Pulse: 62 bpm)`.

---

## 5. Modified Files in `Nalama.family`

1. `src/types.ts`: Added `lastImportFileHashes?: Record<string, string>` to `UserProfile`.
2. `src/lib/drive.ts`: Added `nextPageToken` pagination loop and `md5Checksum` to `DriveImportFile`.
3. `src/lib/importers/parser.ts`: Complete snake_case and legacy column support for biometrics and workouts.
4. `src/lib/importers/syncEngine.ts`: Implemented intra-day in-place upserting, file checksum caching, and `forceSync` support.
5. `src/App.tsx`: Wired `forceSync = true` on manual "Sync Now" trigger in Settings.
6. `src/components/DeveloperGuide.tsx`: Updated documentation with Nalama Companion details, folder layout, 180-day retention, and CSV headers.
7. `HEALTH_AND_WORKOUT_INTEGRATION_PLAN.md`: Synchronized architecture diagrams and lifecycle documentation.
8. `RECONCILIATION_REPORT.md`: This reconciliation record.
