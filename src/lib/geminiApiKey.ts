// Helper to manage user-provided Gemini API Key (BYOK)
const STORAGE_KEY_GEMINI_API_KEY = 'nalama_custom_gemini_api_key';

let cachedUserApiKey: string | null = null;

export const getCustomGeminiApiKey = (): string => {
  if (cachedUserApiKey !== null) return cachedUserApiKey;
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_GEMINI_API_KEY);
      cachedUserApiKey = (saved || '').trim();
      return cachedUserApiKey;
    } catch (e) {
      console.warn('Could not read custom Gemini API key from storage:', e);
    }
  }
  return '';
};

export const setCustomGeminiApiKey = (key: string): void => {
  const clean = (key || '').trim();
  cachedUserApiKey = clean;
  if (typeof window !== 'undefined') {
    try {
      if (clean) {
        localStorage.setItem(STORAGE_KEY_GEMINI_API_KEY, clean);
      } else {
        localStorage.removeItem(STORAGE_KEY_GEMINI_API_KEY);
      }
    } catch (e) {
      console.warn('Could not save custom Gemini API key to storage:', e);
    }
  }
};

/**
 * Returns standard headers for fetching backend AI endpoints,
 * automatically injecting the user's custom Gemini API key if present.
 */
export const getAiFetchHeaders = (extraHeaders?: Record<string, string>): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders
  };
  const customKey = getCustomGeminiApiKey();
  if (customKey) {
    headers['x-gemini-api-key'] = customKey;
  }
  return headers;
};

/**
 * Returns an object with the 'x-gemini-api-key' header if present.
 */
export const getGeminiApiKeyHeader = (): Record<string, string> => {
  const customKey = getCustomGeminiApiKey();
  if (customKey) {
    return { 'x-gemini-api-key': customKey };
  }
  return {};
};
