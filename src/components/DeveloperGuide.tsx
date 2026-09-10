import React, { useState } from 'react';
import { 
  ArrowLeft, 
  FileCode, 
  FolderTree, 
  Copy, 
  Check, 
  Zap, 
  Activity, 
  Dumbbell, 
  HeartPulse, 
  Moon, 
  Sparkles, 
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Download
} from 'lucide-react';

interface DeveloperGuideProps {
  onBack: () => void;
}

export default function DeveloperGuide({ onBack }: DeveloperGuideProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(key);
    setTimeout(() => setCopiedSection(null), 2500);
  };

  const sampleHealthJson = `{
  "exportVersion": "1.0",
  "sourceApp": "HealthConnect",
  "timezone": "Asia/Kolkata",
  "exportedAt": "2026-09-06T06:30:00Z",
  "dailyRecords": [
    {
      "date": "2026-09-06",
      "sources": ["com.sec.android.app.shealth", "com.google.android.apps.fitness"],
      "activity": {
        "steps": 8420,
        "distanceMeters": 6120,
        "totalCaloriesKcal": 2240,
        "activeCaloriesKcal": 480,
        "activeDurationMinutes": 48,
        "vo2MaxMlKgMin": { "avg": 42.5 }
      },
      "sleep": {
        "totalSleepMinutes": 450,
        "lightSleepMinutes": 240,
        "deepSleepMinutes": 95,
        "remSleepMinutes": 85,
        "awakeMinutes": 30,
        "sleepEfficiencyScore": 92
      },
      "vitals": {
        "restingHeartRateBpm": { "min": 56, "max": 68, "avg": 61 },
        "heartRateVariabilityMs": { "avg": 48 },
        "oxygenSaturationPct": { "avg": 98.5 },
        "bloodPressureMmHg": { "systolic": 118, "diastolic": 76, "pulse": 62 }
      },
      "bodyMeasurements": {
        "weightKg": 72.4,
        "bodyFatPct": 18.2,
        "leanBodyMassKg": 59.2
      }
    }
  ]
}`;

  const sampleWorkoutJson = `{
  "exportVersion": "1.0",
  "sourceApp": "Hevy",
  "syncedAt": "2026-09-06T08:45:00Z",
  "workouts": [
    {
      "workoutId": "c45cee5b-ccf3-40a8-912a-2d9ff9cdfe09",
      "date": "2026-09-06",
      "title": "Push & Core Power",
      "startTime": "07:15",
      "endTime": "08:10",
      "durationMinutes": 55,
      "totalVolumeKg": 4850,
      "totalSets": 16,
      "avgHeartRateBpm": 134,
      "maxHeartRateBpm": 162,
      "caloriesActualHr": 380,
      "notes": "Felt strong on dumbbell presses, increased weight on set 3.",
      "exercises": [
        {
          "exerciseName": "Bench Press (Dumbbell)",
          "targetMuscleGroup": "Chest",
          "equipment": "Dumbbell",
          "sets": [
            { "setNumber": 1, "setType": "warmup", "weightKg": 16, "reps": 12, "rpe": 6 },
            { "setNumber": 2, "setType": "normal", "weightKg": 24, "reps": 10, "rpe": 8 },
            { "setNumber": 3, "setType": "normal", "weightKg": 26, "reps": 8, "rpe": 9 },
            { "setNumber": 4, "setType": "failure", "weightKg": 26, "reps": 7, "rpe": 10 }
          ]
        },
        {
          "exerciseName": "Goblet Squat",
          "targetMuscleGroup": "Quads",
          "equipment": "Kettlebell",
          "sets": [
            { "setNumber": 1, "setType": "normal", "weightKg": 20, "reps": 12, "rpe": 7 },
            { "setNumber": 2, "setType": "normal", "weightKg": 24, "reps": 10, "rpe": 8.5 }
          ]
        }
      ]
    }
  ]
}`;

  const sampleAppsScript = `/**
 * Google Apps Script: Auto-Sync Health & Gym Data to nalama.family
 * Run on a daily time-driven trigger (e.g., 2 AM)
 */
function syncHevyToNalama() {
  const HEVY_API_KEY = "YOUR_HEVY_API_KEY";
  const FOLDER_NAME = "nalama.family";
  const TARGET_SUBFOLDER = "gym_workouts";

  // 1. Fetch latest workouts from Hevy API
  const response = UrlFetchApp.fetch("https://api.hevyapp.com/v1/workouts?page=1&pageSize=10", {
    headers: { "api-key": HEVY_API_KEY }
  });
  const data = JSON.parse(response.getContentText());

  // 2. Locate or create /nalama.family/imports/gym_workouts/ in user's Drive
  const mainFolders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (!mainFolders.hasNext()) return;
  const mainFolder = mainFolders.next();
  
  const importsFolders = mainFolder.getFoldersByName("imports");
  const importsFolder = importsFolders.hasNext() ? importsFolders.next() : mainFolder.createFolder("imports");
  
  const targetFolders = importsFolder.getFoldersByName(TARGET_SUBFOLDER);
  const targetFolder = targetFolders.hasNext() ? targetFolders.next() : importsFolder.createFolder(TARGET_SUBFOLDER);

  // 3. Write canonical workout payload
  const exportPayload = {
    exportVersion: "1.0",
    sourceApp: "Hevy",
    syncedAt: new Date().toISOString(),
    workouts: data.workouts.map(w => ({
      workoutId: w.id,
      date: w.start_time.split("T")[0],
      title: w.title,
      startTime: w.start_time.split("T")[1].substring(0, 5),
      durationMinutes: Math.round((new Date(w.end_time) - new Date(w.start_time)) / 60000),
      totalVolumeKg: w.exercises.reduce((acc, ex) => acc + ex.sets.reduce((sAcc, s) => sAcc + ((s.weight_kg || 0) * (s.reps || 0)), 0), 0),
      totalSets: w.exercises.reduce((acc, ex) => acc + ex.sets.length, 0),
      exercises: w.exercises.map(ex => ({
        exerciseName: ex.title,
        sets: ex.sets.map((s, idx) => ({
          setNumber: idx + 1,
          setType: s.set_type || "normal",
          weightKg: s.weight_kg || 0,
          reps: s.reps || 0,
          rpe: s.rpe || undefined
        }))
      }))
    }))
  };

  const fileName = "hevy_workouts.json";
  const existingFiles = targetFolder.getFilesByName(fileName);
  if (existingFiles.hasNext()) {
    existingFiles.next().setContent(JSON.stringify(exportPayload, null, 2));
  } else {
    targetFolder.createFile(fileName, JSON.stringify(exportPayload, null, 2), MimeType.PLAIN_TEXT);
  }
  Logger.log("Successfully synced workouts to Drive for nalama.family!");
}`;

  return (
    <div className="flex flex-col gap-6 pb-28 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors"
          aria-label="Go back to Settings"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">External Data Import Guide</h1>
          <p className="text-xs font-bold uppercase tracking-wider text-tree-700">Developer & Automation Specs</p>
        </div>
      </div>

      {/* Intro Philosophy Card */}
      <div className="bg-gradient-to-br from-tree-900 to-stone-900 text-white p-6 rounded-[2rem] shadow-md flex flex-col gap-3 relative overflow-hidden">
        <div className="flex items-center gap-2 text-tree-300">
          <Zap size={20} />
          <span className="text-xs font-bold uppercase tracking-widest">Zero-Database, Bring-Your-Own-Storage</span>
        </div>
        <p className="text-sm font-medium text-stone-200 leading-relaxed">
          <span className="font-bold text-white">nalama.family</span> does not store any health or workout data on private servers. Instead, automated external scripts (like Google Apps Script, Tasker, Shortcuts, or Python cron jobs) write standard JSON or CSV files directly into your Google Drive folder.
        </p>
        <div className="flex items-center gap-2 pt-1 text-xs text-tree-200 font-semibold">
          <ShieldCheck size={16} />
          <span>Every time you open the app, it automatically discovers and reconciles new data.</span>
        </div>
      </div>

      {/* Directory Structure */}
      <section className="bg-white p-5 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
        <div className="flex items-center gap-2 text-stone-900">
          <FolderTree size={20} className="text-teal-700" />
          <h2 className="text-lg font-bold">Google Drive Folder Paths</h2>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          Place your exported files in either of the two subfolders located in your private Google Drive:
        </p>

        <div className="bg-stone-900 text-stone-100 p-4 rounded-2xl font-mono text-xs overflow-x-auto leading-relaxed border border-stone-800">
          <span className="text-stone-400">My Drive /</span><br/>
          &nbsp;&nbsp;└── <span className="text-teal-400 font-bold">nalama.family/</span><br/>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── <span className="text-amber-300">context_memory.json</span> <span className="text-stone-500">(Facts & Profile)</span><br/>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── <span className="text-amber-300">logs_2026_09.json</span> <span className="text-stone-500">(Monthly partitions)</span><br/>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── <span className="text-teal-300 font-bold">imports/</span><br/>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── <span className="text-emerald-400 font-bold">health_data/</span> <span className="text-stone-400">← Place Biometrics, Sleep, & Steps here</span><br/>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;├── <span className="text-stone-300">biometrics_daily.json</span> / <span className="text-stone-300">*.csv</span><br/>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── <span className="text-sky-400 font-bold">gym_workouts/</span> <span className="text-stone-400">← Place Hevy / Strong workouts here</span><br/>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── <span className="text-stone-300">hevy_workouts.json</span> / <span className="text-stone-300">*.csv</span>
        </div>
      </section>

      {/* Canonical Schema 1: Health & Biometrics */}
      <section className="bg-white p-5 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-stone-900">
            <HeartPulse size={20} className="text-rose-600" />
            <h2 className="text-lg font-bold">1. Daily Health & Biometrics Schema</h2>
          </div>
          <button
            onClick={() => copyToClipboard('health', sampleHealthJson)}
            className="flex items-center gap-1.5 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-xl border border-teal-200 transition-colors"
          >
            {copiedSection === 'health' ? <Check size={14} className="text-teal-700" /> : <Copy size={14} />}
            <span>{copiedSection === 'health' ? 'Copied!' : 'Copy JSON'}</span>
          </button>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          Generic and future-proof across Android Health Connect, Samsung Health, Apple HealthKit, Oura, Garmin, and Fitbit. Save as <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800 font-bold">biometrics_daily.json</code>.
        </p>

        <div className="relative">
          <pre className="bg-stone-950 text-stone-200 p-4 rounded-2xl font-mono text-xs overflow-x-auto max-h-72 border border-stone-800 leading-relaxed">
            {sampleHealthJson}
          </pre>
        </div>
      </section>

      {/* Canonical Schema 2: Gym & Resistance Workouts */}
      <section className="bg-white p-5 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-stone-900">
            <Dumbbell size={20} className="text-sky-600" />
            <h2 className="text-lg font-bold">2. Gym Workouts Micro-Detail Schema</h2>
          </div>
          <button
            onClick={() => copyToClipboard('workout', sampleWorkoutJson)}
            className="flex items-center gap-1.5 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-xl border border-teal-200 transition-colors"
          >
            {copiedSection === 'workout' ? <Check size={14} className="text-teal-700" /> : <Copy size={14} />}
            <span>{copiedSection === 'workout' ? 'Copied!' : 'Copy JSON'}</span>
          </button>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          Structured for granular exercise & progressive overload reasoning by Gemini (exercises, set type, RPE, weights, volume). Save as <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800 font-bold">hevy_workouts.json</code>.
        </p>

        <div className="relative">
          <pre className="bg-stone-950 text-stone-200 p-4 rounded-2xl font-mono text-xs overflow-x-auto max-h-72 border border-stone-800 leading-relaxed">
            {sampleWorkoutJson}
          </pre>
        </div>
      </section>

      {/* CSV Compatibility */}
      <section className="bg-white p-5 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
        <div className="flex items-center gap-2 text-stone-900">
          <FileCode size={20} className="text-amber-600" />
          <h2 className="text-lg font-bold">3. CSV Files Supported</h2>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          You can also directly drop raw CSV exports without writing a translator script. The in-app parser automatically detects:
        </p>
        <ul className="text-xs text-stone-700 font-medium space-y-2 list-disc list-inside bg-stone-50 p-4 rounded-2xl border border-stone-150">
          <li><strong>Hevy / Strong / FitNotes CSV:</strong> Columns like <code>Date, Workout Title, Exercise Name, Set #, Weight, Reps, RPE</code>.</li>
          <li><strong>Health Data Exporter CSV:</strong> Columns like <code>Date, Steps, Light Sleep (min), Deep Sleep (min), Heart rate avg, Blood pressure</code>.</li>
        </ul>
      </section>

      {/* Copyable Google Apps Script Template */}
      <section className="bg-white p-5 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-stone-900">
            <Sparkles size={20} className="text-purple-600" />
            <h2 className="text-lg font-bold">4. Automation: Google Apps Script</h2>
          </div>
          <button
            onClick={() => copyToClipboard('script', sampleAppsScript)}
            className="flex items-center gap-1.5 text-xs font-bold text-purple-800 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-xl border border-purple-200 transition-colors"
          >
            {copiedSection === 'script' ? <Check size={14} className="text-purple-700" /> : <Copy size={14} />}
            <span>{copiedSection === 'script' ? 'Copied Script!' : 'Copy Script'}</span>
          </button>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          Create a free script at <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-teal-700 underline font-bold">script.google.com</a> and schedule a daily trigger to sync Hevy API workouts straight to your Drive!
        </p>

        <div className="relative">
          <pre className="bg-stone-950 text-stone-200 p-4 rounded-2xl font-mono text-xs overflow-x-auto max-h-72 border border-stone-800 leading-relaxed">
            {sampleAppsScript}
          </pre>
        </div>
      </section>

      {/* Back Button */}
      <button
        onClick={onBack}
        className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm"
      >
        <ArrowLeft size={18} />
        <span>Return to Settings</span>
      </button>
    </div>
  );
}
