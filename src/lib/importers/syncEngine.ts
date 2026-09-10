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

export type SyncStatusCallback = (event: {
  status: 'checking' | 'processing' | 'success' | 'error' | 'idle';
  message: string;
  details?: any;
}) => void;

export interface SyncExecutionResult {
  success: boolean;
  totalNewLogsAdded: number;
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
  onProgress?: SyncStatusCallback
): Promise<SyncExecutionResult> {
  const { token, mainFolderId } = driveState;
  const errors: string[] = [];

  try {
    onProgress?.({
      status: 'checking',
      message: 'Checking for new Health & Workout data in Google Drive...'
    });

    // 1. Ensure folder hierarchy exists in Drive: /nalama.family/imports/{health_data, gym_workouts}
    const { importsFolderId, healthFolderId, workoutFolderId } = await getOrCreateImportsFolders(token, mainFolderId);

    // 2. Scan both import folders for candidate files
    const [healthFiles, workoutFiles] = await Promise.all([
      listImportFolderFiles(token, healthFolderId),
      listImportFolderFiles(token, workoutFolderId)
    ]);

    const totalFiles = healthFiles.length + workoutFiles.length;
    if (totalFiles === 0) {
      const summaryMsg = 'No new import files found in /nalama.family/imports/';
      onProgress?.({
        status: 'idle',
        message: summaryMsg
      });
      return {
        success: true,
        totalNewLogsAdded: 0,
        filesProcessed: 0,
        message: summaryMsg
      };
    }

    onProgress?.({
      status: 'processing',
      message: `Processing ${totalFiles} health & workout file${totalFiles > 1 ? 's' : ''}...`,
      details: { healthFilesCount: healthFiles.length, workoutFilesCount: workoutFiles.length }
    });

    // 3. Read and parse all files
    const parsedResults: ParseResult[] = [];
    const allFilesToProcess = [
      ...healthFiles.map(f => ({ ...f, folderType: 'health' })),
      ...workoutFiles.map(f => ({ ...f, folderType: 'workout' }))
    ];

    for (const file of allFilesToProcess) {
      try {
        const lower = file.name.toLowerCase();
        let res: ParseResult;

        if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
          const binaryBuffer = await readBinaryDriveFile(token, file.id);
          if (!binaryBuffer) continue;
          res = parseExcelBuffer(file.name, binaryBuffer);
        } else {
          const rawContent = await readRawDriveFile(token, file.id);
          if (!rawContent) continue;
          res = parseImportFileContent(file.name, rawContent);
        }

        if (res.convertedLogs.length > 0) {
          parsedResults.push(res);
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
      const summaryMsg = 'No valid health or workout entries detected in import files.';
      onProgress?.({
        status: 'idle',
        message: summaryMsg
      });
      return {
        success: true,
        totalNewLogsAdded: 0,
        filesProcessed: totalFiles,
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
      const logDate = new Date(log.timestamp);
      const year = !isNaN(logDate.getTime()) ? logDate.getFullYear() : new Date().getFullYear();
      const monthNum = !isNaN(logDate.getTime()) ? String(logDate.getMonth() + 1).padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
      const monthKey = `${year}-${monthNum}`;

      if (!logsByMonth.has(monthKey)) {
        logsByMonth.set(monthKey, []);
      }
      logsByMonth.get(monthKey)!.push(log);
    }

    let totalSavedLogs = 0;

    // 5. Deduplicate and save to each monthly partition
    for (const [monthKey, monthLogs] of logsByMonth.entries()) {
      const [yearStr, monthStr] = monthKey.split('-');
      const partDate = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 15);
      
      const { fileId: logFileId, fileName } = await getOrCreateMonthlyLogFile(token, mainFolderId, partDate);
      const existingFileContent: HealthLogFileContent = (await readJsonFile(token, logFileId)) || {
        schema_version: '1.0',
        month: monthKey,
        logs: []
      };

      const existingLogs = Array.isArray(existingFileContent.logs) ? existingFileContent.logs : [];
      const existingIds = new Set(existingLogs.map(l => l.id));
      const existingKeys = new Set(existingLogs.map(l => `${l.displayDate}_${l.category}_${l.headline || ''}`));

      const distinctNewLogs: HealthLogEntry[] = [];
      for (const log of monthLogs) {
        const compositeKey = `${log.displayDate}_${log.category}_${log.headline || ''}`;
        if (!existingIds.has(log.id) && !existingKeys.has(compositeKey)) {
          distinctNewLogs.push(log);
          existingIds.add(log.id);
          existingKeys.add(compositeKey);
        }
      }

      if (distinctNewLogs.length > 0) {
        const mergedLogs = [...existingLogs, ...distinctNewLogs].sort((a, b) => {
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });

        const updatedFileContent: HealthLogFileContent = {
          ...existingFileContent,
          logs: mergedLogs
        };

        await writeJsonFile(token, fileName, updatedFileContent, mainFolderId, logFileId);
        totalSavedLogs += distinctNewLogs.length;
      }
    }

    // 6. Update userProfile sync timestamp
    const nowIso = new Date().toISOString();
    const finalSummary = totalSavedLogs > 0
      ? `Successfully synced ${totalSavedLogs} new health & workout log${totalSavedLogs > 1 ? 's' : ''} from ${totalFiles} file${totalFiles > 1 ? 's' : ''}.`
      : `Sync complete. All ${allNewLogs.length} items were already up to date.`;

    if (userProfile && driveState.contextFileId) {
      const updatedProfile: UserProfile = {
        ...userProfile,
        lastImportSyncTimestamp: nowIso,
        lastImportSyncStatus: 'success',
        lastImportSyncSummary: finalSummary
      };
      await saveUserProfileToDrive(token, driveState.contextFileId, updatedProfile);
    }

    onProgress?.({
      status: 'success',
      message: finalSummary,
      details: { totalSavedLogs, filesProcessed: totalFiles }
    });

    return {
      success: true,
      totalNewLogsAdded: totalSavedLogs,
      filesProcessed: totalFiles,
      message: finalSummary,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (syncErr: any) {
    console.error('External data sync execution failed:', syncErr);
    const errorMsg = syncErr.message || 'Failed to sync external health and workout data';
    
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
      filesProcessed: 0,
      message: errorMsg,
      errors: [errorMsg]
    };
  }
}
