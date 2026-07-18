// Session level override helpers normalize per-session logging and behavior levels.
// 移植自 openclaw/src/sessions/level-overrides.ts

import {
  normalizeVerboseLevel,
  normalizeTraceLevel,
} from "../auto-reply/directive-handling.js";
import type { VerboseLevel, TraceLevel } from "../auto-reply/types.js";

// 本地 SessionEntry stub（cross-wms 使用 SessionRecord，此处保留兼容接口）
export type SessionEntry = {
  verboseLevel?: string;
  traceLevel?: string;
  [key: string]: unknown;
};

const INVALID_VERBOSE_LEVEL_ERROR = 'invalid verboseLevel (use "on"|"off"|"full")';

// 三态解析：undefined 不变，null 清除，有效值写入
export function parseVerboseOverride(
  raw: unknown,
): { ok: true; value: VerboseLevel | null | undefined } | { ok: false; error: string } {
  if (raw === null) {
    return { ok: true, value: null };
  }
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: INVALID_VERBOSE_LEVEL_ERROR };
  }
  const normalized = normalizeVerboseLevel(raw);
  if (!normalized) {
    return { ok: false, error: INVALID_VERBOSE_LEVEL_ERROR };
  }
  return { ok: true, value: normalized };
}

export function applyVerboseOverride(entry: SessionEntry, level: VerboseLevel | null | undefined) {
  if (level === undefined) return;
  if (level === null) {
    delete entry.verboseLevel;
    return;
  }
  entry.verboseLevel = level;
}

export function parseTraceOverride(
  raw: unknown,
): { ok: true; value: TraceLevel | null | undefined } | { ok: false; error: string } {
  if (raw === null) return { ok: true, value: null };
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== "string") {
    return { ok: false, error: 'invalid traceLevel (use "on"|"off"|"raw")' };
  }
  const normalized = normalizeTraceLevel(raw);
  if (!normalized) {
    return { ok: false, error: 'invalid traceLevel (use "on"|"off"|"raw")' };
  }
  return { ok: true, value: normalized };
}

export function applyTraceOverride(entry: SessionEntry, level: TraceLevel | null | undefined) {
  if (level === undefined) return;
  if (level === null) {
    delete entry.traceLevel;
    return;
  }
  entry.traceLevel = level;
}
