import { logger } from '../../logger.js';

export type ErrorKind = 'refusal' | 'timeout' | 'rate_limit' | 'context_length' | 'unknown';

export function isErrno(err: unknown): err is NodeJS.ErrnoException {
  return err !== null && typeof err === 'object' && 'code' in err;
}

export function hasErrnoCode(err: unknown, code: string): boolean {
  return isErrno(err) && err.code === code;
}

export function extractErrorCode(err: unknown): string | number | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string' || typeof code === 'number') return code;
  }
  return undefined;
}

export function readErrorName(err: unknown): string {
  if (err instanceof Error) return err.name;
  return 'Error';
}

export function toErrorObject(value: unknown, fallbackMessage = 'Unknown error'): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  if (value && typeof value === 'object' && 'message' in value) {
    const msg = (value as { message: unknown }).message;
    return new Error(typeof msg === 'string' ? msg : fallbackMessage);
  }
  return new Error(fallbackMessage);
}

export function formatErrorMessage(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const msg = current instanceof Error
      ? current.message
      : (current as { message?: unknown }).message;
    if (typeof msg === 'string' && msg && !parts.includes(msg)) parts.push(msg);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(' <- ') || 'Unknown error';
}

export function stringifyNonErrorCause(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return '[object]'; }
}

export function detectErrorKind(err: unknown): ErrorKind {
  if (!err) return 'unknown';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const code = extractErrorCode(err);
  if (code === 'ETIMEDOUT' || msg.includes('timeout')) return 'timeout';
  if (code === 429 || msg.includes('rate limit') || msg.includes('rate_limit')) return 'rate_limit';
  if (msg.includes('context length') || msg.includes('context_length') || msg.includes('too long')) return 'context_length';
  if (msg.includes('refusal') || msg.includes('refuse')) return 'refusal';
  return 'unknown';
}
