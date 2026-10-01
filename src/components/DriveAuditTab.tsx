import React, { useState, useEffect } from 'react';
import { 
  ScanSearch, 
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  HardDrive, 
  FileText, 
  ArrowRight, 
  ShieldCheck,
  Filter,
  Check,
  Copy,
  Info
} from 'lucide-react';
import { DriveState, HealthLogEntry, HealthLogFileContent } from '../types';
import { 
  getOrCreateImportsFolders, 
  listImportFolderFiles, 
  readRawDriveFile, 
  readJsonFile 
} from '../lib/drive';
import { parseImportFileContent, normalizeDateStr } from '../lib/importers/parser';
import { executeExternalDataSync } from '../lib/importers/syncEngine';

interface DriveAuditTabProps {
  driveState: DriveState | null;
  onRefreshLogs?: () => void;
}

interface RawRecordAudit {
  sourceFile: string;
  sourceType: 'workout' | 'biometrics';
  rawId: string;
  rawDateStr: string;
  normalizedDate: string;
  title: string;
  metrics: string;
  status: 'matched' | 'future_anomaly' | 'date_shifted' | 'missing';
  matchedLogId?: string;
  matchedLogTimestamp?: string;
  matchedLogDate?: string;
}

interface PartitionFileAudit {
  id: string;
  name: string;
  year: number;
  month: number;
  isFuture: boolean;
  logCount: number;
}

export default function DriveAuditTab({ driveState, onRefreshLogs }: DriveAuditTabProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string>('');
  const [rawRecords, setRawRecords] = useState<RawRecordAudit[]>([]);
  const [partitionFiles, setPartitionFiles] = useState<PartitionFileAudit[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'anomalies_only' | 'matched_only'>('anomalies_only');
  const [isPurging, setIsPurging] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runAuditScan = async () => {
    if (!driveState) {
      setScanMessage('Drive not connected. Please log in first.');
      return;
    }

    setIsScanning(true);
    setScanMessage('Scanning Google Drive imports and monthly logs...');
    setActionNotice(null);

    const { token, mainFolderId } = driveState;
    const currentYear = new Date().getFullYear();
    const todayIso = new Date().toISOString().split('T')[0];

    try {
      // 1. Scan /nalama.family/ for all logs_*.json partitions (including rogue future years)
      setScanMessage('Scanning monthly partitions in /nalama.family/...');
      const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${mainFolderId}' in parents and trashed=false and mimeType='application/json'`)}&fields=files(id,name,size)&spaces=drive`;
      const partRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
      const partData = await partRes.json();

      const allPartitions: PartitionFileAudit[] = [];
      const allLoadedLogs: HealthLogEntry[] = [];

      if (Array.isArray(partData.files)) {
        for (const file of partData.files) {
          const match = file.name.match(/^logs_(\d{4})_(\d{2})\.json$/);
          if (match) {
            const year = parseInt(match[1], 10);
            const month = parseInt(match[2], 10);
            const isFuture = year > currentYear || (year === currentYear && month > (new Date().getMonth() + 1));
            
            // Read content
            const content: HealthLogFileContent = await readJsonFile(token, file.id);
            const count = content?.logs?.length || 0;
            if (content?.logs) {
              allLoadedLogs.push(...content.logs);
            }

            allPartitions.push({
              id: file.id,
              name: file.name,
              year,
              month,
              isFuture,
              logCount: count
            });
          }
        }
      }

      setPartitionFiles(allPartitions);

      // 2. Scan /nalama.family/imports/{gym_workouts, health_data}
      setScanMessage('Scanning raw files in /nalama.family/imports/...');
      const { healthFolderId, workoutFolderId, importsFolderId } = await getOrCreateImportsFolders(token, mainFolderId);

      const [healthFiles, workoutFiles, rootImports] = await Promise.all([
        listImportFolderFiles(token, healthFolderId),
        listImportFolderFiles(token, workoutFolderId),
        listImportFolderFiles(token, importsFolderId)
      ]);

      const candidateFiles = [
        ...workoutFiles.map(f => ({ ...f, type: 'workout' as const })),
        ...healthFiles.map(f => ({ ...f, type: 'biometrics' as const })),
        ...rootImports.map(f => ({ ...f, type: (f.name.includes('hevy') || f.name.includes('workout') ? 'workout' : 'biometrics') as 'workout' | 'biometrics' }))
      ];

      // 3. Parse raw files and compare against loaded logs
      setScanMessage(`Analyzing ${candidateFiles.length} raw import files vs ${allLoadedLogs.length} stored logs...`);
      const auditedRaw: RawRecordAudit[] = [];

      for (const file of candidateFiles) {
        const rawContent = await readRawDriveFile(token, file.id, file.mimeType);
        if (!rawContent) continue;

        const parsed = parseImportFileContent(file.name, rawContent);

        if (parsed.workoutSessions && parsed.workoutSessions.length > 0) {
          for (const session of parsed.workoutSessions) {
            const rawDateStr = session.date || '';
            const normalized = normalizeDateStr(rawDateStr);
            
            // Look for matching log in allLoadedLogs
            // Matching can be by workout_id in id or by headline/date
            const matchedLog = allLoadedLogs.find(l => 
              l.id.includes(session.workoutId) || 
              (l.headline?.toLowerCase() === session.title?.toLowerCase().slice(0, 30) && Math.abs(new Date(l.timestamp).getTime() - new Date(normalized).getTime()) < 86400000 * 2)
            );

            let status: RawRecordAudit['status'] = 'matched';
            if (!matchedLog) {
              status = 'missing';
            } else {
              const logYear = new Date(matchedLog.timestamp).getFullYear();
              const logIsoDate = new Date(matchedLog.timestamp).toISOString().split('T')[0];

              if (logYear > currentYear || logIsoDate > todayIso) {
                status = 'future_anomaly';
              } else if (logIsoDate !== normalized) {
                status = 'date_shifted';
              }
            }

            auditedRaw.push({
              sourceFile: file.name,
              sourceType: 'workout',
              rawId: session.workoutId,
              rawDateStr: rawDateStr || '--',
              normalizedDate: normalized,
              title: session.title || 'Gym Workout',
              metrics: `${session.totalSets || 0} sets | ${(session.totalVolumeKg || 0).toLocaleString()} kg | ${session.durationMinutes || 0} min`,
              status,
              matchedLogId: matchedLog?.id,
              matchedLogTimestamp: matchedLog?.timestamp,
              matchedLogDate: matchedLog?.displayDate
            });
          }
        }
      }

      setRawRecords(auditedRaw);
      setScanMessage(`Audit completed. Found ${auditedRaw.length} raw records across ${allPartitions.length} monthly partition files.`);
    } catch (err: any) {
      console.error('Audit scan failed:', err);
      setScanMessage(`Scan error: ${err.message || 'Failed to inspect Drive files'}`);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (driveState) {
      runAuditScan();
    }
  }, [driveState?.token]);

  // Purge future/rogue partitions
  const handlePurgeFuturePartitions = async () => {
    if (!driveState) return;
    const futureParts = partitionFiles.filter(p => p.isFuture);
    if (futureParts.length === 0) {
      setActionNotice('No future partitions found to purge.');
      return;
    }

    if (!window.confirm(`Delete ${futureParts.length} future partition file(s) from your Google Drive (${futureParts.map(p => p.name).join(', ')})? This will remove orphaned future records.`)) {
      return;
    }

    setIsPurging(true);
    setActionNotice('Deleting future partitions...');

    try {
      for (const part of futureParts) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${part.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${driveState.token}` }
        });
      }
      setActionNotice(`Successfully deleted ${futureParts.length} future partition file(s). Now click 'Run Clean Re-Sync' to re-import records with the fixed parser.`);
      // Refresh scan
      await runAuditScan();
      onRefreshLogs?.();
    } catch (err: any) {
      setActionNotice(`Purge failed: ${err.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  // Run a clean re-sync
  const handleCleanResync = async () => {
    if (!driveState) return;
    setIsResyncing(true);
    setActionNotice('Triggering full re-sync using the new date parser...');

    try {
      const result = await executeExternalDataSync(driveState, null, (e) => {
        setScanMessage(`Re-syncing: ${e.message}`);
      }, true); // forceSync = true

      setActionNotice(`Re-sync finished: ${result.message}`);
      await runAuditScan();
      onRefreshLogs?.();
    } catch (err: any) {
      setActionNotice(`Re-sync failed: ${err.message}`);
    } finally {
      setIsResyncing(false);
    }
  };

  const handleCopyReport = () => {
    const report = {
      auditTimestamp: new Date().toISOString(),
      partitions: partitionFiles,
      recordsAudited: rawRecords.length,
      anomalies: rawRecords.filter(r => r.status !== 'matched'),
      summary: {
        totalRecords: rawRecords.length,
        matched: rawRecords.filter(r => r.status === 'matched').length,
        futureAnomalies: rawRecords.filter(r => r.status === 'future_anomaly').length,
        dateShifted: rawRecords.filter(r => r.status === 'date_shifted').length,
        missing: rawRecords.filter(r => r.status === 'missing').length
      }
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter records
  const filteredRecords = rawRecords.filter(r => {
    if (filterType === 'anomalies_only') return r.status !== 'matched';
    if (filterType === 'matched_only') return r.status === 'matched';
    return true;
  });

  const futurePartitionCount = partitionFiles.filter(p => p.isFuture).length;
  const anomalyCount = rawRecords.filter(r => r.status === 'future_anomaly' || r.status === 'date_shifted').length;

  return (
    <div className="flex-1 overflow-y-auto pb-28 pt-4 px-4 sm:px-6 max-w-4xl mx-auto flex flex-col gap-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-stone-900 via-stone-900 to-stone-950 text-white p-5 rounded-2xl border border-stone-800 shadow-md flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <ScanSearch size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">Google Drive Data Reconciliation Audit</h1>
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-amber-500/30">
                  Diagnostic Tab
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                Compares raw files in <code className="text-teal-300 font-mono text-[11px]">/nalama.family/imports/</code> against active monthly log partitions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runAuditScan}
              disabled={isScanning}
              className="bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 border border-stone-700 transition-colors"
            >
              <RefreshCw size={13} className={isScanning ? 'animate-spin text-teal-400' : ''} />
              <span>{isScanning ? 'Scanning...' : 'Re-scan Drive'}</span>
            </button>
            <button
              onClick={handleCopyReport}
              className="bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 border border-stone-700 transition-colors"
              title="Copy sanitized JSON comparison report"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy Report'}</span>
            </button>
          </div>
        </div>

        {/* Status notification */}
        {scanMessage && (
          <div className="bg-stone-800/80 rounded-xl px-3.5 py-2 text-xs text-stone-300 border border-stone-700/80 flex items-center gap-2">
            <Info size={14} className="text-teal-400 shrink-0" />
            <span className="truncate">{scanMessage}</span>
          </div>
        )}

        {actionNotice && (
          <div className="bg-teal-950/80 rounded-xl px-3.5 py-2 text-xs text-teal-200 border border-teal-700/80 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-teal-400 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs flex flex-col gap-1">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Raw Records Audited</span>
          <span className="text-2xl font-black text-stone-900">{rawRecords.length}</span>
          <span className="text-[10px] text-stone-400">Found in /imports/ folder</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs flex flex-col gap-1">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Monthly Partitions</span>
          <span className="text-2xl font-black text-stone-900">{partitionFiles.length}</span>
          <span className="text-[10px] text-stone-400">logs_YYYY_MM.json files</span>
        </div>

        <div className={`p-4 rounded-2xl border shadow-2xs flex flex-col gap-1 ${
          futurePartitionCount > 0 ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-white border-stone-200'
        }`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Rogue Future Files</span>
          <span className="text-2xl font-black text-rose-600">{futurePartitionCount}</span>
          <span className="text-[10px] text-rose-600/80">Years &gt; 2026 (e.g. 2028, 4574)</span>
        </div>

        <div className={`p-4 rounded-2xl border shadow-2xs flex flex-col gap-1 ${
          anomalyCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-white border-stone-200'
        }`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Date Anomalies</span>
          <span className="text-2xl font-black text-amber-600">{anomalyCount}</span>
          <span className="text-[10px] text-amber-700/80">Swapped or future dates</span>
        </div>
      </div>

      {/* Repair Actions if Anomalies / Future Partitions detected */}
      {(futurePartitionCount > 0 || anomalyCount > 0) && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-rose-900">Future Partitions / Date Inversions Detected</h3>
              <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                Found {futurePartitionCount} rogue future partition(s) and {anomalyCount} shifted records caused by earlier date parsing. You can purge future files and re-sync cleanly with the updated parser now.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {futurePartitionCount > 0 && (
              <button
                onClick={handlePurgeFuturePartitions}
                disabled={isPurging}
                className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <Trash2 size={13} />
                <span>{isPurging ? 'Purging...' : `Purge ${futurePartitionCount} Future File(s)`}</span>
              </button>
            )}
            <button
              onClick={handleCleanResync}
              disabled={isResyncing}
              className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <RefreshCw size={13} className={isResyncing ? 'animate-spin' : ''} />
              <span>{isResyncing ? 'Re-syncing...' : 'Run Clean Re-Sync'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Partition Files Overview */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col overflow-hidden">
        <div className="p-4 border-b border-stone-150 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-stone-700" />
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider">Drive Monthly Partition Files</h2>
          </div>
          <span className="text-[11px] font-bold text-stone-500">{partitionFiles.length} file(s)</span>
        </div>

        <div className="divide-y divide-stone-100 max-h-48 overflow-y-auto">
          {partitionFiles.length === 0 ? (
            <div className="p-6 text-center text-xs text-stone-400 font-medium">
              No logs_*.json files found yet.
            </div>
          ) : (
            partitionFiles.map(part => (
              <div key={part.id} className="p-3 px-4 flex items-center justify-between text-xs hover:bg-stone-50/60 transition-colors">
                <div className="flex items-center gap-2.5">
                  <FileText size={15} className={part.isFuture ? 'text-rose-500' : 'text-stone-400'} />
                  <div>
                    <span className="font-mono font-bold text-stone-900">{part.name}</span>
                    {part.isFuture && (
                      <span className="ml-2 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        Future Year ({part.year})
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-stone-500 font-medium">{part.logCount} record(s)</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Raw Import Records vs Stored Logs Side-by-Side Comparison */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col overflow-hidden">
        <div className="p-4 border-b border-stone-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/50">
          <div>
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-teal-700" />
              <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider">Imported Records vs Processed Logs</h2>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Direct comparison between the raw export file data and what was saved into Google Drive.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <button
              onClick={() => setFilterType('anomalies_only')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                filterType === 'anomalies_only' 
                  ? 'bg-amber-600 text-white' 
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Anomalies Only ({rawRecords.filter(r => r.status !== 'matched').length})
            </button>
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                filterType === 'all' 
                  ? 'bg-stone-800 text-white' 
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              All Records ({rawRecords.length})
            </button>
            <button
              onClick={() => setFilterType('matched_only')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                filterType === 'matched_only' 
                  ? 'bg-emerald-700 text-white' 
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Matched ({rawRecords.filter(r => r.status === 'matched').length})
            </button>
          </div>
        </div>

        {/* Records Table */}
        <div className="divide-y divide-stone-100 overflow-x-auto">
          {filteredRecords.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-400 font-medium">
              {rawRecords.length === 0 
                ? 'No imported workout records found in Drive.' 
                : 'No records matching the selected filter.'}
            </div>
          ) : (
            filteredRecords.map((rec, i) => {
              const isFuture = rec.status === 'future_anomaly';
              const isShifted = rec.status === 'date_shifted';
              const isMissing = rec.status === 'missing';

              return (
                <div 
                  key={`${rec.rawId}-${i}`} 
                  className={`p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                    isFuture ? 'bg-rose-50/50 hover:bg-rose-50' : isShifted ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-stone-50/80'
                  }`}
                >
                  {/* Left Column: Raw Import Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-stone-900 text-xs">{rec.title}</span>
                      <span className="text-[10px] font-mono text-stone-400">({rec.sourceFile})</span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-[11px] text-stone-500 font-medium">
                      <span>Raw Date in File: <strong className="font-mono text-stone-800">{rec.rawDateStr}</strong></span>
                      <span>Normalized: <strong className="font-mono text-teal-700">{rec.normalizedDate}</strong></span>
                    </div>

                    <div className="text-[11px] text-stone-400 mt-0.5">
                      {rec.metrics}
                    </div>
                  </div>

                  {/* Right Column: Status & Processed Stored Log Match */}
                  <div className="flex flex-col sm:items-end gap-1 shrink-0">
                    {rec.status === 'matched' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 size={12} /> Matched in Stored Logs
                      </span>
                    )}

                    {isFuture && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                        <AlertTriangle size={12} /> Saved in Future Year!
                      </span>
                    )}

                    {isShifted && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                        <AlertTriangle size={12} /> Date Mismatch vs Stored
                      </span>
                    )}

                    {isMissing && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                        Not in Stored Logs
                      </span>
                    )}

                    {rec.matchedLogDate && (
                      <div className="text-[10px] font-mono text-stone-500 flex items-center gap-1">
                        <span>Stored Display:</span>
                        <strong className="text-stone-800">{rec.matchedLogDate}</strong>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-stone-50 border-t border-stone-150 text-[11px] text-stone-500 flex items-center justify-between flex-wrap gap-2">
          <span>Showing {filteredRecords.length} of {rawRecords.length} records</span>
          <span className="text-stone-400">Zero-PII diagnostic comparison</span>
        </div>
      </div>
    </div>
  );
}
