/**
 * End-to-End Reconciliation Test Suite:
 * Nalama Companion App (Android) <--> Nalama.family Web App
 */

import { parseCSV, parseImportFileContent } from '../src/lib/importers/parser';
import { CanonicalDailyHealthRecord, CanonicalWorkoutSession } from '../src/lib/importers/types';
import { HealthLogEntry } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('====================================================');
console.log('Starting Reconciliation Test Suite...');
console.log('====================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Exact Nalama Companion biometrics_daily.csv schema & parser test
// -----------------------------------------------------------------------------
console.log('--- TEST 1: Biometrics Daily CSV Reconciliation ---');

const companionBiometricsCsv = `date,sources,steps,distance_meters,total_calories_kcal,active_calories_kcal,active_duration_minutes,vo2_max_avg,total_sleep_minutes,light_sleep_minutes,deep_sleep_minutes,rem_sleep_minutes,awake_minutes,sleep_efficiency_score,resting_hr_min,resting_hr_max,resting_hr_avg,hrv_ms_avg,oxygen_saturation_pct_avg,bp_systolic,bp_diastolic,bp_pulse,weight_kg,body_fat_pct,lean_body_mass_kg
2026-09-24,com.android.healthconnect;com.sec.android.app.shealth,8450,6420.5,2140.0,465.0,62,42.5,435,220,110,85,20,88,52.0,68.0,56.0,48.5,98.2,118.0,76.0,62.0,74.5,18.2,60.9
2026-09-25,com.android.healthconnect,10200,7800.0,2350.0,620.0,75,,450,230,120,80,20,90,50.0,64.0,54.0,52.0,99.0,120.0,78.0,60.0,74.2,18.0,60.8
2026-09-26,com.android.healthconnect,3200,2438.4,144.0,144.0,28,,,,,,,,58.0,70.0,62.0,42.0,97.5,,,,74.0,,
`;

const bioResult = parseImportFileContent('biometrics_daily.csv', companionBiometricsCsv);
assert(bioResult.sourceType === 'health_csv', 'Recognized as health_csv');
assert(bioResult.healthRecords?.length === 3, 'Parsed exactly 3 daily records');
assert(bioResult.convertedLogs.length > 0, `Generated ${bioResult.convertedLogs.length} logs from biometrics`);

// Validate 2026-09-24 Day 1 record
const day1Record = bioResult.healthRecords![0];
assert(day1Record.date === '2026-09-24', 'Day 1 date is 2026-09-24');
assert(day1Record.activity?.steps === 8450, 'Day 1 steps is 8450');
assert(day1Record.activity?.distanceMeters === 6420.5, 'Day 1 distance is 6420.5m');
assert(day1Record.activity?.totalCaloriesKcal === 2140.0, 'Day 1 total calories is 2140 kcal');
assert(day1Record.activity?.activeCaloriesKcal === 465.0, 'Day 1 active calories is 465 kcal');
assert(day1Record.sleep?.totalSleepMinutes === 435, 'Day 1 sleep total is 435 mins');
assert(day1Record.sleep?.sleepEfficiencyScore === 88, 'Day 1 sleep efficiency is 88%');
assert(day1Record.vitals?.restingHeartRateBpm?.avg === 56.0, 'Day 1 RHR avg is 56 bpm');
assert(day1Record.vitals?.restingHeartRateBpm?.min === 52.0, 'Day 1 RHR min is 52 bpm');
assert(day1Record.vitals?.restingHeartRateBpm?.max === 68.0, 'Day 1 RHR max is 68 bpm');
assert(day1Record.vitals?.heartRateVariabilityMs?.avg === 48.5, 'Day 1 HRV is 48.5 ms');
assert(day1Record.vitals?.oxygenSaturationPct?.avg === 98.2, 'Day 1 SpO2 is 98.2%');
assert(day1Record.vitals?.bloodPressureMmHg?.systolic === 118.0, 'Day 1 Systolic is 118');
assert(day1Record.vitals?.bloodPressureMmHg?.diastolic === 76.0, 'Day 1 Diastolic is 76');
assert(day1Record.vitals?.bloodPressureMmHg?.pulse === 62.0, 'Day 1 Pulse is 62 bpm');
assert(day1Record.bodyMeasurements?.weightKg === 74.5, 'Day 1 Weight is 74.5 kg');
assert(day1Record.bodyMeasurements?.bodyFatPct === 18.2, 'Day 1 Body Fat is 18.2%');
assert(day1Record.bodyMeasurements?.leanBodyMassKg === 60.9, 'Day 1 Lean Mass is 60.9 kg');

// Validate Day 3 missing sleep correctly omits sleep log
const day3Logs = bioResult.convertedLogs.filter(l => l.id.includes('2026-09-26'));
const day3Sleep = day3Logs.find(l => l.id === 'import-sleep-2026-09-26');
assert(!day3Sleep, 'No false sleep log generated when sleep data is empty');

// Validate RHR range display in vitals log transcript
const day1VitalsLog = bioResult.convertedLogs.find(l => l.id === 'import-vitals-2026-09-24');
assert(!!day1VitalsLog, 'Day 1 vitals log created');
assert(day1VitalsLog!.transcript.includes('Resting Heart Rate: 56 bpm (Range: 52-68 bpm)'), 'Vitals transcript includes RHR range');
assert(day1VitalsLog!.transcript.includes('Blood Pressure: 118/76 mmHg (Pulse: 62 bpm)'), 'Vitals transcript includes BP with pulse');


// -----------------------------------------------------------------------------
// TEST 2: Exact Nalama Companion hevy_workouts.csv schema & parser test
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: Hevy Workouts CSV Reconciliation ---');

const companionWorkoutsCsv = `workout_id,date,title,start_time,end_time,duration_minutes,total_volume_kg,total_sets,avg_hr_bpm,max_hr_bpm,calories,exercise_name,target_muscle_group,equipment,set_number,set_type,weight_kg,reps,rpe,notes
"a98df12b-4567-89ab-cdef-0123456789ab",2026-09-24,"Push Day (Chest, Shoulders, Triceps)",07:15,08:15,60,4250,9,132,165,420,"Barbell Bench Press",Chest,Barbell,1,warmup,40,10,6,"Great energy | Felt strong on top sets"
"a98df12b-4567-89ab-cdef-0123456789ab",2026-09-24,"Push Day (Chest, Shoulders, Triceps)",07:15,08:15,60,4250,9,132,165,420,"Barbell Bench Press",Chest,Barbell,2,normal,70,8,8,"Great energy | Felt strong on top sets"
"a98df12b-4567-89ab-cdef-0123456789ab",2026-09-24,"Push Day (Chest, Shoulders, Triceps)",07:15,08:15,60,4250,9,132,165,420,"Barbell Bench Press",Chest,Barbell,3,normal,75,6,9,"Great energy | Felt strong on top sets"
"a98df12b-4567-89ab-cdef-0123456789ab",2026-09-24,"Push Day (Chest, Shoulders, Triceps)",07:15,08:15,60,4250,9,132,165,420,"Incline Dumbbell Press",Chest,Dumbbell,1,normal,26,10,7,"Great energy | Felt strong on top sets"
"a98df12b-4567-89ab-cdef-0123456789ab",2026-09-24,"Push Day (Chest, Shoulders, Triceps)",07:15,08:15,60,4250,9,132,165,420,"Incline Dumbbell Press",Chest,Dumbbell,2,normal,28,8,8.5,"Great energy | Felt strong on top sets"
"a98df12b-4567-89ab-cdef-0123456789ab",2026-09-24,"Push Day (Chest, Shoulders, Triceps)",07:15,08:15,60,4250,9,132,165,420,"Incline Dumbbell Press",Chest,Dumbbell,3,failure,30,6,10,"Great energy | Felt strong on top sets"
"a98df12b-4567-89ab-cdef-0123456789ab",2026-09-24,"Push Day (Chest, Shoulders, Triceps)",07:15,08:15,60,4250,9,132,165,420,"Triceps Rope Pushdown",Triceps,Cable,1,normal,25,12,7,"Great energy | Felt strong on top sets"
"a98df12b-4567-89ab-cdef-0123456789ab",2026-09-24,"Push Day (Chest, Shoulders, Triceps)",07:15,08:15,60,4250,9,132,165,420,"Triceps Rope Pushdown",Triceps,Cable,2,normal,30,10,8.5,"Great energy | Felt strong on top sets"
"a98df12b-4567-89ab-cdef-0123456789ab",2026-09-24,"Push Day (Chest, Shoulders, Triceps)",07:15,08:15,60,4250,9,132,165,420,"Triceps Rope Pushdown",Triceps,Cable,3,drop,20,15,9.5,"Great energy | Felt strong on top sets"
`;

const wkResult = parseImportFileContent('hevy_workouts.csv', companionWorkoutsCsv);
assert(wkResult.sourceType === 'workout_csv', 'Recognized as workout_csv');
assert(wkResult.workoutSessions?.length === 1, 'Grouped 9 rows into 1 unified workout session');
const session = wkResult.workoutSessions![0];
assert(session.workoutId === 'a98df12b-4567-89ab-cdef-0123456789ab', 'Workout ID preserved from Hevy');
assert(session.title === 'Push Day (Chest, Shoulders, Triceps)', 'Workout title parsed');
assert(session.durationMinutes === 60, 'Duration is 60 minutes');
assert(session.totalVolumeKg === 4250, 'Total volume is 4250 kg');
assert(session.totalSets === 9, 'Total sets is 9');
assert(session.avgHeartRateBpm === 132, 'Avg HR is 132 bpm');
assert(session.maxHeartRateBpm === 165, 'Max HR is 165 bpm');
assert(session.caloriesActualHr === 420, 'Calories is 420 kcal');
assert(session.exercises.length === 3, 'Contains 3 distinct exercises');
assert(session.notes === 'Great energy | Felt strong on top sets', 'Notes captured correctly');

// Check converted log entry
assert(wkResult.convertedLogs.length === 1, 'Converted to 1 HealthLogEntry');
const workoutLog = wkResult.convertedLogs[0];
assert(workoutLog.id === 'import-workout-a98df12b-4567-89ab-cdef-0123456789ab', 'Log ID is deterministic and based on workout ID');
assert(workoutLog.category === 'workout', 'Category is workout');
assert(workoutLog.caloriesBurned === 420, 'Calories burned is 420 kcal');
assert(workoutLog.activeMinutes === 60, 'Active minutes is 60');
assert(workoutLog.timeBucket === 'Morning', 'Time bucket is Morning (07:15)');
assert(workoutLog.transcript.includes('Barbell Bench Press [Chest / Barbell] (3 sets @ 75kg, 10 reps)'), 'Exercise transcript includes muscle group and equipment');
assert(workoutLog.transcript.includes('• Notes: "Great energy | Felt strong on top sets"'), 'Workout transcript includes notes');


// -----------------------------------------------------------------------------
// TEST 3: Edge Case: Multiline Notes & RFC-4180 Escaping
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3: Multiline Quoted Strings & Escaped Quotes ---');

const multilineWorkoutCsv = `workout_id,date,title,start_time,end_time,duration_minutes,total_volume_kg,total_sets,avg_hr_bpm,max_hr_bpm,calories,exercise_name,target_muscle_group,equipment,set_number,set_type,weight_kg,reps,rpe,notes
"w-multi-1",2026-09-27,"Legs & Core",08:00,09:00,60,3500,6,128,155,380,"Back Squat",Legs,Barbell,1,normal,100,5,8,"Felt heavy today
Coach said: ""Keep knees aligned""
Drink electrolytes"
"w-multi-1",2026-09-27,"Legs & Core",08:00,09:00,60,3500,6,128,155,380,"Back Squat",Legs,Barbell,2,normal,100,5,8.5,"Felt heavy today
Coach said: ""Keep knees aligned""
Drink electrolytes"
`;

const multiResult = parseImportFileContent('hevy_workouts_2026.csv', multilineWorkoutCsv);
assert(multiResult.sourceType === 'workout_csv', 'Recognized yearly archive workout CSV with multiline field');
assert(multiResult.workoutSessions?.length === 1, 'Grouped multiline CSV into single session without splitting rows');
assert(multiResult.workoutSessions![0].notes?.includes('Coach said: "Keep knees aligned"'), 'Escaped quotes unescaped properly');


// -----------------------------------------------------------------------------
// TEST 4: Intra-Day In-Place Upsert Verification
// -----------------------------------------------------------------------------
console.log('\n--- TEST 4: Intra-Day In-Place Upsert Verification ---');

// Morning import: 3000 steps
const morningCsv = `date,sources,steps,distance_meters,total_calories_kcal,active_calories_kcal,active_duration_minutes,vo2_max_avg,total_sleep_minutes,light_sleep_minutes,deep_sleep_minutes,rem_sleep_minutes,awake_minutes,sleep_efficiency_score,resting_hr_min,resting_hr_max,resting_hr_avg,hrv_ms_avg,oxygen_saturation_pct_avg,bp_systolic,bp_diastolic,bp_pulse,weight_kg,body_fat_pct,lean_body_mass_kg
2026-09-27,com.android.healthconnect,3000,2286.0,135.0,135.0,25,,,,,,,,54.0,66.0,58.0,45.0,98.0,,,,74.0,,
`;
const morningRes = parseImportFileContent('biometrics_daily.csv', morningCsv);
const existingLogs: HealthLogEntry[] = [...morningRes.convertedLogs];
const morningActivityLog = existingLogs.find(l => l.id === 'import-activity-2026-09-27')!;
assert(morningActivityLog.caloriesBurned === 135, 'Morning calories burned is 135');
assert(morningActivityLog.transcript.includes('3,000 steps'), 'Morning transcript has 3,000 steps');

// Evening import: 11,200 steps
const eveningCsv = `date,sources,steps,distance_meters,total_calories_kcal,active_calories_kcal,active_duration_minutes,vo2_max_avg,total_sleep_minutes,light_sleep_minutes,deep_sleep_minutes,rem_sleep_minutes,awake_minutes,sleep_efficiency_score,resting_hr_min,resting_hr_max,resting_hr_avg,hrv_ms_avg,oxygen_saturation_pct_avg,bp_systolic,bp_diastolic,bp_pulse,weight_kg,body_fat_pct,lean_body_mass_kg
2026-09-27,com.android.healthconnect,11200,8534.4,504.0,504.0,85,,,,,,,,54.0,66.0,58.0,45.0,98.0,,,,74.0,,
`;
const eveningRes = parseImportFileContent('biometrics_daily.csv', eveningCsv);

// Simulate syncEngine in-place update logic
let updatedCount = 0;
let newCount = 0;
const logMapById = new Map<string, number>();
existingLogs.forEach((l, idx) => logMapById.set(l.id, idx));

for (const newLog of eveningRes.convertedLogs) {
  if (logMapById.has(newLog.id)) {
    const idx = logMapById.get(newLog.id)!;
    const current = existingLogs[idx];
    const hasChanged = 
      current.transcript !== newLog.transcript ||
      current.caloriesBurned !== newLog.caloriesBurned ||
      current.activeMinutes !== newLog.activeMinutes;
    if (hasChanged) {
      existingLogs[idx] = { ...current, ...newLog, id: current.id };
      updatedCount++;
    }
  } else {
    existingLogs.push(newLog);
    newCount++;
  }
}

assert(updatedCount >= 1, 'Intra-day step increase detected as update');
assert(newCount === 0, 'No duplicate activity entry created');
const updatedActivityLog = existingLogs.find(l => l.id === 'import-activity-2026-09-27')!;
assert(updatedActivityLog.caloriesBurned === 504, 'Updated calories burned is 504');
assert(updatedActivityLog.activeMinutes === 85, 'Updated active minutes is 85');
assert(updatedActivityLog.transcript.includes('11,200 steps'), 'Updated transcript has 11,200 steps');


// -----------------------------------------------------------------------------
// TEST 5: Auto-Reconciliation of totalVolumeKg and totalSets if 0
// -----------------------------------------------------------------------------
console.log('\n--- TEST 5: Auto-Reconciliation of totalVolumeKg and totalSets ---');

const zeroVolumeCsv = `workout_id,date,title,start_time,end_time,duration_minutes,total_volume_kg,total_sets,avg_hr_bpm,max_hr_bpm,calories,exercise_name,target_muscle_group,equipment,set_number,set_type,weight_kg,reps,rpe,notes
"w-calc-1",2026-09-27,"Deadlift Session",18:00,19:00,60,0,0,140,172,450,"Barbell Deadlift",Back,Barbell,1,normal,120,5,8,""
"w-calc-1",2026-09-27,"Deadlift Session",18:00,19:00,60,0,0,140,172,450,"Barbell Deadlift",Back,Barbell,2,normal,140,3,9,""
`;

const calcResult = parseImportFileContent('hevy_workouts.csv', zeroVolumeCsv);
assert(calcResult.workoutSessions?.length === 1, 'Parsed 1 workout session');
const calcSession = calcResult.workoutSessions![0];
// 120 * 5 = 600, 140 * 3 = 420. Total = 1020 kg
assert(calcSession.totalVolumeKg === 1020, `Auto-reconciled totalVolumeKg from sets (expected 1020, got ${calcSession.totalVolumeKg})`);
assert(calcSession.totalSets === 2, `Auto-reconciled totalSets from sets (expected 2, got ${calcSession.totalSets})`);

console.log('\n====================================================');
console.log('🎉 ALL RECONCILIATION TESTS PASSED PERFECTLY!');
console.log('====================================================');
