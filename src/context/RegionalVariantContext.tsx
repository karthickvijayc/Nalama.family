import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  RegionalVariant,
  RegionalVariantId,
  REGIONAL_VARIANTS,
  ALL_REGIONAL_VARIANTS,
  DEFAULT_VARIANT_ID,
  STORAGE_KEY_REGIONAL_VARIANT,
  detectVariantFromLocation,
  getVariantFromLanguage,
  getRegionalVariant,
  updateBrowserUrlForVariant
} from '../lib/regionalVariants';

interface RegionalVariantContextType {
  variant: RegionalVariant;
  variantId: RegionalVariantId;
  setVariantId: (id: RegionalVariantId, updateUrl?: boolean) => void;
  syncWithProfileLanguage: (primaryLanguage?: string | null, updateUrl?: boolean) => void;
  allVariants: RegionalVariant[];
}

const RegionalVariantContext = createContext<RegionalVariantContextType | null>(null);

export const RegionalVariantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize variant based on URL -> localStorage -> default
  const [variantId, setVariantIdState] = useState<RegionalVariantId>(() => {
    if (typeof window !== 'undefined') {
      const fromUrl = detectVariantFromLocation();
      if (fromUrl) return fromUrl;

      const saved = localStorage.getItem(STORAGE_KEY_REGIONAL_VARIANT);
      if (saved && saved in REGIONAL_VARIANTS) {
        return saved as RegionalVariantId;
      }
    }
    return DEFAULT_VARIANT_ID;
  });

  const activeVariant = getRegionalVariant(variantId);

  // Synchronize document title and favicon/meta if needed
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = `${activeVariant.brandName} - ${activeVariant.tagline}`;
    }
  }, [activeVariant]);

  // Set variant handler with optional URL update & localStorage persistence
  const setVariantId = useCallback((id: RegionalVariantId, updateUrl = true) => {
    if (!(id in REGIONAL_VARIANTS)) return;
    setVariantIdState(id);

    try {
      localStorage.setItem(STORAGE_KEY_REGIONAL_VARIANT, id);
    } catch {
      // Ignore storage errors
    }

    const targetVariant = getRegionalVariant(id);
    if (updateUrl) {
      updateBrowserUrlForVariant(targetVariant);
    }
  }, []);

  // Sync with user profile's primary language
  const syncWithProfileLanguage = useCallback((primaryLanguage?: string | null, updateUrl = true) => {
    const mapped = getVariantFromLanguage(primaryLanguage);
    if (mapped) {
      setVariantId(mapped, updateUrl);
    }
  }, [setVariantId]);

  // Listen to popstate (browser back/forward or programmatic navigation)
  useEffect(() => {
    const handlePopState = () => {
      const detected = detectVariantFromLocation();
      if (detected && detected !== variantId) {
        setVariantIdState(detected);
        try {
          localStorage.setItem(STORAGE_KEY_REGIONAL_VARIANT, detected);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [variantId]);

  return (
    <RegionalVariantContext.Provider
      value={{
        variant: activeVariant,
        variantId,
        setVariantId,
        syncWithProfileLanguage,
        allVariants: ALL_REGIONAL_VARIANTS,
      }}
    >
      {children}
    </RegionalVariantContext.Provider>
  );
};

export function useRegionalVariant(): RegionalVariantContextType {
  const ctx = useContext(RegionalVariantContext);
  if (!ctx) {
    // Fallback safe defaults if used outside provider
    const fallback = getRegionalVariant(DEFAULT_VARIANT_ID);
    return {
      variant: fallback,
      variantId: DEFAULT_VARIANT_ID,
      setVariantId: () => {},
      syncWithProfileLanguage: () => {},
      allVariants: ALL_REGIONAL_VARIANTS,
    };
  }
  return ctx;
}
