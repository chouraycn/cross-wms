import type { ParsedLogLine } from './types.js';

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
      time:
        typeof parsed.time === 'string'
          ? parsed.time
          : typeof meta?.date === 'string'
            ? meta.date
            : typeof parsed.timestamp === 'string'
              ? parsed.timestamp
              : undefined,
      level: typeof levelRaw === 'string' ? levelRaw.toLowerCase() : undefined,
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
