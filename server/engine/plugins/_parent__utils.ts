import os from 'node:os';
import path from 'node:path';

export function resolveUserPath(rawPath: string, env: NodeJS.ProcessEnv = process.env): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('~')) {
    return path.join(os.homedir(), trimmed.slice(1));
  }
  return path.resolve(trimmed);
}

export function shortenHomeInString(value: string): string {
  const home = os.homedir();
  if (value.startsWith(home)) {
    return '~' + value.slice(home.length);
  }
  return value;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}
