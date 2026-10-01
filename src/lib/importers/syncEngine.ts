/**
 * Background Sync Engine for External Health & Workout Data in Google Drive
 * 
 * Flow:
 * 1. Checks if `enableExternalDataImport` is true in userProfile
 * 2. Scans `/nalama.family/imports/health_data/` and `/nalama.family/imports/gym_workouts/` in Drive
 * 3. Parses found JSON/CSV files into canonical records and structured HealthLogEntries
 * 4. Deduplicates against existing monthly log partitions (`logs_YYYY_MM.json`)
 * 5. Writes newly found entries directly to the respective monthly log partition in Google Drive
 * 6. Emits granular status updates ("Checking for new Health Data", "Processing new Health Data", "Import complete")
 */

import { DriveState, HealthLogEntry, HealthLogFileContent, UserProfile } from '../../types';
import { 
  getOrCreateImportsFolders, 
  listImportFolderFiles, 
  readRawDriveFile, 
  readBinaryDriveFile,
  readJsonFile, 
  writeJsonFile, 
  getOrCreateMonthlyLogFile,
  saveUserProfileToDrive 
} from '../drive';
import { parseImportFileContent, parseExcelBuffer, ParseResult } from './parser';
import { recordTelemetry, sanitizeError } from '../telemetry';

export type SyncStatusCallback = (event: {
  status: 'checking' | 'processing' | 'success' | 'error' | 'idle';
  message: string;
  details?: any;
}) => void;

export interface SyncExecutionResult {
  success: boolean;
  totalNewLogsAdded: number;
  totalLogsUpdated?: number;
  filesProcessed: number;
  message: string;
  errors?: string[];
}

/**
 * Runs the complete end-to-end sync cycle for external health and workout files
 */
export async function executeExternalDataSync(
  driveState: DriveState,
  userProfile?: UserProfile | null,
  onProgress?: SyncStatusCallback,
  forceSync: boolean = false
): Promise<SyncExecutionResult> {
  const { token, mainFolderId } = driveState;
  const errors: string[] = [];
  const syncStartTime = performance.now();

  try {
    onProgress?.({
      status: 'checking',
      message: 'Checking for new Health & Workout data in Google Drive...'
    });

    // 1. Ensure folder hierarchy exists in Drive: /nalama.family/imports/{health_data, gym_workouts}
    const { importsFolderId, healthFolderId, workoutFolderId } = await getOrCreateImportsFolders(token, mainFolderId);

    // 2. Scan import folders for candidate files: root /imports/, /imports/health_data/, /imports/gym_workouts/
    const [rootImportsFiles, healthFiles, workoutFiles] = await Promise.all([
      listImportFolderFiles(token, importsFolderId),
      listImportFolderFiles(token, healthFolderId),
      listImportFolderFiles(token, workoutFolderId)
    ]);

    const isNotFolder = (f: { mimeType: string }) => f.mimeType !== 'application/vnd.google-apps.folder';
    const allFiles = [
      ...rootImportsFiles.filter(isNotFolder).map(f => ({ ...f, folderType: 'root' as const })),
      ...healthFiles.filter(isNotFolder).map(f => ({ ...f, folderType: 'health' as const })),
      ...workoutFiles.filter(isNotFolder).map(f => ({ ...f, folderType: 'workout' as const }))
    ];

    const totalFiles = allFiles.length;
    if (totalFiles === 0) {
      const summaryMsg = 'No import files found in /nalama.family/imports/';
      onProgress?.({
        status: 'idle',
        message: summaryMsg
      });
      return {
        success: true,
        totalNewLogsAdded: 0,
        totalLogsUpdated: 0,
        filesProcessed: 0,
        message: summaryMsg
      };
    }

    const fileHashes: Record<string, string> = { ...(userProfile?.lastImportFileHashes || {}) };

    // Check which files have changed since the last successful sync
    const filesToProcess = forceSync ? allFiles : allFiles.filter(f => {
      const currentSig = f.md5Checksum || f.modifiedTime;
      const cachedSig = fileHashes[f.id];
      return !cachedSig || cachedSig !== currentSig;
    });

    if (filesToProcess.length === 0) {
      const summaryMsg = `All ${totalFiles} health & workout file${totalFiles > 1 ? 's are' : ' is'} up to date.`;
      onProgress?.({
        status: 'idle',
        message: summaryMsg
      });
      return {
        success: true,
        totalNewLogsAdded: 0,
        totalLogsUpdated: 0,
        filesProcessed: totalFiles,
        message: summaryMsg
      };
    }

    onProgress?.({
      status: 'processing',
      message: `Processing ${filesToProcess.length} health & workout file${filesToProcess.length > 1 ? 's' : ''}...`,
      details: { totalFiles, filesToProcessCount: filesToProcess.length }
    });

    // 3. Read and parse changed files
    const parsedResults: ParseResult[] = [];
    const successfullyParsedFileIds: { id: string; sig: string }[] = [];

    for (const file of filesToProcess) {
      try {
        const lower = file.name.toLowerCase();
        let res: ParseResult;

        const isExcelOrSpreadsheet = 
          file.mimeType === 'application/vnd.google-apps.spreadsheet' || 
          lower.endsWith('.xlsx') || 
          lower.endsWith('.xls');

        if (isExcelOrSpreadsheet) {
          const binaryBuffer = await readBinaryDriveFile(token, file.id, file.mimeType);
          if (!binaryBuffer) continue;
          res = parseExcelBuffer(file.name, binaryBuffer);
        } else {
          const rawContent = await readRawDriveFile(token, file.id, file.mimeType);
          if (!rawContent) continue;
          res = parseImportFileContent(file.name, rawContent);
        }

        if (res.convertedLogs.length > 0) {
          parsedResults.push(res);
          const sig = file.md5Checksum || file.modifiedTime || new Date().toISOString();
          successfullyParsedFileIds.push({ id: file.id, sig });
        } else if (res.error) {
          errors.push(`File ${file.name}: ${res.error}`);
        }
      } catch (fileErr: any) {
        console.warn(`Error processing file ${file.name}:`, fileErr);
        errors.push(`File ${file.name}: ${fileErr.message || 'Read error'}`);
      }
    }

    const allNewLogs = parsedResults.flatMap(r => r.convertedLogs);
    if (allNewLogs.length === 0) {
      const summaryMsg = 'No new valid health or workout entries detected in import files.';
      onProgress?.({
        status: 'idle',
        message: summaryMsg
      });
      return {
        success: true,
        totalNewLogsAdded: 0,
        totalLogsUpdated: 0,
        filesProcessed: filesToProcess.length,
        message: summaryMsg,
        errors: errors.length > 0 ? errors : undefined
      };
    }

    onProgress?.({
      status: 'processing',
      message: `Reconciling ${allNewLogs.length} imported activities with monthly logs...`
    });

    // 4. Group logs by Target Monthly Partition (e.g., 2026-09 -> logs_2026_09.json)
    const logsByMonth = new Map<string, HealthLogEntry[]>();
    for (const log of allNewLogs) {
      let monthKey = '';
      const logDate = new Date(log.timestamp);
      const validDate = !isNaN(logDate.getTime()) ? logDate : new Date();

      // Guard: Ensure partition year is realistic (prevent UUID regex or corrupted dates creating e.g. year 4574)
      let year = validDate.getFullYear();
      let month = validDate.getMonth() + 1;
      const currentYear = new Date().getFullYear();

      if (year > currentYear + 1 || year < 2015) {
        year = currentYear;
        month = new Date().getMonth() + 1;
      }

      const monthNum = String(month).padStart(2, '0');
      monthKey = `${year}-${monthNum}`;

      if (!logsByMonth.has(monthKey)) {
        logsByMonth.set(monthKey, []);
      }
      logsByMonth.get(monthKey)!.push(log);
    }

    let totalSavedLogs = 0;
    let totalUpdatedLogs = 0;

    // 5. In-Place Upsert and Deduplicate against each monthly partition
    for (const [monthKey, monthLogs] of logsByMonth.entries()) {
      const [yearStr, monthStr] = monthKey.split('-');
      const partDate = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 15);
      
      const { fileId: logFileId, fileName } = await getOrCreateMonthlyLogFile(token, mainFolderId, partDate);
      const existingFileContent: HealthLogFileContent = (await readJsonFile(token, logFileId)) || {
        schema_version: '1.0',
        month: monthKey,
        logs: []
      };

      const existingLogs: HealthLogEntry[] = Array.isArray(existingFileContent.logs) ? [...existingFileContent.logs] : [];
      const logMapById = new Map<string, number>();
      const logMapByKey = new Map<string, number>();

      existingLogs.forEach((l, index) => {
        logMapById.set(l.id, index);
        logMapByKey.set(`${l.displayDate}_${l.category}_${l.headline || ''}`, index);
      });

      let partitionModified = false;

      for (const newLog of monthLogs) {
        const compositeKey = `${newLog.displayDate}_${newLog.category}_${newLog.headline || ''}`;
        const existingIndex = logMapById.has(newLog.id) 
          ? logMapById.get(newLog.id)! 
          : logMapByKey.get(compositeKey);

        if (existingIndex !== undefined) {
          // Existing log found: check for updates (e.g. intra-day step increases or updated workout sets)
          const current = existingLogs[existingIndex];
          const hasChanged = 
            current.transcript !== newLog.transcript ||
            current.caloriesBurned !== newLog.caloriesBurned ||
            current.activeMinutes !== newLog.activeMinutes ||
            current.headline !== newLog.headline;

          if (hasChanged) {
            existingLogs[existingIndex] = {
              ...current,
              ...newLog,
              id: current.id // preserve ID
            };
            totalUpdatedLogs++;
            partitionModified = true;
          }
        } else {
          // New distinct log entry
          existingLogs.push(newLog);
          const newIdx = existingLogs.length - 1;
          logMapById.set(newLog.id, newIdx);
          logMapByKey.set(compositeKey, newIdx);
          totalSavedLogs++;
          partitionModified = true;
        }
      }

      if (partitionModified) {
        existingLogs.sort((a, b) => {
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });

        const updatedFileContent: HealthLogFileContent = {
          ...existingFileContent,
          logs: existingLogs
        };

        await writeJsonFile(token, fileName, updatedFileContent, mainFolderId, logFileId);
      }
    }

    // 6. Record file hashes for successful cache checkpoints
    successfullyParsedFileIds.forEach(item => {
      fileHashes[item.id] = item.sig;
    });

    const nowIso = new Date().toISOString();
    let finalSummary: string;
    if (totalSavedLogs > 0 && totalUpdatedLogs > 0) {
      finalSummary = `Synced ${totalSavedLogs} new and updated ${totalUpdatedLogs} existing health & workout entries.`;
    } else if (totalSavedLogs > 0) {
      finalSummary = `Successfully synced ${totalSavedLogs} new health & workout log${totalSavedLogs > 1 ? 's' : ''} from ${filesToProcess.length} file${filesToProcess.length > 1 ? 's' : ''}.`;
    } else if (totalUpdatedLogs > 0) {
      finalSummary = `Updated ${totalUpdatedLogs} existing health & workout log${totalUpdatedLogs > 1 ? 's' : ''} with latest metrics.`;
    } else {
      finalSummary = `Sync complete. All ${allNewLogs.length} items were already up to date.`;
    }

    if (userProfile && driveState.contextFileId) {
      const updatedProfile: UserProfile = {
        ...userProfile,
        lastImportSyncTimestamp: nowIso,
        lastImportSyncStatus: 'success',
        lastImportSyncSummary: finalSummary,
        lastImportFileHashes: fileHashes
      };
      await saveUserProfileToDrive(token, driveState.contextFileId, updatedProfile);
    }

    onProgress?.({
      status: 'success',
      message: finalSummary,
      details: { totalSavedLogs, totalUpdatedLogs, filesProcessed: filesToProcess.length }
    });

    recordTelemetry({
      capability: 'sync',
      operation: 'drive_import_sync',
      status: 'success',
      durationMs: performance.now() - syncStartTime,
      summary: finalSummary,
      meta: {
        totalSavedLogs,
        totalUpdatedLogs,
        filesProcessed: filesToProcess.length
      }
    });

    return {
      success: true,
      totalNewLogsAdded: totalSavedLogs,
      totalLogsUpdated: totalUpdatedLogs,
      filesProcessed: filesToProcess.length,
      message: finalSummary,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (syncErr: any) {
    console.error('External data sync execution failed:', syncErr);
    const errorMsg = syncErr.message || 'Failed to sync external health and workout data';
    const sanitized = sanitizeError(syncErr);

    recordTelemetry({
      capability: 'sync',
      operation: 'drive_import_sync',
      status: 'error',
      durationMs: performance.now() - syncStartTime,
      statusCode: sanitized.statusCode || 500,
      errorCode: sanitized.errorCode,
      summary: sanitized.summary,
      meta: {
        rawError: errorMsg.slice(0, 100)
      }
    });
    
    onProgress?.({
      status: 'error',
      message: `Sync failed: ${errorMsg}`
    });

    if (userProfile && driveState.contextFileId) {
      try {
        const updatedProfile: UserProfile = {
          ...userProfile,
          lastImportSyncTimestamp: new Date().toISOString(),
          lastImportSyncStatus: 'error',
          lastImportSyncSummary: `Failed: ${errorMsg}`
        };
        await saveUserProfileToDrive(token, driveState.contextFileId, updatedProfile);
      } catch (e) {
        // ignore
      }
    }

    return {
      success: false,
      totalNewLogsAdded: 0,
      totalLogsUpdated: 0,
      filesProcessed: 0,
      message: errorMsg,
      errors: [errorMsg]
    };
  }
}
