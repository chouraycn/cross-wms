/**
 * 压缩恢复编排 — 统一管理压缩三重安全防护
 *
 * 将 CompactionLoopGuard / CompactionSafetyTimeout / CompactionRetryAggregateTimeout
 * 三个独立类编排为统一的 CompactionRecovery 入口，供 runChatSession 等热路径调用，
 * 避免在执行核心中分散持有三个对象并各自调用其 API。
 *
 * 使用方式：
 *   import { compactionRecovery } from './compaction/compactionRecovery.js';
 *   if (compactionRecovery.canProceed(tokensBefore)) {
 *     const result = await compactionRecovery.withTimeout(compress(...));
 *     compactionRecovery.recordResult(tokensBefore, tokensAfter, elapsedMs);
 *   }
 */

import {
  CompactionLoopGuard,
  CompactionSafetyTimeout,
  CompactionRetryAggregateTimeout,
  type CompactionRecord,
} from './compactionSafety.js';

// ===================== 类型定义 =====================

export interface CompactionRecoveryStats {
  loopGuard: { recentCompactions: ReadonlyArray<CompactionRecord> };
  retry: { attemptCount: number; remainingMs: number; canRetry: boolean };
  timeout: { elapsedMs: number; isTimedOut: boolean };
}

export interface CompactionRecoveryOptions {
  loopGuard?: CompactionLoopGuard;
  safetyTimeout?: CompactionSafetyTimeout;
  retryAggregate?: CompactionRetryAggregateTimeout;
}

// ===================== CompactionRecovery =====================

export class CompactionRecovery {
  private loopGuard: CompactionLoopGuard;
  private safetyTimeout: CompactionSafetyTimeout;
  private retryAggregate: CompactionRetryAggregateTimeout;

  constructor(options?: CompactionRecoveryOptions) {
    this.loopGuard = options?.loopGuard ?? new CompactionLoopGuard();
    this.safetyTimeout = options?.safetyTimeout ?? new CompactionSafetyTimeout();
    this.retryAggregate = options?.retryAggregate ?? new CompactionRetryAggregateTimeout();
  }

  /**
   * 是否可以继续压缩（循环检测 + 重试预算双通过）
   *
   * @param currentTokens 当前 token 数（供循环检测判断是否仍在增长）
   */
  canProceed(currentTokens: number = 0): boolean {
    return this.loopGuard.canCompact(currentTokens) && this.retryAggregate.canRetry();
  }

  /**
   * 记录一次压缩结果（同时更新循环检测与重试预算）
   *
   * @param tokensBefore 压缩前 token 数
   * @param tokensAfter 压缩后 token 数
   * @param elapsedMs 本次压缩耗时（计入重试预算）
   */
  recordResult(tokensBefore: number, tokensAfter: number, elapsedMs: number): void {
    this.loopGuard.record(tokensBefore, tokensAfter);
    this.retryAggregate.recordAttempt(elapsedMs);
  }

  /**
   * 为压缩 Promise 包装单次超时保护
   *
   * 内部启动 CompactionSafetyTimeout，将传入的压缩 Promise 与超时中止信号竞速。
   * 超时后以 'compaction timeout' 拒绝；成功则返回压缩结果。
   * 调用方可随后通过 getStats().timeout.elapsedMs 获取本次耗时并传给 recordResult。
   */
  async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const signal = this.safetyTimeout.start();
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('compaction timeout')));
      }),
    ]);
  }

  /** 获取三重防护的当前状态快照 */
  getStats(): CompactionRecoveryStats {
    return {
      loopGuard: { recentCompactions: this.loopGuard.getRecentCompactions() },
      retry: {
        attemptCount: this.retryAggregate.getAttemptCount(),
        remainingMs: this.retryAggregate.getRemainingMs(),
        canRetry: this.retryAggregate.canRetry(),
      },
      timeout: {
        elapsedMs: this.safetyTimeout.getElapsedMs(),
        isTimedOut: this.safetyTimeout.isTimedOut(),
      },
    };
  }

  /** 重置三重防护状态（保留单例实例，清空历史记录） */
  reset(): void {
    this.loopGuard.reset();
    this.safetyTimeout.reset();
    this.retryAggregate.reset();
  }
}

// ===================== 单例导出 =====================

export const compactionRecovery = new CompactionRecovery();
export default compactionRecovery;
