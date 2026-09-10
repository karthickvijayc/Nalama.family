import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';

export interface SyncBannerProps {
  status: 'checking' | 'processing' | 'success' | 'error' | 'idle';
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export default function SyncFloatingBanner({ status, message, onDismiss, onRetry }: SyncBannerProps) {
  if (status === 'idle') return null;

  const isBusy = status === 'checking' || status === 'processing';
  const isSuccess = status === 'success';
  const isError = status === 'error';

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] animate-in fade-in slide-in-from-top-4 duration-300">
      <div className={`
        flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-xl backdrop-blur-md border transition-all
        ${isBusy ? 'bg-stone-900/90 text-white border-stone-700/80 shadow-stone-950/20' : ''}
        ${isSuccess ? 'bg-emerald-950/90 text-emerald-100 border-emerald-700/60 shadow-emerald-950/20' : ''}
        ${isError ? 'bg-rose-950/90 text-rose-100 border-rose-700/60 shadow-rose-950/20' : ''}
      `}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {isBusy && (
            <Loader2 size={18} className="animate-spin text-teal-400 shrink-0" />
          )}
          {isSuccess && (
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          )}
          {isError && (
            <AlertCircle size={18} className="text-rose-400 shrink-0" />
          )}

          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold tracking-tight truncate leading-tight">
              {isBusy && (status === 'checking' ? 'Checking for Health Data...' : 'Processing Health Data...')}
              {isSuccess && 'Health Sync Complete'}
              {isError && 'Health Sync Issue'}
            </span>
            <span className="text-[11px] opacity-90 truncate font-medium">
              {message}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isError && onRetry && (
            <button
              onClick={onRetry}
              className="p-1.5 hover:bg-white/10 rounded-lg text-rose-200 hover:text-white transition-colors"
              title="Retry sync"
            >
              <RefreshCw size={14} />
            </button>
          )}
          {!isBusy && onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1.5 hover:bg-white/10 rounded-lg opacity-75 hover:opacity-100 transition-opacity"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
