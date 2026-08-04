import type { ParsedLogLine } from './types.js';

// Pino numeric level labels (https://getpino.io/#/docs/api?id=loggerlevels).
const PINO_LEVEL_NAMES: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

function extractMessage(value: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of Object.keys(value)) {
    if (!/^\d+$/.test(key)) {
      continue;
    }
    const item = value[key];
    if (typeof item === 'string') {
      parts.push(item);
    } else if (item != null) {
      parts.push(JSON.stringify(item));
    }
  }
  return parts.join(' ');
}

function parseMetaName(raw?: unknown): { subsystem?: string; module?: string } {
  if (typeof raw !== 'string') {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      subsystem: typeof parsed.subsystem === 'string' ? parsed.subsystem : undefined,
      module: typeof parsed.module === 'string' ? parsed.module : undefined,
    };
  } catch {
    return {};
  }
}

function resolveLevel(raw: unknown, metaLogLevelName?: unknown): string | undefined {
  if (typeof metaLogLevelName === 'string' && metaLogLevelName.length > 0) {
    return metaLogLevelName.toLowerCase();
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return raw.toLowerCase();
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return PINO_LEVEL_NAMES[raw];
  }
  return undefined;
}

function resolveTime(parsed: Record<string, unknown>, meta?: Record<string, unknown>): string | undefined {
  const timeRaw = parsed.time;
  if (typeof timeRaw === 'number' && Number.isFinite(timeRaw)) {
    try {
      return new Date(timeRaw).toISOString();
    } catch {
      return undefined;
    }
  }
  if (typeof timeRaw === 'string') {
    return timeRaw;
  }
  if (typeof meta?.date === 'string') {
    return meta.date;
  }
  if (typeof parsed.timestamp === 'string') {
    return parsed.timestamp;
  }
  return undefined;
}

export function parseLogLine(raw: string): ParsedLogLine | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const meta = parsed['_meta'] as Record<string, unknown> | undefined;
    const nameMeta = parseMetaName(meta?.name);
    const levelRaw = typeof meta?.logLevelName === 'string' ? meta.logLevelName : parsed.level;
    return {
      time: resolveTime(parsed, meta),
      level: resolveLevel(levelRaw, meta?.logLevelName),
      subsystem: nameMeta.subsystem,
      module: nameMeta.module,
      message: typeof parsed.msg === 'string' ? parsed.msg : extractMessage(parsed),
      raw: trimmed,
    };
  } catch {
    return null;
  }
}

export function isJsonLogLine(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}');
}
