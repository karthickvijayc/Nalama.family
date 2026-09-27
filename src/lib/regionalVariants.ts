export type RegionalVariantId = 'tamil' | 'telugu' | 'hindi' | 'malayalam';

export interface RegionalVariant {
  id: RegionalVariantId;
  brandWord: string; // e.g. 'nalama', 'bagunnara', 'kushal', 'sugamano'
  brandWordCapitalized: string; // e.g. 'Nalama', 'Bagunnara', 'Kushal', 'Sugamano'
  brandName: string; // e.g. 'nalama family', 'bagunnara family', 'kushal family', 'sugamano family'
  brandNameCapitalized: string; // e.g. 'Nalama Family', 'Bagunnara Family', 'Kushal Family', 'Sugamano Family'
  language: string; // 'Tamil', 'Telugu', 'Hindi', 'Malayalam'
  languageOptionLabel: string; // Label used in user profile dropdown
  nativeName: string; // 'தமிழ்', 'తెలుగు', 'हिन्दी', 'മലയാളം'
  logoSrc: string;
  defaultUrlSlug: string; // 'nalama-family', 'bagunnara-family', 'kushal-family', 'sugamano-family'
  urlSlugs: string[]; // Slugs and aliases recognized in the URL
  addEntryLanguagesLabel: string; // 'English • தமிழ்', 'English • తెలుగు', 'English • हिन्दी', 'English • മലയാളം'
  voicePromptLabel: string; // 'English or தமிழ்', etc.
  tagline: string;
}

export const REGIONAL_VARIANTS: Record<RegionalVariantId, RegionalVariant> = {
  tamil: {
    id: 'tamil',
    brandWord: 'nalama',
    brandWordCapitalized: 'Nalama',
    brandName: 'nalama family',
    brandNameCapitalized: 'Nalama Family',
    language: 'Tamil',
    languageOptionLabel: 'Tamil (தமிழ் / Tanglish)',
    nativeName: 'தமிழ்',
    logoSrc: '/logo-Tamil_Nalama_Family_Tree_Peacock.png',
    defaultUrlSlug: 'nalama-family',
    urlSlugs: ['nalama-family', 'nalama.family', 'nalama', 'tamil', 'tanglish'],
    addEntryLanguagesLabel: 'English • தமிழ்',
    voicePromptLabel: 'English or தமிழ்',
    tagline: 'Private Family Health & Wellness Assistant',
  },
  telugu: {
    id: 'telugu',
    brandWord: 'bagunnara',
    brandWordCapitalized: 'Bagunnara',
    brandName: 'bagunnara family',
    brandNameCapitalized: 'Bagunnara Family',
    language: 'Telugu',
    languageOptionLabel: 'Telugu (తెలుగు)',
    nativeName: 'తెలుగు',
    logoSrc: '/logo-Telugu_Bagunnara_Family_Tree_Peacock.png',
    defaultUrlSlug: 'bagunnara-family',
    urlSlugs: ['bagunnara-family', 'bagunnara.family', 'bagunnara', 'telugu'],
    addEntryLanguagesLabel: 'English • తెలుగు',
    voicePromptLabel: 'English or తెలుగు',
    tagline: 'Private Family Health & Wellness Assistant',
  },
  hindi: {
    id: 'hindi',
    brandWord: 'kushal',
    brandWordCapitalized: 'Kushal',
    brandName: 'kushal family',
    brandNameCapitalized: 'Kushal Family',
    language: 'Hindi',
    languageOptionLabel: 'Hindi (हिंदी / Hinglish)',
    nativeName: 'हिन्दी',
    logoSrc: '/logo-Hindi_Kushal_Family_Tree_Peacock.png',
    defaultUrlSlug: 'kushal-family',
    urlSlugs: ['kushal-family', 'kushal.family', 'kushal', 'hindi', 'hinglish'],
    addEntryLanguagesLabel: 'English • हिन्दी',
    voicePromptLabel: 'English or हिन्दी',
    tagline: 'Private Family Health & Wellness Assistant',
  },
  malayalam: {
    id: 'malayalam',
    brandWord: 'sugamano',
    brandWordCapitalized: 'Sugamano',
    brandName: 'sugamano family',
    brandNameCapitalized: 'Sugamano Family',
    language: 'Malayalam',
    languageOptionLabel: 'Malayalam (മലയാളം)',
    nativeName: 'മലയാളം',
    logoSrc: '/logo-Malayalam_Sugamano_Family_Tree_Peacock.png',
    defaultUrlSlug: 'sugamano-family',
    urlSlugs: ['sugamano-family', 'sugamano.family', 'sugamano', 'malayalam'],
    addEntryLanguagesLabel: 'English • മലയാളം',
    voicePromptLabel: 'English or മലയാളം',
    tagline: 'Private Family Health & Wellness Assistant',
  },
};

export const DEFAULT_VARIANT_ID: RegionalVariantId = 'tamil';

export const ALL_REGIONAL_VARIANTS = Object.values(REGIONAL_VARIANTS);

export const STORAGE_KEY_REGIONAL_VARIANT = 'preferred_regional_variant';

/**
 * Detect variant from browser URL (pathname, search query, hash, or hostname).
 */
export function detectVariantFromLocation(loc?: {
  pathname?: string;
  search?: string;
  hash?: string;
  hostname?: string;
}): RegionalVariantId | null {
  if (typeof window === 'undefined' && !loc) return null;

  const pathname = (loc?.pathname ?? window.location.pathname).toLowerCase();
  const search = (loc?.search ?? window.location.search).toLowerCase();
  const hash = (loc?.hash ?? window.location.hash).toLowerCase();
  const hostname = (loc?.hostname ?? window.location.hostname).toLowerCase();

  // 1. Check query parameters e.g. ?variant=kushal-family, ?v=hindi, ?lang=te
  try {
    const params = new URLSearchParams(search);
    const candidate = params.get('variant') || params.get('v') || params.get('lang') || params.get('regional');
    if (candidate) {
      const cleanCandidate = candidate.trim().toLowerCase();
      for (const [id, variant] of Object.entries(REGIONAL_VARIANTS)) {
        if (id === cleanCandidate || variant.urlSlugs.includes(cleanCandidate)) {
          return id as RegionalVariantId;
        }
      }
    }
  } catch {
    // Ignore query parsing errors
  }

  // 2. Check path segments (e.g. /kushal-family, /bagunnara-family, /sugamano-family, /nalama-family)
  // Split path into clean segments to match exact or prefixed slugs
  const segments = pathname.split('/').filter(Boolean);
  for (const segment of segments) {
    for (const [id, variant] of Object.entries(REGIONAL_VARIANTS)) {
      if (variant.urlSlugs.some(slug => segment === slug || segment.startsWith(`${slug}-`) || segment.startsWith(`${slug}_`))) {
        return id as RegionalVariantId;
      }
    }
  }

  // Also check if pathname includes the slug directly
  for (const [id, variant] of Object.entries(REGIONAL_VARIANTS)) {
    if (variant.urlSlugs.some(slug => pathname.includes(slug))) {
      return id as RegionalVariantId;
    }
  }

  // 3. Check hash e.g. #kushal-family
  if (hash) {
    const cleanHash = hash.replace(/^#/, '');
    for (const [id, variant] of Object.entries(REGIONAL_VARIANTS)) {
      if (id === cleanHash || variant.urlSlugs.includes(cleanHash)) {
        return id as RegionalVariantId;
      }
    }
  }

  // 4. Check hostname subdomains e.g. kushal-family.example.com
  for (const [id, variant] of Object.entries(REGIONAL_VARIANTS)) {
    if (variant.urlSlugs.some(slug => hostname.includes(slug))) {
      return id as RegionalVariantId;
    }
  }

  return null;
}

/**
 * Maps a profile primaryLanguage string (e.g. "Hindi", "Telugu", "Tamil", "Malayalam") to a variant ID.
 */
export function getVariantFromLanguage(language?: string | null): RegionalVariantId | null {
  if (!language) return null;
  const lower = language.trim().toLowerCase();

  if (lower.includes('telugu') || lower.includes('తెలుగు')) return 'telugu';
  if (lower.includes('hindi') || lower.includes('हिंदी') || lower.includes('hinglish')) return 'hindi';
  if (lower.includes('malayalam') || lower.includes('മലയാളം')) return 'malayalam';
  if (lower.includes('tamil') || lower.includes('தமிழ்') || lower.includes('tanglish')) return 'tamil';

  return null;
}

/**
 * Retrieves the regional variant object by ID.
 */
export function getRegionalVariant(id: RegionalVariantId = DEFAULT_VARIANT_ID): RegionalVariant {
  return REGIONAL_VARIANTS[id] || REGIONAL_VARIANTS[DEFAULT_VARIANT_ID];
}

/**
 * Updates browser URL to match the active variant without forcing a page reload.
 */
export function updateBrowserUrlForVariant(variant: RegionalVariant, replace = true): void {
  if (typeof window === 'undefined' || !window.history) return;

  const currentPath = window.location.pathname;
  const search = window.location.search;
  const hash = window.location.hash;

  // Don't modify legal pages paths if user is currently visiting them
  if (currentPath.includes('/privacy') || currentPath.includes('/terms')) {
    return;
  }

  // Target path is /${variant.defaultUrlSlug}
  const targetPath = `/${variant.defaultUrlSlug}`;
  if (currentPath !== targetPath) {
    const newUrl = `${targetPath}${search}${hash}`;
    if (replace) {
      window.history.replaceState(window.history.state, '', newUrl);
    } else {
      window.history.pushState(window.history.state, '', newUrl);
    }
  }
}
