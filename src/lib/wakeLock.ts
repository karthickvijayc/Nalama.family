/**
 * Screen Wake Lock Service
 * Prevents mobile and desktop devices from dimming, timing out, or locking the screen
 * during long-running background tasks (e.g. processing imported files, resetting context,
 * loading context files, saving health logs, transcribing voice notes).
 *
 * Uses the standard W3C Screen Wake Lock API (navigator.wakeLock).
 * Re-acquires the lock automatically on visibility change if tasks are still active.
 */

import { useEffect, useRef } from 'react';

// Active lock tracking set
const activeReasons = new Set<string>();
let wakeLockSentinel: any = null;
let isAcquiring = false;
let visibilityListenerRegistered = false;

/**
 * Checks if the Screen Wake Lock API is supported in the current browser.
 */
export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/**
 * Internal helper to request the system wake lock sentinel.
 */
async function requestWakeLockSentinel(): Promise<void> {
  if (!isWakeLockSupported() || isAcquiring || wakeLockSentinel) return;

  try {
    isAcquiring = true;
    const sentinel = await (navigator as any).wakeLock.request('screen');
    wakeLockSentinel = sentinel;

    sentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });

    if (!visibilityListenerRegistered && typeof document !== 'undefined') {
      visibilityListenerRegistered = true;
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  } catch (err: any) {
    // Wake lock request can be rejected if system battery saver is on or window minimized
    console.debug('[WakeLock] Could not acquire screen wake lock:', err?.message || err);
    wakeLockSentinel = null;
  } finally {
    isAcquiring = false;
  }
}

/**
 * Re-acquire the wake lock if the user tabs back or switches back while tasks are active.
 */
async function handleVisibilityChange(): Promise<void> {
  if (document.visibilityState === 'visible' && activeReasons.size > 0 && !wakeLockSentinel) {
    await requestWakeLockSentinel();
  }
}

/**
 * Acquire a screen wake lock for a specific task/reason.
 * Returns a release callback function.
 */
export async function acquireWakeLock(reason: string): Promise<() => void> {
  activeReasons.add(reason);
  if (!wakeLockSentinel) {
    await requestWakeLockSentinel();
  }

  return () => {
    releaseWakeLock(reason);
  };
}

/**
 * Release a specific task's wake lock.
 * If no more active reasons remain, the system lock is fully released.
 */
export async function releaseWakeLock(reason: string): Promise<void> {
  activeReasons.delete(reason);

  if (activeReasons.size === 0 && wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch (err) {
      console.debug('[WakeLock] Error releasing sentinel:', err);
    } finally {
      wakeLockSentinel = null;
    }
  }
}

/**
 * Checks if any wake lock is currently active.
 */
export function isWakeLockActive(): boolean {
  return activeReasons.size > 0 && !!wakeLockSentinel;
}

/**
 * Returns list of reasons currently holding the wake lock.
 */
export function getActiveWakeLockReasons(): string[] {
  return Array.from(activeReasons);
}

/**
 * Wrapper to run an asynchronous task while keeping the screen awake.
 */
export async function withWakeLock<T>(reason: string, task: () => Promise<T>): Promise<T> {
  const release = await acquireWakeLock(reason);
  try {
    return await task();
  } finally {
    await releaseWakeLock(reason);
  }
}

/**
 * React hook that manages wake lock lifecycle for a component state.
 * Automatically acquires when `isActive` is true, and releases on `false` or unmount.
 */
export function useWakeLock(isActive: boolean, reason: string): void {
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (isActive) {
      acquireWakeLock(reason).then((release) => {
        if (isMounted) {
          releaseRef.current = release;
        } else {
          release();
        }
      });
    } else {
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
    }

    return () => {
      isMounted = false;
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
    };
  }, [isActive, reason]);
}
