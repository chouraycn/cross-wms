import { diagnosticSystem } from './diagnostic.js';
import type { MemoryDiagnostic } from '../types.js';

const MB = 1024 * 1024;
const DEFAULT_RSS_WARNING_BYTES = 1536 * MB;
const DEFAULT_RSS_CRITICAL_BYTES = 3072 * MB;
const DEFAULT_HEAP_WARNING_BYTES = 1024 * MB;
const DEFAULT_HEAP_CRITICAL_BYTES = 2048 * MB;
const DEFAULT_RSS_GROWTH_WARNING_BYTES = 512 * MB;
const DEFAULT_RSS_GROWTH_CRITICAL_BYTES = 1024 * MB;
const DEFAULT_GROWTH_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_PRESSURE_REPEAT_MS = 5 * 60 * 1000;

type MemorySample = {
  ts: number;
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
};

const memoryState = {
  lastSample: null as MemorySample | null,
  lastPressureAtByKey: new Map<string, number>(),
};

function normalizeMemoryUsage(): MemorySample {
  const usage = process.memoryUsage();
  return {
    ts: Date.now(),
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
  };
}

function pickThresholdPressure(memory: MemorySample): {
  level: 'warning' | 'critical';
  reason: string;
  thresholdBytes: number;
} | null {
  if (memory.rss >= DEFAULT_RSS_CRITICAL_BYTES) {
    return { level: 'critical', reason: 'rss_threshold', thresholdBytes: DEFAULT_RSS_CRITICAL_BYTES };
  }
  if (memory.heapUsed >= DEFAULT_HEAP_CRITICAL_BYTES) {
    return { level: 'critical', reason: 'heap_threshold', thresholdBytes: DEFAULT_HEAP_CRITICAL_BYTES };
  }
  if (memory.rss >= DEFAULT_RSS_WARNING_BYTES) {
    return { level: 'warning', reason: 'rss_threshold', thresholdBytes: DEFAULT_RSS_WARNING_BYTES };
  }
  if (memory.heapUsed >= DEFAULT_HEAP_WARNING_BYTES) {
    return { level: 'warning', reason: 'heap_threshold', thresholdBytes: DEFAULT_HEAP_WARNING_BYTES };
  }
  return null;
}

function pickGrowthPressure(previous: MemorySample | null, current: MemorySample): {
  level: 'warning' | 'critical';
  reason: string;
  thresholdBytes: number;
  growthBytes: number;
  windowMs: number;
} | null {
  if (!previous) return null;
  const windowMs = current.ts - previous.ts;
  if (windowMs <= 0 || windowMs > DEFAULT_GROWTH_WINDOW_MS) return null;
  const rssGrowthBytes = current.rss - previous.rss;
  if (rssGrowthBytes >= DEFAULT_RSS_GROWTH_CRITICAL_BYTES) {
    return {
      level: 'critical',
      reason: 'rss_growth',
      thresholdBytes: DEFAULT_RSS_GROWTH_CRITICAL_BYTES,
      growthBytes: rssGrowthBytes,
      windowMs,
    };
  }
  if (rssGrowthBytes >= DEFAULT_RSS_GROWTH_WARNING_BYTES) {
    return {
      level: 'warning',
      reason: 'rss_growth',
      thresholdBytes: DEFAULT_RSS_GROWTH_WARNING_BYTES,
      growthBytes: rssGrowthBytes,
      windowMs,
    };
  }
  return null;
}

function shouldEmitPressure(level: string, reason: string, now: number): boolean {
  const key = `${level}:${reason}`;
  const lastAt = memoryState.lastPressureAtByKey.get(key);
  if (lastAt !== undefined && now - lastAt < DEFAULT_PRESSURE_REPEAT_MS) {
    return false;
  }
  memoryState.lastPressureAtByKey.set(key, now);
  return true;
}

export function emitDiagnosticMemorySample(options?: {
  emitSample?: boolean;
}): MemoryDiagnostic {
  const now = Date.now();
  const memory = normalizeMemoryUsage();
  const shouldEmitSample = options?.emitSample !== false;

  if (shouldEmitSample) {
    diagnosticSystem.emit({
      type: 'diagnostic.memory.sample',
      level: 'debug',
      message: `memory: rss=${Math.round(memory.rss / MB)}MB heap=${Math.round(memory.heapUsed / MB)}MB`,
      attributes: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
      },
    });
  }

  const thresholdPressure = pickThresholdPressure(memory);
  const growthPressure = pickGrowthPressure(memoryState.lastSample, memory);
  memoryState.lastSample = memory;

  const pressure = thresholdPressure ?? growthPressure;
  if (pressure && shouldEmitPressure(pressure.level, pressure.reason, now)) {
    const attributes: Record<string, string | number | boolean> = {
      reason: pressure.reason,
      thresholdBytes: pressure.thresholdBytes,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
    };
    const growthPressureTyped = pressure as ReturnType<typeof pickGrowthPressure>;
    if (growthPressureTyped && growthPressureTyped.growthBytes !== undefined) {
      attributes.growthBytes = growthPressureTyped.growthBytes;
    }
    if (growthPressureTyped && growthPressureTyped.windowMs !== undefined) {
      attributes.windowMs = growthPressureTyped.windowMs;
    }
    diagnosticSystem.emit({
      type: 'diagnostic.memory.pressure',
      level: pressure.level as 'warn' | 'error',
      message: `memory pressure: ${pressure.reason} level=${pressure.level}`,
      attributes,
    });
  }

  return {
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    rss: memory.rss,
    external: memory.external,
    timestamp: new Date(now).toISOString(),
  };
}

export function resetDiagnosticMemoryForTest(): void {
  memoryState.lastSample = null;
  memoryState.lastPressureAtByKey.clear();
}

export function formatReadableBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let scaled = bytes;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex++;
  }
  return unitIndex === 0
    ? `${Math.round(scaled)} ${units[unitIndex]}`
    : `${scaled.toFixed(1)} ${units[unitIndex]}`;
}
