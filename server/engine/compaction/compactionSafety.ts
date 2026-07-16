/**
 * 压缩安全防护 — 基于 OpenClaw 三层安全机制
 *
 * 三层防护：
 * 1. CompactionLoopGuard — 压缩循环检测（连续压缩后 Token 仍超阈值，停止避免死循环）
 * 2. CompactionSafetyTimeout — 单次压缩超时（超过阈值则中止）
 * 3. CompactionRetryAggregateTimeout — 累计重试超时（多次重试累计超过阈值则放弃）
 */

// ===================== 1. 循环检测 =====================

export interface CompactionRecord {
  timestamp: number;
  tokensBefore: number;
  tokensAfter: number;
  reduction: number;
  reductionRatio: number;
}

export class CompactionLoopGuard {
  private recentCompactions: CompactionRecord[] = [];
  private maxConsecutive: number;
  private minReductionRatio: number;

  constructor(options?: { maxConsecutive?: number; minReductionRatio?: number }) {
    this.maxConsecutive = options?.maxConsecutive ?? 3;
    this.minReductionRatio = options?.minReductionRatio ?? 0.1;
  }

  /** 记录一次压缩 */
  record(tokensBefore: number, tokensAfter: number): void {
    const reduction = tokensBefore - tokensAfter;
    this.recentCompactions.push({
      timestamp: Date.now(),
      tokensBefore,
      tokensAfter,
      reduction,
      reductionRatio: tokensBefore > 0 ? reduction / tokensBefore : 0,
    });

    // 只保留最近 maxConsecutive * 2 条记录
    if (this.recentCompactions.length > this.maxConsecutive * 2) {
      this.recentCompactions = this.recentCompactions.slice(-this.maxConsecutive);
    }
  }

  /** 是否可以继续压缩 */
  canCompact(_currentTokens: number): boolean {
    if (this.recentCompactions.length < this.maxConsecutive) return true;

    const recent = this.recentCompactions.slice(-this.maxConsecutive);

    // 检查最近 N 次压缩是否都减少不足
    const allInsufficient = recent.every(
      (r) => r.reductionRatio < this.minReductionRatio,
    );

    // 检查最近 N 次压缩后 Token 是否仍在增长
    const stillGrowing = recent.every(
      (r) => r.tokensAfter >= r.tokensBefore * 0.95,
    );

    if (allInsufficient || stillGrowing) {
      return false;
    }

    return true;
  }

  /** 获取最近压缩记录 */
  getRecentCompactions(): ReadonlyArray<CompactionRecord> {
    return this.recentCompactions;
  }

  /** 重置 */
  reset(): void {
    this.recentCompactions = [];
  }
}

// ===================== 2. 单次压缩超时 =====================

export class CompactionSafetyTimeout {
  private timeoutMs: number;
  private startTime: number | null = null;
  private abortController: AbortController | null = null;

  constructor(timeoutMs: number = 60_000) {
    this.timeoutMs = timeoutMs;
  }

  /** 开始计时 */
  start(): AbortSignal {
    this.abortController = new AbortController();
    this.startTime = Date.now();

    // 设置超时中止
    setTimeout(() => {
      if (this.abortController && !this.abortController.signal.aborted) {
        this.abortController.abort();
      }
    }, this.timeoutMs);

    return this.abortController.signal;
  }

  /** 是否已超时 */
  isTimedOut(): boolean {
    return this.abortController?.signal.aborted ?? false;
  }

  /** 获取已用时间 */
  getElapsedMs(): number {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime;
  }

  /** 重置 */
  reset(): void {
    this.abortController = null;
    this.startTime = null;
  }
}

// ===================== 3. 累计重试超时 =====================

export class CompactionRetryAggregateTimeout {
  private totalTimeoutMs: number;
  private totalElapsedMs: number = 0;
  private attemptCount: number = 0;
  private maxAttempts: number;

  constructor(options?: { totalTimeoutMs?: number; maxAttempts?: number }) {
    this.totalTimeoutMs = options?.totalTimeoutMs ?? 180_000;
    this.maxAttempts = options?.maxAttempts ?? 5;
  }

  /** 记录一次重试 */
  recordAttempt(durationMs: number): void {
    this.totalElapsedMs += durationMs;
    this.attemptCount++;
  }

  /** 是否可以重试 */
  canRetry(): boolean {
    return (
      this.totalElapsedMs < this.totalTimeoutMs &&
      this.attemptCount < this.maxAttempts
    );
  }

  /** 获取剩余可用时间 */
  getRemainingMs(): number {
    return Math.max(0, this.totalTimeoutMs - this.totalElapsedMs);
  }

  /** 获取重试次数 */
  getAttemptCount(): number {
    return this.attemptCount;
  }

  /** 重置 */
  reset(): void {
    this.totalElapsedMs = 0;
    this.attemptCount = 0;
  }
}

export const compactionSafety = {
  CompactionLoopGuard,
  CompactionSafetyTimeout,
  CompactionRetryAggregateTimeout,
};
