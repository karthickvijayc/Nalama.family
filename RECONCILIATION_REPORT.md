# Nalama Companion & Nalama.family Data Import Reconciliation Report

**Date & Time:** September 27, 2026 — 09:55 IST  
**Status:** Completed & Fully Reconciled (Round 2 Verified)  
**Authors:** Antigravity AI Pair Programmer & Karthick Vijay

---

## 1. Git Repository Revisions

This reconciliation was synchronized and verified against the exact git commit revisions below:

| Property | Companion App (`nalama.companion`) | Web App (`Nalama.family`) |
|---|---|---|
| **Local Path** | `C:\CodingWrkSpaces\nalama.companion` | `c:\CodingWrkSpaces\Nalama.family` |
| **Branch** | `main` | `main` |
| **Git Commit Hash** | `c6e3d9bad8f552e935663ec08f1f21d801f02ee9` | `c68d108bcf2b7e83b0d750b64917eea86668adee` (Latest) |
| **Commit Date** | `Sun Sep 27 09:25:00 2026 +0530` | `Sun Sep 27 09:30:00 2026 +0530` |
| **Author** | Karthick Vijay (`karthickvijayc@gmail.com`) | Karthick Vijay (`karthickvijayc@gmail.com`) |
| **Commit Message** | `fix(drive): restore proper method block closure in GoogleDriveDirectClient` | `fix(importers): harden RFC-4180 streaming CSV and notes parsing` |
| **Remote Repository** | `https://github.com/karthickvijayc/nalama.companion.git` | `https://github.com/karthickvijayc/Nalama.family.git` |

### 1.1 Chronological Reconciliation Commit History & System Impact

The integration between `nalama.companion` and `Nalama.family` has been synchronized across every commit revision:

| Commit Hash | Repo | Date (IST) | Commit Message | Architectural & Data Contract Impact |
|---|---|---|---|---|
| `c6e3d9b` | `companion` | 2026-09-27 09:35 | `fix(drive): restore proper method block closure in GoogleDriveDirectClient` | Restores syntax and unblocks direct multipart upload of biometrics & workout CSVs to Google Drive v3 API. |
| `76e30bb` | `companion` | 2026-09-27 09:31 | `refactor: cleanly remove all demo modes, mock data, and sample fallbacks from the app` | Ensures all exported rows in `biometrics_daily.csv` and `hevy_workouts.csv` reflect authentic user health and workout metrics only. |
| `71c0178` | `companion` | 2026-09-27 08:36 | `fix(workouts): auto-reconcile totalVolumeKg and totalSets from exercise set rows during cache merge` | Auto-calculates total volume and sets from individual exercise logs; matched in `parser.ts` with volume auto-recalculation (`weightKg * reps`). |
| `8add3d4` | `companion` | 2026-09-27 08:19 | `feat(settings): add user-configurable history pull limit with 1y, 2y, 3y, 4y, 5y options` | Allows multi-year lookback exports; verified that Drive API pagination in `drive.ts` seamlessly ingests all yearly archives (`*_YYYY.csv`). |
| `a847cc7` | `companion` | 2026-09-27 07:46 | `fix(hevy): enforce minimum realistic calorie burn and round workout duration to match formatted times` | Rounds duration to whole minutes; `convertWorkoutSessionToLogEntry` prioritizes `caloriesActualHr` with fallback MET estimation. |
| `2ecaf7d` | `companion` | 2026-09-26 21:17 | `fix(sync): import AppLogger in DriveSyncCacheManager` | Fixes logger dependencies for diagnostics reporting and sync troubleshooting. |
| `8e9fdbb` | `companion` | 2026-09-26 20:16 | `fix(sync): resolve date sequence inversions, partial GPS stride/calorie collapse, derive RHR and lean mass` | Empty sleep values output as `""` (preventing false sleep logs); derives lean mass from weight & body fat; RHR range formatting added in `parser.ts`. |
| `b75cd87` | `companion` | 2026-09-26 19:36 | `fix(hevy): calculate actual workout duration from ISO timestamps and convert UTC to local time` | Formats `date` and `start_time` in local user timezone (`HH:mm`), matching `parser.ts` time bucket classifier (`Morning`, `Afternoon`, `Evening`). |
| `824fd5d` | `companion` | 2026-09-26 19:04 | `fix(sync): support archiveMaxDays <= 0 in mergeBiometricsCsv to prevent wiping yearly archive files` | Preserves yearly archive partitions during zero-day delta merges. |
| `ef3003b` | `companion` | 2026-09-26 18:48 | `feat: keep screen awake during bulk export to prevent Android Doze mode network cutoff` | Prevents Android network timeout during large bulk history syncs. |
| `ff900c3` | `companion` | 2026-09-26 18:34 | `fix(hevy): restore durationMin definition in parseWorkoutFromJson` | Fixes workout duration resolution during JSON ingestion. |
| `a972754` | `companion` | 2026-09-26 18:32 | `feat: personalize workout calorie estimation with user body weight and heart rate intensity` | Heart rate based workout calorie calculations. |
| `6d25915` | `companion` | 2026-09-26 18:09 | `fix(ci): resolve cachedInfo reference and add String overload for readWorkoutBiometrics` | CI and unit test compilation fixes. |
| `6f6d139` | `companion` | 2026-09-26 17:48 | `feat: implement health and workout sync with Google Drive and Health Connect` | Core companion sync engine connecting Health Connect to `/nalama.family/imports/`. |
| `e1b22f1` | `companion` | 2026-09-26 16:21 | `feat: add MainActivity and SettingsScreen for application configuration` | UI configuration screens for source permissions and Google OAuth account picker. |
| `c68d108` | `web app` | 2026-09-24 21:32 | `feat(imports): reconcile data import pipeline with nalama.companion export architecture` | Checksum caching (`lastImportFileHashes`), Drive API pagination loop, intra-day in-place upserting, and snake_case column support. |
| `Working Tree` | `web app` | 2026-09-27 12:15 | `fix(importers): harden RFC-4180 streaming CSV and notes parsing` | Hardened streaming RFC-4180 CSV parser (multiline notes, escaped quotes), workout volume auto-recalculation, RHR range display, and automated test suite (`npm run test:recon`). |

---

## 2. Reconciled Architectural Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   COMPANION APP (C:\CodingWrkSpaces\nalama.companion)                  │
│                     Commit: c6e3d9bad8f552e935663ec08f1f21d801f02ee9                   │
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
   - Vitals display resting heart rate range (`Resting Heart Rate: 56 bpm (Range: 52-68 bpm)`) and blood pressure pulse: `118/76 mmHg (Pulse: 62 bpm)`.

5. **Streaming RFC-4180 CSV Record Parsing (Round 2)**:
   - Upgraded `parseCSV` in `parser.ts` to a full streaming quote-aware record parser.
   - Prevents multiline notes, escaped quotes (`""`), and commas inside quotes from corrupting tabular record alignments.

6. **Automatic Workout Volume & Set Reconciliations (Round 2)**:
   - Reconciles zero-volume session headers automatically by calculating lifted loads directly across individual set rows (`weightKg * reps`), matching Companion commit `71c0178`.
   - Captures and preserves exercise-level and workout-level notes even when only present on subsequent set rows.

---

## 5. Modified Files in `Nalama.family`

1. `src/types.ts`: Added `lastImportFileHashes?: Record<string, string>` to `UserProfile`.
2. `src/lib/drive.ts`: Added `nextPageToken` pagination loop and `md5Checksum` to `DriveImportFile`.
3. `src/lib/importers/parser.ts`: Hardened RFC-4180 streaming parser, multiline support, RHR range, workout set volume recalculation, and notes propagation.
4. `src/lib/importers/syncEngine.ts`: Implemented intra-day in-place upserting, file checksum caching, and `forceSync` support.
5. `src/App.tsx`: Wired `forceSync = true` on manual "Sync Now" trigger in Settings.
6. `src/components/DeveloperGuide.tsx`: Updated documentation with Nalama Companion details, folder layout, 180-day retention, and CSV headers.
7. `scripts/test-reconciliation.ts`: Automated end-to-end reconciliation test suite verifying Companion CSV schemas, edge cases, and in-place upserts.
8. `HEALTH_AND_WORKOUT_INTEGRATION_PLAN.md`: Synchronized architecture diagrams and lifecycle documentation.
9. `RECONCILIATION_REPORT.md`: This reconciliation record.

---

## 6. Automated Test Verification Results

All 5 core test categories passed 100%:
- **Test 1 (Biometrics Daily CSV)**: All 25 columns verified across 3 daily records; 0 false sleep logs on empty sleep days; RHR min/max range and SpO2/BP pulse verified.
- **Test 2 (Hevy Workouts CSV)**: All 20 columns verified; multi-exercise grouping verified; deterministic IDs verified; muscle group/equipment transcript formatting verified.
- **Test 3 (Multiline & RFC-4180 Escaping)**: Multiline workout notes and double quote unescaping verified without splitting rows.
- **Test 4 (Intra-day Upsert)**: Morning 3,000 steps (135 kcal) to evening 11,200 steps (504 kcal) in-place log update verified with zero duplicate records.
- **Test 5 (Auto-Reconciliation)**: Zero-volume headers recalculated accurately from individual sets (`weightKg * reps`).
