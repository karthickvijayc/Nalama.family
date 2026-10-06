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

/**
 * Parses and formats AI error messages into clean, actionable, user-friendly notices,
 * stripping ugly raw JSON strings from Google AI Studio / Vertex AI responses.
 */
export function formatAiErrorMessage(err: any): string {
  if (!err) return 'An unexpected AI error occurred.';
  let message = typeof err === 'string' ? err : (err.message || err.error || String(err));

  // Try extracting message if raw JSON error string was returned
  try {
    if (typeof message === 'string' && message.includes('{') && message.includes('}')) {
      const jsonStart = message.indexOf('{');
      const jsonEnd = message.lastIndexOf('}');
      const parsed = JSON.parse(message.substring(jsonStart, jsonEnd + 1));
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    }
  } catch {
    // Ignore JSON parse errors
  }

  // Provide clear instructions for common failure modes
  if (/quota|resource_exhausted|prepayment credits|429/i.test(message)) {
    return 'Gemini API quota or credits depleted. Please configure your free personal key in Settings (BYOK) at https://aistudio.google.com/apikey.';
  }
  if (/publisher model.*not found|not have access|aiplatform|vertex/i.test(message)) {
    return 'Cloud AI service is not initialized on this server. Please enter your free personal Gemini API key in Settings (BYOK) at https://aistudio.google.com/apikey to enable voice notes and document uploads.';
  }
  if (/api key not valid|api_key_invalid|401/i.test(message)) {
    return 'The provided Gemini API key is invalid. Please verify your key in Settings -> Bring Your Own Key.';
  }

  return message;
}

