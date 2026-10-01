import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Copy, 
  Check, 
  Trash2, 
  ShieldCheck, 
  Filter, 
  RefreshCw,
  Cpu,
  FolderSync,
  HardDrive,
  Mic,
  KeyRound
} from 'lucide-react';
import { 
  TelemetryEvent, 
  TelemetryCapability, 
  getTelemetryEvents, 
  subscribeTelemetry, 
  clearTelemetry, 
  exportSanitizedTelemetryReport 
} from '../lib/telemetry';

export default function DiagnosticsViewer() {
  const [events, setEvents] = useState<TelemetryEvent[]>(() => getTelemetryEvents());
  const [selectedCapability, setSelectedCapability] = useState<TelemetryCapability | 'all'>('all');
  const [showErrorsOnly, setShowErrorsOnly] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = subscribeTelemetry((updated) => {
      setEvents(updated);
    });
    return unsubscribe;
  }, []);

  const handleCopyReport = () => {
    const report = exportSanitizedTelemetryReport();
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleClear = () => {
    if (window.confirm('Clear all in-memory diagnostics logs?')) {
      clearTelemetry();
    }
  };

  // Filter events
  const filteredEvents = events.filter(e => {
    if (selectedCapability !== 'all' && e.capability !== selectedCapability) return false;
    if (showErrorsOnly && e.status !== 'error') return false;
    return true;
  });

  const totalErrors = events.filter(e => e.status === 'error').length;

  const getCapabilityIcon = (cap: TelemetryCapability) => {
    switch (cap) {
      case 'ai': return <Cpu size={13} className="text-violet-600" />;
      case 'sync': return <FolderSync size={13} className="text-sky-600" />;
      case 'drive': return <HardDrive size={13} className="text-amber-600" />;
      case 'voice': return <Mic size={13} className="text-emerald-600" />;
      case 'auth': return <KeyRound size={13} className="text-blue-600" />;
      default: return <Activity size={13} className="text-stone-600" />;
    }
  };

  const getCapabilityBadge = (cap: TelemetryCapability) => {
    switch (cap) {
      case 'ai': return 'bg-violet-50 text-violet-700 border-violet-200';
      case 'sync': return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'drive': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'voice': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'auth': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-stone-50 text-stone-700 border-stone-200';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-stone-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/50">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-teal-700" />
            <h3 className="text-sm font-bold text-stone-900">System Diagnostics & Operational Telemetry</h3>
            <span className="bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
              Live
            </span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1 flex items-center gap-1.5 flex-wrap">
            <ShieldCheck size={13} className="text-emerald-600 shrink-0" />
            <span>Zero-PII Guarantee: Strictly captures operations, latency, and status codes. Never health data or transcripts.</span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleCopyReport}
            className="flex items-center gap-1.5 text-xs font-bold text-stone-700 bg-white hover:bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-200 transition-colors shadow-2xs"
            title="Copy sanitized JSON diagnostics report to clipboard"
          >
            {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            <span>{copied ? 'Report Copied!' : 'Copy Report'}</span>
          </button>
          {events.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
              title="Clear diagnostics logs"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="px-4 py-2.5 bg-stone-50/30 border-b border-stone-150 flex items-center justify-between gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-stone-400 mr-1 flex items-center gap-1">
            <Filter size={11} /> Filter:
          </span>
          {(['all', 'ai', 'sync', 'drive', 'voice', 'auth'] as const).map(cap => (
            <button
              key={cap}
              type="button"
              onClick={() => setSelectedCapability(cap)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                selectedCapability === cap
                  ? 'bg-stone-800 text-white shadow-2xs'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              {cap === 'all' ? 'All' : cap.toUpperCase()}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowErrorsOnly(!showErrorsOnly)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors border ${
            showErrorsOnly
              ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
              : totalErrors > 0
              ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
          }`}
        >
          <AlertCircle size={12} />
          <span>Errors Only ({totalErrors})</span>
        </button>
      </div>

      {/* Events Log List */}
      <div className="max-h-72 overflow-y-auto divide-y divide-stone-100">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-stone-400">
            <Activity size={24} className="stroke-[1.5]" />
            <p className="text-xs font-medium">No diagnostics events logged yet.</p>
            <p className="text-[11px] text-stone-400 max-w-sm">
              As you use voice logging, document analysis, coaching insights, or sync external health data, operational telemetry will appear here.
            </p>
          </div>
        ) : (
          filteredEvents.map(evt => {
            const isError = evt.status === 'error';
            const isWarning = evt.status === 'warning';
            const timeStr = new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return (
              <div 
                key={evt.id} 
                className={`p-3.5 flex items-start gap-3 text-xs transition-colors ${
                  isError ? 'bg-rose-50/40 hover:bg-rose-50/70' : 'hover:bg-stone-50/80'
                }`}
              >
                {/* Status Indicator Icon */}
                <div className="mt-0.5 shrink-0">
                  {isError ? (
                    <AlertCircle size={15} className="text-rose-600" />
                  ) : isWarning ? (
                    <AlertCircle size={15} className="text-amber-600" />
                  ) : (
                    <CheckCircle2 size={15} className="text-emerald-600" />
                  )}
                </div>

                {/* Event Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${getCapabilityBadge(evt.capability)}`}>
                      {getCapabilityIcon(evt.capability)}
                      <span>{evt.capability}</span>
                    </span>

                    <span className="font-mono text-stone-800 font-bold text-[11px]">
                      {evt.operation}
                    </span>

                    {evt.statusCode && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                        evt.statusCode >= 400 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        HTTP {evt.statusCode}
                      </span>
                    )}

                    {evt.errorCode && (
                      <span className="text-[10px] font-mono bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-bold">
                        {evt.errorCode}
                      </span>
                    )}

                    {evt.durationMs !== undefined && (
                      <span className="text-[10px] text-stone-400 font-medium ml-auto flex items-center gap-0.5 shrink-0">
                        <Clock size={10} />
                        {evt.durationMs}ms
                      </span>
                    )}

                    <span className="text-[10px] text-stone-400 font-medium shrink-0">
                      {timeStr}
                    </span>
                  </div>

                  <p className="text-[11px] text-stone-600 mt-1 font-medium leading-relaxed break-words">
                    {evt.summary}
                  </p>

                  {/* Sanitized Meta tags if present */}
                  {evt.meta && Object.keys(evt.meta).length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      {Object.entries(evt.meta).map(([k, v]) => (
                        <span key={k} className="bg-stone-100 text-stone-600 text-[10px] font-mono px-1.5 py-0.5 rounded">
                          {k}: {String(v)}
                        </span>
                      ))}
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
        <span>Displaying {filteredEvents.length} of {events.length} diagnostic events</span>
        <span className="text-stone-400">Ephemeral local buffer (max 120 events)</span>
      </div>
    </div>
  );
}
