import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, X } from 'lucide-react';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // If already running as an installed PWA or manually dismissed, hide the banner
  if (isInstalled || dismissed) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <div className="bg-tree-700 text-white px-4 py-2.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white p-1 shrink-0 overflow-hidden shadow-xs">
            <img src="/pwa-192x192.png" alt="nalama tree icon" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm leading-tight">Install nalama.family</span>
            <span className="text-tree-100 text-xs">Add to home screen for quick access</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={install}
            className="flex items-center gap-1.5 rounded-xl bg-white text-tree-800 px-3 py-1.5 text-sm font-bold shadow-sm hover:bg-tree-50 transition active:scale-95"
          >
            <Download size={16} />
            Install
          </button>
          <button onClick={() => setDismissed(true)} className="p-1.5 text-tree-200 hover:text-white transition">
            <X size={18} />
          </button>
        </div>
      </div>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <div className="bg-tree-700 text-white px-4 py-2.5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white p-1 shrink-0 overflow-hidden shadow-xs">
              <img src="/pwa-192x192.png" alt="nalama tree icon" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm leading-tight">Install nalama.family</span>
              <span className="text-tree-100 text-xs">Add to your home screen</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowIOSGuide(true)}
              className="flex items-center gap-1.5 rounded-xl bg-white text-tree-800 px-3 py-1.5 text-sm font-bold shadow-sm hover:bg-tree-50 transition active:scale-95"
            >
              <Download size={16} />
              Install
            </button>
            <button onClick={() => setDismissed(true)} className="p-1.5 text-tree-200 hover:text-white transition">
              <X size={18} />
            </button>
          </div>
        </div>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 backdrop-blur-sm p-4 sm:items-center sm:p-0">
            <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl animate-in slide-in-from-bottom-4">
              <h3 className="text-xl font-extrabold text-stone-900 mb-1">Install on iPhone</h3>
              <p className="mt-2 text-stone-600 font-medium">
                1. Tap the <strong>Share</strong> button at the bottom of Safari.<br/><br/>
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-2xl bg-stone-100 py-3.5 text-base font-bold text-stone-800 hover:bg-stone-200 active:scale-95 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
