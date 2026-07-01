/**
 * 内存压力监控系统
 *
 * 参考 OpenClaw diagnostic-memory.ts 实现
 * - RSS/Heap 阈值告警
 * - 增长速率检测
 * - 自动日志输出
 */

import { logger } from '../logger.js';

const MB = 1024 * 1024;

// 默认阈值
const DEFAULT_RSS_WARNING_BYTES = 1536 * MB;   // 1.5GB
const DEFAULT_RSS_CRITICAL_BYTES = 3072 * MB;  // 3GB
const DEFAULT_HEAP_WARNING_BYTES = 1024 * MB;  // 1GB
const DEFAULT_HEAP_CRITICAL_BYTES = 2048 * MB; // 2GB
const DEFAULT_RSS_GROWTH_WARNING_BYTES = 512 * MB;   // 10分钟增长512MB
const DEFAULT_RSS_GROWTH_CRITICAL_BYTES = 1024 * MB;  // 10分钟增长1GB
const DEFAULT_GROWTH_WINDOW_MS = 10 * 60 * 1000;      // 10分钟
const DEFAULT_PRESSURE_REPEAT_MS = 5 * 60 * 1000;     // 5分钟内同级别不重复告警

export interface MemoryThresholds {
  rssWarningBytes?: number;
  rssCriticalBytes?: number;
  heapUsedWarningBytes?: number;
  heapUsedCriticalBytes?: number;
  rssGrowthWarningBytes?: number;
  rssGrowthCriticalBytes?: number;
  growthWindowMs?: number;
  pressureRepeatMs?: number;
}

interface MemorySample {
  ts: number;
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

interface PressureEvent {
  level: 'warning' | 'critical';
  reason: 'rss_threshold' | 'heap_threshold' | 'rss_growth';
  rss: number;
  heapUsed: number;
  thresholdBytes?: number;
  rssGrowthBytes?: number;
  windowMs?: number;
}

interface MemoryState {
  lastSample: MemorySample | null;
  lastPressureAtByKey: Map<string, number>;
}

const state: MemoryState = {
  lastSample: null,
  lastPressureAtByKey: new Map(),
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(1)} MiB`;
  return `${(bytes / (1024 * MB)).toFixed(2)} GiB`;
}

function resolveThresholds(thresholds?: MemoryThresholds): Required<MemoryThresholds> {
  return {
    rssWarningBytes: thresholds?.rssWarningBytes ?? DEFAULT_RSS_WARNING_BYTES,
    rssCriticalBytes: thresholds?.rssCriticalBytes ?? DEFAULT_RSS_CRITICAL_BYTES,
    heapUsedWarningBytes: thresholds?.heapUsedWarningBytes ?? DEFAULT_HEAP_WARNING_BYTES,
    heapUsedCriticalBytes: thresholds?.heapUsedCriticalBytes ?? DEFAULT_HEAP_CRITICAL_BYTES,
    rssGrowthWarningBytes: thresholds?.rssGrowthWarningBytes ?? DEFAULT_RSS_GROWTH_WARNING_BYTES,
    rssGrowthCriticalBytes: thresholds?.rssGrowthCriticalBytes ?? DEFAULT_RSS_GROWTH_CRITICAL_BYTES,
    growthWindowMs: thresholds?.growthWindowMs ?? DEFAULT_GROWTH_WINDOW_MS,
    pressureRepeatMs: thresholds?.pressureRepeatMs ?? DEFAULT_PRESSURE_REPEAT_MS,
  };
}

function pickThresholdPressure(memory: MemorySample, thresholds: Required<MemoryThresholds>): PressureEvent | null {
  if (memory.rss >= thresholds.rssCriticalBytes) {
    return { level: 'critical', reason: 'rss_threshold', rss: memory.rss, heapUsed: memory.heapUsed, thresholdBytes: thresholds.rssCriticalBytes };
  }
  if (memory.heapUsed >= thresholds.heapUsedCriticalBytes) {
    return { level: 'critical', reason: 'heap_threshold', rss: memory.rss, heapUsed: memory.heapUsed, thresholdBytes: thresholds.heapUsedCriticalBytes };
  }
  if (memory.rss >= thresholds.rssWarningBytes) {
    return { level: 'warning', reason: 'rss_threshold', rss: memory.rss, heapUsed: memory.heapUsed, thresholdBytes: thresholds.rssWarningBytes };
  }
  if (memory.heapUsed >= thresholds.heapUsedWarningBytes) {
    return { level: 'warning', reason: 'heap_threshold', rss: memory.rss, heapUsed: memory.heapUsed, thresholdBytes: thresholds.heapUsedWarningBytes };
  }
  return null;
}

function pickGrowthPressure(previous: MemorySample | null, current: MemorySample, thresholds: Required<MemoryThresholds>): PressureEvent | null {
  if (!previous) return null;
  const windowMs = current.ts - previous.ts;
  if (windowMs <= 0 || windowMs > thresholds.growthWindowMs) return null;
  const rssGrowthBytes = current.rss - previous.rss;
  if (rssGrowthBytes >= thresholds.rssGrowthCriticalBytes) {
    return { level: 'critical', reason: 'rss_growth', rss: current.rss, heapUsed: current.heapUsed, thresholdBytes: thresholds.rssGrowthCriticalBytes, rssGrowthBytes, windowMs };
  }
  if (rssGrowthBytes >= thresholds.rssGrowthWarningBytes) {
    return { level: 'warning', reason: 'rss_growth', rss: current.rss, heapUsed: current.heapUsed, thresholdBytes: thresholds.rssGrowthWarningBytes, rssGrowthBytes, windowMs };
  }
  return null;
}

function shouldEmitPressure(pressure: PressureEvent, now: number, repeatMs: number): boolean {
  const key = `${pressure.level}:${pressure.reason}`;
  const lastAt = state.lastPressureAtByKey.get(key);
  if (lastAt !== undefined && now - lastAt < repeatMs) return false;
  state.lastPressureAtByKey.set(key, now);
  return true;
}

/**
 * 采样一次内存使用，检测是否触发压力告警
 */
export function emitMemorySample(thresholds?: MemoryThresholds): MemorySample {
  const now = Date.now();
  const mem = process.memoryUsage();
  const current: MemorySample = {
    ts: now,
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers,
  };

  const resolved = resolveThresholds(thresholds);
  const pressure = pickThresholdPressure(current, resolved) ?? pickGrowthPressure(state.lastSample, current, resolved);
  state.lastSample = current;

  if (pressure && shouldEmitPressure(pressure, now, resolved.pressureRepeatMs)) {
    const parts = [
      `memory pressure: level=${pressure.level} reason=${pressure.reason}`,
      `rss=${formatBytes(pressure.rss)} heap=${formatBytes(pressure.heapUsed)}`,
    ];
    if (pressure.thresholdBytes) parts.push(`threshold=${formatBytes(pressure.thresholdBytes)}`);
    if (pressure.rssGrowthBytes) parts.push(`rssGrowth=${formatBytes(pressure.rssGrowthBytes)}`);
    if (pressure.windowMs) parts.push(`window=${Math.round(pressure.windowMs / 1000)}s`);

    if (pressure.level === 'critical') {
      logger.error(`[Memory] ${parts.join(' ')} — 建议重启服务或运行诊断`);
    } else {
      logger.warn(`[Memory] ${parts.join(' ')}`);
    }
  }

  return current;
}

/**
 * 获取当前内存使用概要
 */
export function getMemorySummary(): { rssMB: number; heapUsedMB: number; heapTotalMB: number; externalMB: number } {
  const mem = process.memoryUsage();
  return {
    rssMB: Math.round(mem.rss / MB),
    heapUsedMB: Math.round(mem.heapUsed / MB),
    heapTotalMB: Math.round(mem.heapTotal / MB),
    externalMB: Math.round(mem.external / MB),
  };
}

/**
 * 启动周期性内存监控
 * @param intervalMs 采样间隔，默认 60s
 */
export function startMemoryMonitor(intervalMs = 60_000): NodeJS.Timeout {
  // 首次采样
  emitMemorySample();
  const timer = setInterval(() => emitMemorySample(), intervalMs);
  timer.unref(); // 不阻塞进程退出
  return timer;
}
