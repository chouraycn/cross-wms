/**
 * Channel Health Checker — 通道健康检查
 *
 * 与 ./health-checker.ts 互补：
 * - health-checker.ts 关注通用插件健康状态
 * - 本文件专门针对通道适配器进行健康检查（连通性、延迟、消息成功率）
 *
 * 与 ./channel-adapter-runtime.ts 配合：
 * - channel-adapter-runtime.ts 管理通道状态
 * - 本文件定期巡检通道健康并记录指标
 */

import { logger } from '../../logger.js';
import {
  CHANNEL_HEALTH_CHECK_TIMEOUT_MS,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  CHANNEL_STATE_CONNECTED,
} from './plugin-constants.js';
import { getChannelAdapterRuntime, type ChannelAdapterRuntimeEntry } from './channel-adapter-runtime.js';
import type { ChannelCapabilityProvider } from './channel-capability.js';

/** 通道健康指标 */
export interface ChannelHealthMetric {
  /** 提供者 ID */
  providerId: string;
  /** 插件 ID */
  pluginId: string;
  /** 是否健康 */
  healthy: boolean;
  /** 当前状态 */
  state: string;
  /** 延迟（毫秒） */
  latencyMs?: number;
  /** 消息总数 */
  messageCount: number;
  /** 错误次数 */
  errorCount: number;
  /** 连接时长（毫秒） */
  uptimeMs?: number;
  /** 最后检查时间 */
  checkedAt: number;
  /** 最后错误 */
  lastError?: string;
}

/** 通道健康快照 */
export interface ChannelHealthSnapshot {
  /** 检查时间 */
  checkedAt: number;
  /** 通道总数 */
  total: number;
  /** 健康通道数 */
  healthy: number;
  /** 不健康通道数 */
  unhealthy: number;
  /** 各通道指标 */
  metrics: ChannelHealthMetric[];
}

/** 通道健康检查配置 */
export interface ChannelHealthCheckConfig {
  /** 巡检间隔（毫秒） */
  intervalMs?: number;
  /** 单通道检查超时（毫秒） */
  timeoutMs?: number;
  /** 错误次数阈值 */
  errorThreshold?: number;
  /** 延迟阈值（毫秒），超过则标记不健康 */
  latencyThresholdMs?: number;
  /** 是否启用主动探测（调用 healthCheck） */
  enableActiveProbe?: boolean;
}

const DEFAULT_HEALTH_CONFIG: Required<ChannelHealthCheckConfig> = {
  intervalMs: DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  timeoutMs: CHANNEL_HEALTH_CHECK_TIMEOUT_MS,
  errorThreshold: 5,
  latencyThresholdMs: 5_000,
  enableActiveProbe: true,
};

// ===================== 通道健康检查器 =====================

class ChannelHealthCheckerImpl {
  private config: Required<ChannelHealthCheckConfig> = { ...DEFAULT_HEALTH_CONFIG };
  private metrics = new Map<string, ChannelHealthMetric>();
  private errorCounts = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot: ChannelHealthSnapshot | null = null;

  /** 配置健康检查 */
  configure(config: Partial<ChannelHealthCheckConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** 执行一次健康检查 */
  async runCheck(): Promise<ChannelHealthSnapshot> {
    const runtime = getChannelAdapterRuntime();
    const adapters = runtime.list();
    const now = Date.now();
    const metrics: ChannelHealthMetric[] = [];

    for (const adapter of adapters) {
      const metric = await this.checkAdapter(adapter, now);
      this.metrics.set(adapter.providerId, metric);
      metrics.push(metric);

      if (!metric.healthy) {
        logger.warn(
          `[ChannelHealthChecker] ${adapter.providerId} 不健康: state=${metric.state} errors=${metric.errorCount} latency=${metric.latencyMs ?? 'n/a'}`,
        );
      }
    }

    this.lastSnapshot = {
      checkedAt: now,
      total: metrics.length,
      healthy: metrics.filter((m) => m.healthy).length,
      unhealthy: metrics.filter((m) => !m.healthy).length,
      metrics,
    };
    return this.lastSnapshot;
  }

  /** 检查单个通道适配器 */
  private async checkAdapter(adapter: ChannelAdapterRuntimeEntry, now: number): Promise<ChannelHealthMetric> {
    const isConnected = adapter.state === CHANNEL_STATE_CONNECTED;
    const errorCount = this.errorCounts.get(adapter.providerId) ?? 0;
    const uptimeMs = adapter.connectedAt ? now - adapter.connectedAt : undefined;

    let healthy = isConnected;
    let latencyMs: number | undefined;
    let lastError = adapter.lastError;

    // 主动探测
    if (this.config.enableActiveProbe && isConnected) {
      const provider = adapter.provider as ChannelCapabilityProvider;
      if (provider.healthCheck) {
        const probeStart = Date.now();
        try {
          const result = await withHealthTimeout(provider.healthCheck(), this.config.timeoutMs);
          latencyMs = Date.now() - probeStart;
          healthy = result.ok && latencyMs < this.config.latencyThresholdMs;
          if (!result.ok && result.error) {
            lastError = result.error;
            this.incrementError(adapter.providerId);
          }
        } catch (err) {
          latencyMs = Date.now() - probeStart;
          healthy = false;
          lastError = err instanceof Error ? err.message : String(err);
          this.incrementError(adapter.providerId);
        }
      }
    }

    // 错误次数阈值检查
    if (errorCount >= this.config.errorThreshold) {
      healthy = false;
    }

    return {
      providerId: adapter.providerId,
      pluginId: adapter.pluginId,
      healthy,
      state: adapter.state,
      ...(latencyMs !== undefined ? { latencyMs } : {}),
      messageCount: adapter.messageCount,
      errorCount,
      ...(uptimeMs !== undefined ? { uptimeMs } : {}),
      checkedAt: now,
      ...(lastError !== undefined ? { lastError } : {}),
    };
  }

  /** 记录通道错误 */
  recordError(providerId: string, errorMessage?: string): void {
    this.incrementError(providerId);
    const metric = this.metrics.get(providerId);
    if (metric) {
      metric.errorCount = this.errorCounts.get(providerId) ?? 0;
      if (errorMessage) {
        metric.lastError = errorMessage;
      }
      if (metric.errorCount >= this.config.errorThreshold) {
        metric.healthy = false;
      }
    }
  }

  /** 清除通道错误计数 */
  clearErrors(providerId: string): void {
    this.errorCounts.delete(providerId);
    const metric = this.metrics.get(providerId);
    if (metric) {
      metric.errorCount = 0;
      metric.lastError = undefined;
    }
  }

  /** 启动周期性健康检查 */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runCheck().catch((err) => {
        logger.error(`[ChannelHealthChecker] 巡检失败: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, this.config.intervalMs);
    logger.info(`[ChannelHealthChecker] 已启动 (interval=${this.config.intervalMs}ms)`);
  }

  /** 停止周期性健康检查 */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[ChannelHealthChecker] 已停止');
    }
  }

  /** 获取最近一次健康快照 */
  getLastSnapshot(): ChannelHealthSnapshot | null {
    return this.lastSnapshot;
  }

  /** 获取单个通道健康指标 */
  getMetric(providerId: string): ChannelHealthMetric | undefined {
    return this.metrics.get(providerId);
  }

  /** 列出所有通道健康指标 */
  listMetrics(): ChannelHealthMetric[] {
    return Array.from(this.metrics.values());
  }

  /** 列出不健康的通道 */
  listUnhealthy(): ChannelHealthMetric[] {
    return this.listMetrics().filter((m) => !m.healthy);
  }

  /** 重置所有状态 */
  reset(): void {
    this.stop();
    this.metrics.clear();
    this.errorCounts.clear();
    this.lastSnapshot = null;
  }

  private incrementError(providerId: string): void {
    this.errorCounts.set(providerId, (this.errorCounts.get(providerId) ?? 0) + 1);
  }
}

/** 全局通道健康检查器 */
const channelHealthChecker = new ChannelHealthCheckerImpl();

/** 获取通道健康检查器 */
export function getChannelHealthChecker(): ChannelHealthCheckerImpl {
  return channelHealthChecker;
}

// ===================== 工具函数 =====================

/** 带超时的健康检查 */
function withHealthTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`健康检查超时 (${timeoutMs}ms)`));
    }, timeoutMs);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
