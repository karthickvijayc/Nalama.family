import { normalizeDateStr, convertWorkoutSessionToLogEntry } from '../src/lib/importers/parser';
import { recordTelemetry, getTelemetryEvents, sanitizeError, exportSanitizedTelemetryReport } from '../src/lib/telemetry';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${msg}`);
}

console.log('=== TEST 1: Date Normalization & Disambiguation ===');

// Test US MM/DD/YYYY format (e.g. 09/24/2026 - where day > 12)
const usDate = normalizeDateStr('09/24/2026');
assert(usDate === '2026-09-24', `US MM/DD/YYYY (09/24/2026) normalized to 2026-09-24, got: ${usDate}`);

// Test UK/India DD/MM/YYYY format (e.g. 24/09/2026 - where day > 12)
const ukDate = normalizeDateStr('24/09/2026');
assert(ukDate === '2026-09-24', `DD/MM/YYYY (24/09/2026) normalized to 2026-09-24, got: ${ukDate}`);

// Test standard ISO format
const isoDate = normalizeDateStr('2026-09-24');
assert(isoDate === '2026-09-24', `ISO (2026-09-24) normalized to 2026-09-24, got: ${isoDate}`);

// Test datetime string with space (e.g. Hevy's "2026-09-24 07:15:00")
const dateTimeStr = normalizeDateStr('2026-09-24 07:15:00');
assert(dateTimeStr === '2026-09-24', `DateTime (2026-09-24 07:15:00) normalized to 2026-09-24, got: ${dateTimeStr}`);

// Test future date clamping (e.g. year 2028 or year 4574)
const futureDate = normalizeDateStr('2028-05-20');
const todayIso = new Date().toISOString().split('T')[0];
assert(futureDate <= todayIso, `Future date clamped to <= today (${todayIso}), got: ${futureDate}`);

console.log('\n=== TEST 2: Workout Session Future Clamping & Safe Conversion ===');

const workoutLog = convertWorkoutSessionToLogEntry({
  workoutId: 'a98df12b-4567-89ab-cdef-0123456789ab',
  date: '09/24/2026',
  title: 'Chest & Back',
  startTime: '08:00',
  durationMinutes: 45,
  totalVolumeKg: 1500,
  totalSets: 12,
  exercises: []
});

const workoutYear = new Date(workoutLog.timestamp).getFullYear();
assert(workoutYear === 2026, `Workout year is 2026 and not in the far future, got: ${workoutYear}`);
assert(!workoutLog.timestamp.includes('2028'), `Timestamp does NOT overflow into 2028: ${workoutLog.timestamp}`);

console.log('\n=== TEST 3: Telemetry & Zero-PII Sanitization ===');

// Record AI event
recordTelemetry({
  capability: 'ai',
  operation: 'transcribe_audio',
  status: 'success',
  durationMs: 450,
  statusCode: 200,
  summary: 'Audio transcribed successfully',
  meta: { entriesCount: 2 }
});

// Record Error event with sensitive string simulation
const sanitized = sanitizeError({ message: 'Resource exhausted (quota exceeded) 429 for key AIzaSyD948f9843jf9834jf9834jf', status: 429 });
assert(sanitized.errorCode === 'RATE_LIMIT_EXCEEDED', `Sanitized error code is RATE_LIMIT_EXCEEDED, got: ${sanitized.errorCode}`);
assert(!sanitized.summary.includes('AIzaSy'), `Sanitized error does not leak API key: ${sanitized.summary}`);

// Export report
const reportJson = exportSanitizedTelemetryReport();
const parsedReport = JSON.parse(reportJson);
assert(parsedReport.events.length >= 1, `Report contains events: ${parsedReport.events.length}`);
assert(parsedReport.events[0].capability === 'ai', `Event capability is ai`);

console.log('\n=== TEST 4: January 0-Indexed Month Bug Regression Test ===');
import { convertDailyHealthRecordToLogEntries } from '../src/lib/importers/parser';

const janRecord = {
  date: '2026-01-31',
  sources: ['HealthConnect'],
  activity: {
    steps: 14214,
    totalCaloriesKcal: 1159.1,
    activeDurationMinutes: 129
  },
  vitals: {
    restingHeartRateBpm: { avg: 114, min: 104, max: 122 }
  }
};

const janLogs = convertDailyHealthRecordToLogEntries(janRecord as any);
assert(janLogs.length >= 2, `Generated at least 2 logs for January 31, got: ${janLogs.length}`);

for (const log of janLogs) {
  const d = new Date(log.timestamp);
  assert(d.getFullYear() === 2026, `Log year is 2026, got: ${d.getFullYear()}`);
  assert(d.getMonth() === 0, `Log month is January (0), NOT October (9), got: ${d.getMonth()}`);
  assert(d.getDate() === 31, `Log day is 31, got: ${d.getDate()}`);
  assert(!log.timestamp.startsWith('2026-10-'), `Timestamp does NOT start with 2026-10, got: ${log.timestamp}`);
}

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
