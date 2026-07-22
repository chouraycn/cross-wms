/**
 * 通道熔断器
 *
 * 基于 ChannelHealthMonitor 的状态自动熔断不健康通道：
 * - 当 channelHealthMonitor 标记通道为 unhealthy 时，熔断器打开
 * - 熔断期间所有投递被快速失败并写入死信队列
 * - 经过冷却时间后自动进入 half-open 状态，允许试探性投递
 * - half-open 状态下连续成功达到阈值后关闭熔断器
 *
 * 设计目标：避免持续向故障通道投递消息，减少下游压力。
 */

import { logger } from '../logger.js';
import type { ChannelHealthMonitor, ChannelHealthSnapshot, ChannelHealthStatus } from './channel-health-monitor.js';

/** 熔断器状态 */
export type ChannelCircuitState = 'closed' | 'open' | 'half-open';

/** 单个通道的熔断器 */
export class ChannelCircuitBreaker {
  private state: ChannelCircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt?: number;
  private halfOpenSuccesses = 0;
  private lastStatus?: ChannelHealthStatus;

  constructor(
    private readonly options: {
      /** 触发熔断的连续失败阈值（默认 5） */
      failureThreshold: number;
      /** 熔断冷却时长（ms，默认 60s） */
      cooldownMs: number;
      /** half-open 状态下连续成功数达到该值后关闭熔断器（默认 2） */
      halfOpenSuccessThreshold: number;
      /** 哪些健康状态会触发熔断（默认 ['unhealthy']） */
      triggerStatuses: ChannelHealthStatus[];
    },
  ) {}

  /** 当前状态 */
  getState(): ChannelCircuitState {
    return this.state;
  }

  /** 当前连续失败数 */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * 同步健康度快照
   * - 当 health.status 命中 triggerStatuses 时打开熔断
   * - 当通道恢复 healthy 且当前在 half-open 时关闭熔断
   */
  syncWithHealth(snapshot: ChannelHealthSnapshot, now = Date.now()): void {
    this.lastStatus = snapshot.status;

    // 健康状态触发熔断
    if (this.options.triggerStatuses.includes(snapshot.status) && this.state === 'closed') {
      this.open(now);
      return;
    }

    // 通道恢复健康，关闭熔断
    if (snapshot.status === 'healthy' && this.state === 'half-open') {
      this.close();
      return;
    }

    // 通道恢复健康，且 cooldown 已过，重新尝试
    if (snapshot.status === 'healthy' && this.state === 'open') {
      this.toHalfOpen(now);
      return;
    }
  }

  /** 是否允许投递 */
  canDeliver(now = Date.now()): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (this.openedAt && now - this.openedAt >= this.options.cooldownMs) {
        this.toHalfOpen(now);
        return true;
      }
      return false;
    }
    // half-open
    return true;
  }

  /** 记录投递成功 */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.options.halfOpenSuccessThreshold) {
        this.close();
      }
    } else {
      this.consecutiveFailures = 0;
    }
  }

  /** 记录投递失败 */
  recordFailure(now = Date.now()): void {
    this.consecutiveFailures++;
    if (this.state === 'half-open') {
      // half-open 失败立即重新打开
      this.open(now);
      return;
    }
    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.open(now);
    }
  }

  /** 打开熔断器 */
  private open(now: number): void {
    this.state = 'open';
    this.openedAt = now;
    this.halfOpenSuccesses = 0;
    logger.warn(
      `[ChannelCircuitBreaker] Opened (failures=${this.consecutiveFailures}, status=${this.lastStatus ?? 'unknown'})`,
    );
  }

  /** 转入 half-open */
  private toHalfOpen(now: number): void {
    if (this.state === 'open') {
      this.state = 'half-open';
      this.halfOpenSuccesses = 0;
      logger.info(`[ChannelCircuitBreaker] Open -> half-open`);
    }
  }

  /** 关闭熔断器 */
  private close(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.openedAt = undefined;
    this.halfOpenSuccesses = 0;
    logger.info(`[ChannelCircuitBreaker] Closed (recovered)`);
  }

  /** 强制重置 */
  reset(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.openedAt = undefined;
    this.halfOpenSuccesses = 0;
    this.lastStatus = undefined;
  }

  /** 快照 */
  snapshot() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      halfOpenSuccesses: this.halfOpenSuccesses,
      lastStatus: this.lastStatus,
    };
  }
}

/** 默认熔断器配置 */
export const DEFAULT_CHANNEL_CIRCUIT_BREAKER_OPTIONS = {
  failureThreshold: 5,
  cooldownMs: 60_000,
  halfOpenSuccessThreshold: 2,
  triggerStatuses: ['unhealthy'] as ChannelHealthStatus[],
};

/** 熔断器打开时抛出的错误 */
export class ChannelCircuitOpenError extends Error {
  constructor(
    public readonly channelId: string,
    public readonly reopenAt: number,
  ) {
    super(`Channel "${channelId}" circuit breaker is open; reopen at ${new Date(reopenAt).toISOString()}`);
    this.name = 'ChannelCircuitOpenError';
  }
}

/** 通道 -> 熔断器注册表 */
const breakers = new Map<string, ChannelCircuitBreaker>();

/** 通道熔断器管理器 */
export class ChannelCircuitBreakerManager {
  private breakers = new Map<string, ChannelCircuitBreaker>();
  private healthMonitor?: ChannelHealthMonitor;
  private syncTimer?: NodeJS.Timeout;

  constructor(
    private readonly options: typeof DEFAULT_CHANNEL_CIRCUIT_BREAKER_OPTIONS = DEFAULT_CHANNEL_CIRCUIT_BREAKER_OPTIONS,
  ) {}

  /** 绑定健康度监控器 */
  bindHealthMonitor(monitor: ChannelHealthMonitor): void {
    this.healthMonitor = monitor;
  }

  /** 注册通道 */
  registerChannel(channelId: string): void {
    if (!this.breakers.has(channelId)) {
      this.breakers.set(channelId, new ChannelCircuitBreaker(this.options));
    }
  }

  /** 注销通道 */
  unregisterChannel(channelId: string): void {
    this.breakers.delete(channelId);
  }

  /** 获取熔断器 */
  getCircuitBreaker(channelId: string): ChannelCircuitBreaker | undefined {
    return this.breakers.get(channelId);
  }

  /** 是否允许向通道投递 */
  canDeliver(channelId: string, now = Date.now()): boolean {
    const breaker = this.breakers.get(channelId);
    if (!breaker) return true;
    return breaker.canDeliver(now);
  }

  /** 记录投递结果 */
  recordDelivery(channelId: string, success: boolean, now = Date.now()): void {
    const breaker = this.breakers.get(channelId);
    if (!breaker) return;
    if (success) {
      breaker.recordSuccess();
    } else {
      breaker.recordFailure(now);
    }
  }

  /** 从健康度监控器同步所有通道状态 */
  syncAllFromHealthMonitor(now = Date.now()): void {
    if (!this.healthMonitor) return;
    const snapshots = this.healthMonitor.getAllHealth();
    for (const snapshot of snapshots) {
      if (!this.breakers.has(snapshot.channelId)) {
        this.registerChannel(snapshot.channelId);
      }
      const breaker = this.breakers.get(snapshot.channelId)!;
      breaker.syncWithHealth(snapshot, now);
    }
  }

  /** 启动周期性同步 */
  startSync(intervalMs = 10_000): void {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      try {
        this.syncAllFromHealthMonitor();
      } catch (err) {
        logger.error(`[ChannelCircuitBreakerManager] Sync failed:`, err);
      }
    }, intervalMs);
  }

  /** 停止周期性同步 */
  stopSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  /** 列出所有熔断器状态 */
  listBreakers(): Array<{ channelId: string; state: ChannelCircuitState; snapshot: ReturnType<ChannelCircuitBreaker['snapshot']> }> {
    return Array.from(this.breakers.entries()).map(([channelId, breaker]) => ({
      channelId,
      state: breaker.getState(),
      snapshot: breaker.snapshot(),
    }));
  }

  /** 列出已熔断的通道 */
  listOpenCircuits(): string[] {
    return Array.from(this.breakers.entries())
      .filter(([, breaker]) => breaker.getState() !== 'closed')
      .map(([channelId]) => channelId);
  }

  /** 重置所有熔断器 */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /** 清空所有熔断器 */
  clear(): void {
    this.breakers.clear();
  }
}

/** 全局默认实例 */
export const channelCircuitBreakerManager = new ChannelCircuitBreakerManager();
