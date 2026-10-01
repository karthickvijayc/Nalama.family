/**
 * Privacy-Safe System Diagnostics & Telemetry
 * 
 * STRICT ZERO-PII / ZERO-HEALTH-DATA GUARANTEE:
 * - NEVER logs transcripts, voice audio, medical metrics, weights, blood pressure, or notes.
 * - NEVER logs API keys, bearer tokens, or user demographics.
 * - ONLY logs: capability, operation name, status, duration, status codes, standardized error codes, and sanitized metadata.
 */

export type TelemetryCapability = 'ai' | 'sync' | 'drive' | 'voice' | 'auth' | 'app';
export type TelemetryStatus = 'success' | 'error' | 'warning' | 'info';

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  capability: TelemetryCapability;
  operation: string;
  status: TelemetryStatus;
  durationMs?: number;
  statusCode?: number;
  errorCode?: string;
  summary: string;
  meta?: Record<string, string | number | boolean>;
}

const STORAGE_KEY = 'nalama_telemetry_events_v1';
const MAX_EVENTS = 120;

// In-memory circular buffer
let memoryEvents: TelemetryEvent[] = [];
let listeners: Array<(events: TelemetryEvent[]) => void> = [];

// Load initial from storage
try {
  const stored = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
  if (stored) {
    memoryEvents = JSON.parse(stored);
  }
} catch {
  memoryEvents = [];
}

function persistEvents(): void {
  try {
    const payload = JSON.stringify(memoryEvents);
    sessionStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // Ignore storage quota or disabled storage
  }
}

function notifyListeners(): void {
  listeners.forEach(fn => {
    try {
      fn([...memoryEvents]);
    } catch (e) {
      console.warn('[Telemetry] Listener error:', e);
    }
  });
}

/**
 * Standardize error messages to strictly non-sensitive error codes
 */
export function sanitizeError(err: any): { errorCode: string; summary: string; statusCode?: number } {
  if (!err) {
    return { errorCode: 'UNKNOWN_ERROR', summary: 'Unknown error occurred' };
  }

  const rawMsg = String(err.message || err.error || err || '');
  let statusCode = typeof err.status === 'number' ? err.status : undefined;

  // Extract HTTP status if present in message (e.g. "(429)" or "status: 503")
  const statusMatch = rawMsg.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
  if (!statusCode && statusMatch) {
    statusCode = parseInt(statusMatch[1], 10);
  }

  let errorCode = 'GENERIC_ERROR';
  let summary = 'An operational error occurred';

  if (statusCode === 429 || /quota|rate limit|resource exhausted/i.test(rawMsg)) {
    errorCode = 'RATE_LIMIT_EXCEEDED';
    summary = 'Gemini API or service rate limit reached (HTTP 429)';
  } else if (statusCode === 401 || /unauthorized|api key not valid|invalid api key/i.test(rawMsg)) {
    errorCode = 'INVALID_API_KEY';
    summary = 'Invalid or expired API key (HTTP 401)';
  } else if (statusCode === 403 || /permission denied|forbidden/i.test(rawMsg)) {
    errorCode = 'PERMISSION_DENIED';
    summary = 'Permission denied on requested resource (HTTP 403)';
  } else if (statusCode === 404 || /not found/i.test(rawMsg)) {
    errorCode = 'RESOURCE_NOT_FOUND';
    summary = 'Requested resource not found (HTTP 404)';
  } else if (/timeout|aborted|network/i.test(rawMsg)) {
    errorCode = 'NETWORK_TIMEOUT';
    summary = 'Network request timed out or was disconnected';
  } else if (/json|parse|syntax/i.test(rawMsg)) {
    errorCode = 'PARSE_ERROR';
    summary = 'Model response JSON parsing failed';
  } else if (/token|drive|oauth/i.test(rawMsg)) {
    errorCode = 'DRIVE_AUTH_ERROR';
    summary = 'Google Drive authentication or token expired';
  } else if (/date|future|clamp/i.test(rawMsg)) {
    errorCode = 'DATE_VALIDATION_ERROR';
    summary = 'Invalid or future date encountered in record import';
  } else if (statusCode && statusCode >= 500) {
    errorCode = 'SERVER_ERROR';
    summary = `Server error returned (HTTP ${statusCode})`;
  } else {
    // Clean string of any long substrings or potential personal values
    summary = rawMsg.slice(0, 100).replace(/[a-zA-Z0-9_-]{25,}/g, '[REDACTED_KEY]');
  }

  return { errorCode, summary, statusCode };
}

/**
 * Record a telemetry event
 */
export function recordTelemetry(event: {
  capability: TelemetryCapability;
  operation: string;
  status: TelemetryStatus;
  durationMs?: number;
  statusCode?: number;
  errorCode?: string;
  summary: string;
  meta?: Record<string, string | number | boolean>;
}): TelemetryEvent {
  const newEvent: TelemetryEvent = {
    id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    capability: event.capability,
    operation: event.operation,
    status: event.status,
    durationMs: event.durationMs !== undefined ? Math.round(event.durationMs) : undefined,
    statusCode: event.statusCode,
    errorCode: event.errorCode,
    summary: event.summary.slice(0, 200),
    meta: event.meta ? { ...event.meta } : undefined
  };

  memoryEvents.unshift(newEvent);
  if (memoryEvents.length > MAX_EVENTS) {
    memoryEvents = memoryEvents.slice(0, MAX_EVENTS);
  }

  persistEvents();
  notifyListeners();
  return newEvent;
}

/**
 * Measure an asynchronous operation automatically with timing & sanitized errors
 */
export async function measureTelemetry<T>(
  capability: TelemetryCapability,
  operation: string,
  fn: () => Promise<T>,
  meta?: Record<string, string | number | boolean>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = performance.now() - start;
    recordTelemetry({
      capability,
      operation,
      status: 'success',
      durationMs,
      statusCode: 200,
      summary: `${operation} completed successfully`,
      meta
    });
    return result;
  } catch (err: any) {
    const durationMs = performance.now() - start;
    const sanitized = sanitizeError(err);
    recordTelemetry({
      capability,
      operation,
      status: 'error',
      durationMs,
      statusCode: sanitized.statusCode || 500,
      errorCode: sanitized.errorCode,
      summary: sanitized.summary,
      meta
    });
    throw err;
  }
}

/**
 * Get all in-memory telemetry events
 */
export function getTelemetryEvents(): TelemetryEvent[] {
  return [...memoryEvents];
}

/**
 * Subscribe to telemetry events
 */
export function subscribeTelemetry(listener: (events: TelemetryEvent[]) => void): () => void {
  listeners.push(listener);
  listener([...memoryEvents]);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

/**
 * Clear all stored telemetry events
 */
export function clearTelemetry(): void {
  memoryEvents = [];
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
  notifyListeners();
}

/**
 * Export a sanitized diagnostic report as JSON string for bug reporting
 */
export function exportSanitizedTelemetryReport(): string {
  const summary = {
    generatedAt: new Date().toISOString(),
    eventCount: memoryEvents.length,
    errorCount: memoryEvents.filter(e => e.status === 'error').length,
    events: memoryEvents.map(e => ({
      timestamp: e.timestamp,
      capability: e.capability,
      operation: e.operation,
      status: e.status,
      durationMs: e.durationMs,
      statusCode: e.statusCode,
      errorCode: e.errorCode,
      summary: e.summary,
      meta: e.meta
    }))
  };
  return JSON.stringify(summary, null, 2);
}
