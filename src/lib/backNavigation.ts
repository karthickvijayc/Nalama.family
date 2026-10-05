import { useEffect, useRef, useState } from 'react';

export type BackHandler = () => boolean;

// LIFO registry of modal / component-level back handlers
const backHandlers: BackHandler[] = [];

/**
 * Register a back button handler.
 * If the handler returns true, the back event is treated as consumed.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const idx = backHandlers.indexOf(handler);
    if (idx !== -1) {
      backHandlers.splice(idx, 1);
    }
  };
}

/**
 * Hook to register a back handler when a modal or overlay is open.
 * When the user presses Android Back or swipes back from the screen edge,
 * the topmost open modal will close instead of closing the app.
 */
export function useModalBackHandler(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    return registerBackHandler(() => {
      onCloseRef.current();
      return true; // handled
    });
  }, [isOpen]);
}

interface UseAndroidBackNavigationOptions {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  legalView: 'privacy' | 'terms' | null;
  setLegalView: (view: 'privacy' | 'terms' | null) => void;
}

/**
 * Main Android back button and screen swipe gesture manager.
 * - If any modal or overlay is open, closes it first.
 * - If on a sub-view (e.g. Developer Guide or Profile), returns to parent view.
 * - If on any non-home tab (Coaching, Family, Settings), redirects to 'home'.
 * - If on 'home' tab:
 *    - 1st attempt: Shows a sleek "Press back again to exit" toast prompt.
 *    - 2nd attempt within 2 seconds: Safely allows the app to exit.
 */
export function useAndroidBackNavigation({
  activeTab,
  setActiveTab,
  legalView,
  setLegalView
}: UseAndroidBackNavigationOptions): { showExitToast: boolean } {
  const [showExitToast, setShowExitToast] = useState(false);
  const lastBackPressTimeRef = useRef<number>(0);
  const exitToastTimerRef = useRef<any>(null);
  const isExitingRef = useRef<boolean>(false);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const setActiveTabRef = useRef(setActiveTab);
  setActiveTabRef.current = setActiveTab;

  const legalViewRef = useRef(legalView);
  legalViewRef.current = legalView;

  const setLegalViewRef = useRef(setLegalView);
  setLegalViewRef.current = setLegalView;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;

    // Establish a 2-entry history buffer so Android's back gesture fires popstate instead of closing
    try {
      window.history.replaceState({ nalamaTag: 'root' }, '', window.location.href);
      window.history.pushState({ nalamaTag: 'active' }, '', window.location.href);
    } catch (e) {
      console.debug('[BackNav] Could not initialize history buffer:', e);
    }

    const replenishBuffer = () => {
      try {
        window.history.pushState({ nalamaTag: 'active' }, '', window.location.href);
      } catch (e) {
        // ignore
      }
    };

    const handlePopState = () => {
      if (isExitingRef.current) {
        return;
      }

      // 1. Check if any open modal / overlay consumes this back press (LIFO order)
      for (let i = backHandlers.length - 1; i >= 0; i--) {
        try {
          const wasHandled = backHandlers[i]();
          if (wasHandled) {
            replenishBuffer();
            return;
          }
        } catch (err) {
          console.error('[BackNav] Error in back handler:', err);
        }
      }

      // 2. Check if a legal view modal (/privacy or /terms) is currently open
      if (legalViewRef.current) {
        setLegalViewRef.current(null);
        replenishBuffer();
        return;
      }

      // 3. Sub-views: developer_guide -> settings, profile -> coaching
      const currentTab = activeTabRef.current;
      if (currentTab === 'developer_guide') {
        setActiveTabRef.current('settings');
        replenishBuffer();
        return;
      }

      if (currentTab === 'profile') {
        setActiveTabRef.current('coaching');
        replenishBuffer();
        return;
      }

      // 4. Any non-home tab (coaching, family, settings) -> redirect to 'home' on 1st attempt
      if (currentTab !== 'home') {
        setActiveTabRef.current('home');
        replenishBuffer();
        return;
      }

      // 5. On 'home' tab: 1st back press shows toast, 2nd press exits
      const now = Date.now();
      const timeSinceLastPress = now - lastBackPressTimeRef.current;

      if (timeSinceLastPress < 2000) {
        // Second attempt within 2 seconds: Allow exit!
        isExitingRef.current = true;
        setShowExitToast(false);
        if (exitToastTimerRef.current) clearTimeout(exitToastTimerRef.current);

        // We are currently at 'root' entry. Navigating back before root exits the Android PWA.
        window.history.back();

        setTimeout(() => {
          try {
            window.close();
          } catch (_) {
            // ignore
          }
        }, 50);
      } else {
        // First attempt: Show toast prompt and start 2s timer
        lastBackPressTimeRef.current = now;
        setShowExitToast(true);

        if (exitToastTimerRef.current) clearTimeout(exitToastTimerRef.current);
        exitToastTimerRef.current = setTimeout(() => {
          setShowExitToast(false);
          lastBackPressTimeRef.current = 0;
        }, 2000);

        // Replenish buffer so user stays on Home
        replenishBuffer();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (exitToastTimerRef.current) clearTimeout(exitToastTimerRef.current);
    };
  }, []);

  return { showExitToast };
}
