import { logger } from '../../logger.js';
import type { PluginHealthMetrics, PluginEvent } from './types.js';
import { pluginRuntimeRegistry } from './registry.js';
import { listFailedPlugins } from './loader-state.js';
import { getSandboxStats } from './sandbox.js';

/**
 * 插件健康检查 — 状态 / 资源使用 / 错误监控
 *
 * 定期巡检已注册插件，记录错误率、内存占用、运行时长等指标。
 * 与 server/routes/health.ts 解耦：后者负责 HTTP 接口，本模块提供数据。
 */

export interface HealthCheckOptions {
  /** 巡检间隔（毫秒） */
  intervalMs?: number;
  /** 单插件错误数达到阈值后标记为 unhealthy */
  errorThreshold?: number;
  /** 内存增量达到阈值后标记为 unhealthy */
  memoryThresholdBytes?: number;
}

export interface HealthSnapshot {
  checkedAt: number;
  total: number;
  healthy: number;
  unhealthy: number;
  metrics: PluginHealthMetrics[];
}

const DEFAULT_OPTIONS: Required<HealthCheckOptions> = {
  intervalMs: 60_000,
  errorThreshold: 5,
  memoryThresholdBytes: 256 * 1024 * 1024,
};

const metricsStore = new Map<string, PluginHealthMetrics>();
const errorEvents = new Map<string, PluginEvent[]>();
let timer: ReturnType<typeof setInterval> | null = null;
let lastSnapshot: HealthSnapshot | null = null;
let currentOptions: Required<HealthCheckOptions> = { ...DEFAULT_OPTIONS };

/**
 * 手动执行一次健康检查。
 *
 * 数据来源：
 * - pluginRuntimeRegistry：已注册插件清单
 * - loader-state：失败的插件
 * - sandbox stats：调用次数、错误次数
 */
export function runHealthCheck(options: HealthCheckOptions = {}): HealthSnapshot {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  currentOptions = opts;
  const entries = pluginRuntimeRegistry.list();
  const failed = listFailedPlugins();
  const failedIds = new Set(failed.map((f) => f.pluginId));
  const now = Date.now();
  const metrics: PluginHealthMetrics[] = [];

  for (const entry of entries) {
    const sandboxStats = getSandboxStats(entry.pluginId);
    const errorCount = (sandboxStats?.errors ?? 0) + (failedIds.has(entry.pluginId) ? 1 : 0);
    const memoryBytes = sandboxStats?.peakMemoryDeltaBytes;
    const enabledAt = entry.registeredAt;
    const uptimeMs = now - enabledAt;
    const healthy =
      entry.status !== 'error' &&
      errorCount < opts.errorThreshold &&
      (memoryBytes === undefined || memoryBytes < opts.memoryThresholdBytes);

    const metric: PluginHealthMetrics = {
      pluginId: entry.pluginId,
      healthy,
      memoryBytes,
      errorCount,
      lastErrorAt: errorCount > 0 ? now : undefined,
      lastCheckAt: now,
      uptimeMs,
    };
    metricsStore.set(entry.pluginId, metric);
    metrics.push(metric);

    if (!healthy) {
      logger.warn(
        `[Plugins:HealthChecker] ${entry.pluginId} unhealthy: errors=${errorCount} mem=${memoryBytes ?? 'n/a'}`,
      );
    }
  }

  lastSnapshot = {
    checkedAt: now,
    total: metrics.length,
    healthy: metrics.filter((m) => m.healthy).length,
    unhealthy: metrics.filter((m) => !m.healthy).length,
    metrics,
  };
  return lastSnapshot;
}

/**
 * 启动周期性健康检查（如已运行则忽略）。
 */
export function startHealthCheckLoop(options: HealthCheckOptions = {}): void {
  if (timer) return;
  const opts = { ...DEFAULT_OPTIONS, ...options };
  timer = setInterval(() => {
    runHealthCheck(opts);
  }, opts.intervalMs);
  logger.info(`[Plugins:HealthChecker] Started (interval=${opts.intervalMs}ms)`);
}

/**
 * 停止周期性健康检查。
 */
export function stopHealthCheckLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('[Plugins:HealthChecker] Stopped');
  }
}

/**
 * 获取最近一次健康检查快照。
 */
export function getLastHealthSnapshot(): HealthSnapshot | null {
  return lastSnapshot;
}

/**
 * 获取单个插件的健康指标。
 */
export function getPluginHealth(pluginId: string): PluginHealthMetrics | undefined {
  return metricsStore.get(pluginId);
}

/**
 * 记录插件错误事件（用于错误监控）。
 */
export function recordPluginError(pluginId: string, message: string): void {
  const event: PluginEvent = {
    type: 'error',
    pluginId,
    timestamp: Date.now(),
    payload: message,
  };
  let list = errorEvents.get(pluginId);
  if (!list) {
    list = [];
    errorEvents.set(pluginId, list);
  }
  list.push(event);
  const metric = metricsStore.get(pluginId);
  if (metric) {
    metric.errorCount += 1;
    metric.lastErrorAt = event.timestamp;
    if (metric.errorCount >= currentOptions.errorThreshold) {
      metric.healthy = false;
    }
  }
}

/**
 * 获取插件错误事件列表。
 */
export function getPluginErrors(pluginId: string): PluginEvent[] {
  return errorEvents.get(pluginId) ?? [];
}

/**
 * 获取所有插件错误事件总数。
 */
export function getTotalErrorCount(): number {
  let total = 0;
  for (const list of errorEvents.values()) {
    total += list.length;
  }
  return total;
}

/**
 * 测试辅助：重置所有健康检查状态。
 */
export function resetHealthCheckerForTests(): void {
  stopHealthCheckLoop();
  metricsStore.clear();
  errorEvents.clear();
  lastSnapshot = null;
  currentOptions = { ...DEFAULT_OPTIONS };
}
