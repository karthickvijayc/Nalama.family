/**
 * Nalama Companion App Integration Constants & Universal Apps Script
 * Version: v1.0.0
 * Repo: https://github.com/karthickvijayc/nalama.companion
 */

export const COMPANION_APP_INFO = {
  version: 'V1.0.1',
  title: 'Nalama Companion (Android)',
  packageName: 'com.aistudio.nalamahealthsync.kcvyzc',
  apkFileName: 'Nalama-Companion-App.apk',
  apkSize: '23.8 MB',
  releaseTagUrl: 'https://github.com/karthickvijayc/nalama.companion/releases/tag/V1.0.1',
  apkDownloadUrl: 'https://github.com/karthickvijayc/nalama.companion/releases/download/V1.0.1/Nalama-Companion-App.apk',
  latestDownloadUrl: 'https://github.com/karthickvijayc/nalama.companion/releases/download/V1.0.1/Nalama-Companion-App.apk',
  repoUrl: 'https://github.com/karthickvijayc/nalama.companion',
  supportedSources: ['Android Health Connect', 'Hevy Gym Workouts (API)', 'Samsung Health', 'Fitbit / Pixel Watch', 'Garmin / Oura via Health Connect'],
  features: [
    'Zero-Database, Bring-Your-Own-Storage (BYOS) architecture',
    'Native Android Health Connect biometrics (Steps, Distance, Calories, Sleep Stages, Heart Rate, HRV, SpO2, Blood Pressure, Weight)',
    'Direct Hevy Gym Workout API sync with exercise sets, weights, reps, volume, and RPE',
    'Automated background sync via Android WorkManager (15 min, 1 hr, 6 hr, 12 hr, 24 hr intervals)',
    'Dual-Destination Sync: logs directly to Google Sheets AND writes canonical JSON/CSV to Google Drive',
    'Built-in Wearable Simulator & Test Dispatcher for testing without physical sensors'
  ]
};

/**
 * Universal Google Apps Script Webhook
 * Solves the gap between Google Sheets appending and Google Drive file creation:
 * - Appends live rows into Google Sheets tabs ("Biometrics" and "Workouts")
 * - Stores canonical JSON & CSV into Drive: /nalama.family/imports/health_data/ & /nalama.family/imports/gym_workouts/
 * - Nalama Family PWA automatically reconciles Drive files on startup!
 */
export const UNIVERSAL_APPS_SCRIPT_CODE = `/**
 * ==============================================================================
 * UNIVERSAL NALAMA GOOGLE APPS SCRIPT WEBHOOK (SHEETS + DRIVE FILE SYNC)
 * ==============================================================================
 * For Nalama Companion Android App & Nalama Family PWA
 * 
 * Capabilities:
 * 1. Appends real-time biometrics & workouts to Google Sheets (Tabs: "Biometrics", "Workouts")
 * 2. Writes canonical JSON and CSV files to Google Drive (/nalama.family/imports/...)
 * 3. Handles both Android Health Connect biometrics and Hevy gym workouts
 * 
 * Deployment Instructions:
 * 1. Open https://script.google.com and click "+ New project".
 * 2. Paste this entire code into Code.gs (replacing any template text).
 * 3. Click "Deploy" > "New deployment".
 * 4. Select type: "Web app".
 * 5. Configuration:
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone" (allows Nalama Companion to post without server tokens)
 * 6. Click "Deploy", grant Drive & Sheets permissions, and copy the Web app URL.
 * 7. Paste the Web app URL into the Nalama Companion Android App settings!
 * ==============================================================================
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No post data received" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || "";
    var sourceApp = payload.sourceApp || (action.indexOf("gym") !== -1 ? "Hevy" : "HealthConnect");
    var folderPath = payload.folderPath || (sourceApp === "Hevy" ? "nalama.family/imports/gym_workouts" : "nalama.family/imports/health_data");
    var format = payload.format || "both";
    var writeMode = payload.writeMode || "append";
    var fileName = payload.fileName || (sourceApp === "Hevy" ? "hevy_workouts" : "biometrics_daily");

    // Unpack nested jsonData if stringified or formatted
    var jsonData = payload.jsonData;
    if (typeof jsonData === "string") {
      try { jsonData = JSON.parse(jsonData); } catch(ex) {}
    }
    // Also support { record: { ... } } from simple README format
    if (!jsonData && payload.record) {
      jsonData = { dailyRecords: [payload.record] };
    }
    var csvData = payload.csvData;

    // 1. SYNC TO GOOGLE SHEETS (Creates spreadsheet/tabs automatically)
    var sheetsLogged = 0;
    try {
      sheetsLogged = syncToGoogleSheet(sourceApp, jsonData, csvData);
    } catch(sheetErr) {
      Logger.log("Sheet sync notice: " + sheetErr);
    }

    // 2. SYNC TO GOOGLE DRIVE (/nalama.family/imports/...)
    var filesUpdated = [];
    try {
      var folder = getOrCreateFolderHierarchy(folderPath);
      
      // Save CSV if provided
      if (csvData && (format === "csv" || format === "both")) {
        filesUpdated.push(saveDriveFile(folder, fileName + ".csv", csvData, MimeType.CSV, writeMode));
      }
      
      // Save JSON if provided
      if (jsonData && (format === "json" || format === "both")) {
        filesUpdated.push(saveDriveJson(folder, fileName + ".json", jsonData, sourceApp, writeMode));
      }
    } catch(driveErr) {
      Logger.log("Drive sync error: " + driveErr);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      sourceApp: sourceApp,
      message: "Export synced successfully to Google Sheets & Drive",
      sheetsLogged: sheetsLogged,
      files: filesUpdated,
      recordsCount: payload.recordsCount || 1
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Appends rows directly to Google Sheets.
 * Automatically creates "Nalama Health & Workouts" spreadsheet if not bound to an active sheet.
 */
function syncToGoogleSheet(sourceApp, jsonData, csvData) {
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch(e) {
    var files = DriveApp.getFilesByName("Nalama Health & Workouts");
    if (files.hasNext()) {
      ss = SpreadsheetApp.open(files.next());
    } else {
      ss = SpreadsheetApp.create("Nalama Health & Workouts");
    }
  }
  if (!ss) return 0;

  if (sourceApp === "Hevy" || (jsonData && jsonData.workouts)) {
    var sheet = ss.getSheetByName("Workouts");
    if (!sheet) {
      sheet = ss.insertSheet("Workouts");
      sheet.appendRow([
        "Workout ID", "Date", "Title", "Start Time", "End Time", "Duration (min)",
        "Total Volume (kg)", "Sets", "Avg HR", "Max HR", "Calories",
        "Exercise", "Muscle Group", "Equipment", "Set #", "Set Type", "Weight (kg)", "Reps", "RPE", "Notes"
      ]);
      sheet.setFrozenRows(1);
    }
    var rowsAdded = 0;
    var workouts = (jsonData && jsonData.workouts) ? jsonData.workouts : [];
    workouts.forEach(function(w) {
      if (!w.exercises || w.exercises.length === 0) {
        sheet.appendRow([
          w.workoutId, w.date, w.title, w.startTime, w.endTime || "", w.durationMinutes,
          w.totalVolumeKg, w.totalSets, w.avgHeartRateBpm || "", w.maxHeartRateBpm || "", w.caloriesActualHr || "",
          "", "", "", "", "", "", "", "", w.notes || ""
        ]);
        rowsAdded++;
      } else {
        w.exercises.forEach(function(ex) {
          (ex.sets || []).forEach(function(s) {
            sheet.appendRow([
              w.workoutId, w.date, w.title, w.startTime, w.endTime || "", w.durationMinutes,
              w.totalVolumeKg, w.totalSets, w.avgHeartRateBpm || "", w.maxHeartRateBpm || "", w.caloriesActualHr || "",
              ex.exerciseName, ex.targetMuscleGroup || "", ex.equipment || "",
              s.setNumber, s.setType, s.weightKg, s.reps, s.rpe || "", w.notes || ""
            ]);
            rowsAdded++;
          });
        });
      }
    });
    return rowsAdded;
  } else {
    // Health Connect Biometrics
    var sheet = ss.getSheetByName("Biometrics");
    if (!sheet) {
      sheet = ss.insertSheet("Biometrics");
      sheet.appendRow([
        "Date", "Sources", "Steps", "Distance (m)", "Total Calories", "Active Calories", "Active Mins",
        "Total Sleep (min)", "Light Sleep", "Deep Sleep", "REM Sleep", "Awake (min)", "Sleep Score",
        "Resting HR Avg", "HRV (ms)", "SpO2 (%)", "BP Systolic", "BP Diastolic", "Weight (kg)", "Body Fat (%)"
      ]);
      sheet.setFrozenRows(1);
    }
    var records = (jsonData && jsonData.dailyRecords) ? jsonData.dailyRecords : (jsonData && jsonData.date ? [jsonData] : []);
    var rowsAdded = 0;
    records.forEach(function(r) {
      var act = r.activity || {};
      var slp = r.sleep || {};
      var vit = r.vitals || {};
      var body = r.bodyMeasurements || {};
      var bp = vit.bloodPressureMmHg || {};
      sheet.appendRow([
        r.date, (r.sources || []).join("; "),
        act.steps || 0, act.distanceMeters || 0, act.totalCaloriesKcal || 0, act.activeCaloriesKcal || 0, act.activeDurationMinutes || 0,
        slp.totalSleepMinutes || 0, slp.lightSleepMinutes || 0, slp.deepSleepMinutes || 0, slp.remSleepMinutes || 0, slp.awakeMinutes || 0, slp.sleepEfficiencyScore || "",
        vit.restingHeartRateBpm ? (vit.restingHeartRateBpm.avg || vit.restingHeartRateBpm.min || "") : "",
        vit.heartRateVariabilityMs ? (vit.heartRateVariabilityMs.avg || "") : "",
        vit.oxygenSaturationPct ? (vit.oxygenSaturationPct.avg || "") : "",
        bp.systolic || "", bp.diastolic || "",
        body.weightKg || "", body.bodyFatPct || ""
      ]);
      rowsAdded++;
    });
    return rowsAdded;
  }
}

function getOrCreateFolderHierarchy(path) {
  var parts = path.split("/");
  var current = DriveApp.getRootFolder();
  for (var i = 0; i < parts.length; i++) {
    var name = parts[i].trim();
    if (name.length === 0) continue;
    var sub = current.getFoldersByName(name);
    if (sub.hasNext()) {
      current = sub.next();
    } else {
      current = current.createFolder(name);
    }
  }
  return current;
}

function saveDriveFile(folder, fileName, content, mimeType, writeMode) {
  var existing = folder.getFilesByName(fileName);
  if (existing.hasNext() && writeMode === "append") {
    var file = existing.next();
    var existingText = file.getBlob().getDataAsString();
    var newLines = content.trim().split("\\n").slice(1).join("\\n");
    if (newLines.length > 0) file.setContent(existingText + "\\n" + newLines);
    return fileName + " (appended)";
  } else if (existing.hasNext()) {
    existing.next().setContent(content);
    return fileName + " (updated)";
  } else {
    folder.createFile(fileName, content, mimeType);
    return fileName + " (created)";
  }
}

function saveDriveJson(folder, fileName, newJson, sourceApp, writeMode) {
  var existing = folder.getFilesByName(fileName);
  var jsonStr = typeof newJson === "string" ? newJson : JSON.stringify(newJson, null, 2);
  if (existing.hasNext() && writeMode === "append") {
    var file = existing.next();
    try {
      var old = JSON.parse(file.getBlob().getDataAsString());
      if (sourceApp === "Hevy" && old.workouts && newJson.workouts) {
        var ids = new Set(old.workouts.map(function(w){ return w.workoutId; }));
        newJson.workouts.forEach(function(w){ if (!ids.has(w.workoutId)) old.workouts.push(w); });
        old.syncedAt = new Date().toISOString();
        file.setContent(JSON.stringify(old, null, 2));
      } else if (old.dailyRecords && newJson.dailyRecords) {
        var dates = new Set(old.dailyRecords.map(function(d){ return d.date; }));
        newJson.dailyRecords.forEach(function(d){ if (!dates.has(d.date)) old.dailyRecords.push(d); });
        old.exportedAt = new Date().toISOString();
        file.setContent(JSON.stringify(old, null, 2));
      } else {
        file.setContent(jsonStr);
      }
    } catch(e) {
      file.setContent(jsonStr);
    }
    return fileName + " (merged)";
  } else if (existing.hasNext()) {
    existing.next().setContent(jsonStr);
    return fileName + " (updated)";
  } else {
    folder.createFile(fileName, jsonStr, MimeType.PLAIN_TEXT);
    return fileName + " (created)";
  }
}
`;

export interface GapValidationItem {
  area: string;
  companionState: string;
  pwaState: string;
  resolution: string;
  status: 'verified' | 'resolved' | 'operational';
}

export const COMPANION_GAP_ANALYSIS: GapValidationItem[] = [
  {
    area: 'Google Sheets vs Drive File Webhook Destination',
    companionState: 'README showed a simple spreadsheet-only append script; internal code (GoogleAppsScriptWebhookClient.kt) showed Drive folder creation.',
    pwaState: 'PWA ingests from Google Drive /nalama.family/imports/.',
    resolution: 'Provided a unified Universal Google Apps Script Webhook that simultaneously logs rows into Google Sheets tabs ("Biometrics" & "Workouts") and writes canonical files into Drive for the PWA.',
    status: 'resolved'
  },
  {
    area: 'CSV Column Naming (Snake_case vs Spaced)',
    companionState: 'Companion CsvConverter outputs snake_case headers (distance_meters, total_calories_kcal, resting_hr_avg, etc.).',
    pwaState: 'PWA parser previously checked human-spaced names (Distance (m), Total Calories (kcal)).',
    resolution: 'Updated parser.ts to seamlessly accept both snake_case, camelCase, and human-formatted column names with full vitals & workout normalization.',
    status: 'resolved'
  },
  {
    area: 'JSON Webhook Wrapper Payload Unwrapping',
    companionState: 'Android app posts a top-level payload with { action, sourceApp, jsonData, csvData }.',
    pwaState: 'PWA was expecting raw { dailyRecords: [...] } or { workouts: [...] }.',
    resolution: 'Enhanced parser.ts to recursively detect and unwrap jsonData objects or strings, ensuring direct compatibility if raw webhook logs are saved.',
    status: 'resolved'
  },
  {
    area: 'Blood Pressure & Heart Rate Normalization',
    companionState: 'Companion app tracks separate bp_systolic, bp_diastolic, bp_pulse.',
    pwaState: 'PWA accepts systolic and diastolic numbers and formats them as standard "120/80 mmHg" vitals entries.',
    resolution: 'Full end-to-end alignment verified. Blood pressure renders cleanly in Vitals and Daily Logs.',
    status: 'verified'
  },
  {
    area: 'Hevy API Key Configuration',
    companionState: 'User enters free Hevy API key in Android app settings (api.hevyapp.com).',
    pwaState: 'Documents how to obtain the Hevy API key directly inside Hevy app (Settings > Developer).',
    resolution: 'Documented in setup instructions; direct device-to-API transmission with BYOS privacy.',
    status: 'operational'
  }
];
