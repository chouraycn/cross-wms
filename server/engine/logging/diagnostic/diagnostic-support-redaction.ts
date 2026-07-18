import { redactSensitiveText, redactObject } from '../redact.js';
import { redactIdentifiers, redactIdentifiersInObject } from '../redact-identifier.js';
import type { SupportBundle } from '../types.js';

const SENSITIVE_BUNDLE_KEYS = [
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'credential',
  'privatekey',
  'private_key',
  'authorization',
  'cookie',
  'session',
];

function isSensitiveBundleKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_BUNDLE_KEYS.some((sensitive) => lower.includes(sensitive));
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && isSensitiveBundleKey(key)) {
    return '<redacted>';
  }
  if (typeof value === 'string') {
    let result = redactSensitiveText(value);
    result = redactIdentifiers(result);
    return result;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, String(index)));
  }
  return redactSupportBundleObject(value as Record<string, unknown>);
}

function redactSupportBundleObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = redactValue(value, key);
  }
  return result;
}

export function redactSupportBundle(bundle: SupportBundle): SupportBundle {
  const redacted = {
    ...bundle,
    recentLogs: bundle.recentLogs.map((log) => {
      try {
        const parsed = JSON.parse(log);
        return JSON.stringify(redactObject(redactIdentifiersInObject(parsed)));
      } catch {
        return redactSensitiveText(redactIdentifiers(log));
      }
    }),
    errors: bundle.errors.map((err) => redactSensitiveText(redactIdentifiers(err))),
    sessions: bundle.sessions.map((session) => ({
      ...session,
      sessionId: redactIdentifiers(session.sessionId),
    })),
  };
  return redacted as SupportBundle;
}

export function redactLogLine(line: string): string {
  let result = redactSensitiveText(line);
  result = redactIdentifiers(result);
  return result;
}

export function redactError(error: Error | string): string {
  const message = typeof error === 'string' ? error : error.message;
  return redactSensitiveText(redactIdentifiers(message));
}

export function redactDiagnosticPayload<T extends Record<string, unknown>>(payload: T): T {
  return redactSupportBundleObject(payload) as T;
}
