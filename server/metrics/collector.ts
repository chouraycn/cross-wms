/**
 * System Metrics Collector — 系统指标收集器
 *
 * 收集插件、扩展、Agent、消息、内存、健康状态等系统运行指标。
 */

import { pluginRegistry } from '../engine/pluginRegistry.js';
import { extensionLoader } from '../../extensions/index.js';
import { messageLifecycleManager, retryQueue } from '../channels/outbound/index.js';

export interface SystemMetrics {
  timestamp: number;
  plugins: {
    total: number;
    enabled: number;
    disabled: number;
    errors: number;
  };
  extensions: {
    total: number;
    enabled: number;
    disabled: number;
    byKind: Record<string, number>;
  };
  messages: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    byPhase: Record<string, number>;
  };
  retryQueue: {
    queued: number;
    processing: number;
    deadLetter: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  uptime: number;
}

export interface MetricDataPoint {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export class MetricsCollector {
  private history: SystemMetrics[] = [];
  private maxHistory: number;
  private customMetrics: Map<string, MetricDataPoint[]> = new Map();

  constructor(options: { maxHistory?: number } = {}) {
    this.maxHistory = options.maxHistory ?? 1000;
  }

  collect(): SystemMetrics {
    const pluginHealth = pluginRegistry.getHealth();
    const extensions = extensionLoader.list();
    const enabledExtensions = extensions.filter((e) => e.enabled);
    const lifecycleStats = messageLifecycleManager.getStats();
    const retryStats = retryQueue.getStats();
    const memoryUsage = process.memoryUsage();

    const byKind: Record<string, number> = {};
    for (const ext of extensions) {
      byKind[ext.manifest.kind] = (byKind[ext.manifest.kind] || 0) + 1;
    }

    const metrics: SystemMetrics = {
      timestamp: Date.now(),
      plugins: {
        total: pluginHealth.loaded + (pluginHealth.active ?? 0),
        enabled: pluginHealth.active ?? 0,
        disabled: (pluginHealth.loaded + (pluginHealth.active ?? 0)) - (pluginHealth.active ?? 0),
        errors: pluginHealth.errors?.length ?? 0,
      },
      extensions: {
        total: extensions.length,
        enabled: enabledExtensions.length,
        disabled: extensions.length - enabledExtensions.length,
        byKind,
      },
      messages: {
        total: lifecycleStats.total,
        active: lifecycleStats.active,
        completed: lifecycleStats.completed,
        failed: lifecycleStats.failed,
        byPhase: lifecycleStats.byPhase,
      },
      retryQueue: {
        queued: retryStats.queued,
        processing: retryStats.processing,
        deadLetter: retryStats.deadLetter,
      },
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        rss: memoryUsage.rss,
        external: memoryUsage.external,
      },
      uptime: process.uptime(),
    };

    this.history.push(metrics);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return metrics;
  }

  getLatest(): SystemMetrics | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  getHistory(durationMs?: number): SystemMetrics[] {
    if (!durationMs) return [...this.history];
    const cutoff = Date.now() - durationMs;
    return this.history.filter((m) => m.timestamp >= cutoff);
  }

  recordCustomMetric(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.customMetrics.has(name)) {
      this.customMetrics.set(name, []);
    }

    const series = this.customMetrics.get(name)!;
    series.push({
      timestamp: Date.now(),
      value,
      labels,
    });

    // 限制每个指标最多 5000 个点
    if (series.length > 5000) {
      series.shift();
    }
  }

  getCustomMetric(name: string): MetricDataPoint[] | undefined {
    return this.customMetrics.get(name) ? [...this.customMetrics.get(name)!] : undefined;
  }

  getCustomMetricNames(): string[] {
    return Array.from(this.customMetrics.keys());
  }

  clearHistory(): void {
    this.history = [];
  }

  clearCustomMetrics(): void {
    this.customMetrics.clear();
  }
}

export const metricsCollector = new MetricsCollector();

// 自动每 30 秒收集一次
setInterval(() => {
  metricsCollector.collect();
}, 30000);