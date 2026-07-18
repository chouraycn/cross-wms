/**
 * 模型抑制 — 模型的抑制/排除管理
 *
 * 管理被抑制的模型列表，支持临时和永久抑制，
 * 支持自动恢复。
 */

import { logger } from '../../logger.js';

export type SuppressionReason =
  | 'error-rate'
  | 'high-latency'
  | 'maintenance'
  | 'user-disabled'
  | 'quota-exceeded'
  | 'rate-limited'
  | 'temporary'
  | 'manual'
  | 'unknown';

export interface SuppressedModelEntry {
  modelId: string;
  reason: SuppressionReason;
  suppressedAt: number;
  expiresAt?: number;
  description?: string;
  errorCount?: number;
  lastError?: string;
  suppressedBy: 'system' | 'user';
}

export interface ModelSuppressionOptions {
  defaultDurationMs?: number;
  maxSuppressedModels?: number;
  autoRecoveryCheckIntervalMs?: number;
}

export class ModelSuppressionManager {
  private suppressed = new Map<string, SuppressedModelEntry>();
  private defaultDurationMs: number;
  private maxSuppressedModels: number;

  constructor(options: ModelSuppressionOptions = {}) {
    this.defaultDurationMs = options.defaultDurationMs ?? 10 * 60 * 1000;
    this.maxSuppressedModels = options.maxSuppressedModels ?? 50;
  }

  suppress(
    modelId: string,
    reason: SuppressionReason = 'temporary',
    options: {
      durationMs?: number;
      description?: string;
      errorCount?: number;
      lastError?: string;
      suppressedBy?: 'system' | 'user';
    } = {},
  ): void {
    const durationMs = options.durationMs ?? this.getDefaultDuration(reason);
    const now = Date.now();

    const entry: SuppressedModelEntry = {
      modelId,
      reason,
      suppressedAt: now,
      expiresAt: durationMs > 0 ? now + durationMs : undefined,
      description: options.description,
      errorCount: options.errorCount,
      lastError: options.lastError,
      suppressedBy: options.suppressedBy ?? 'system',
    };

    this.suppressed.set(modelId, entry);
    this.evictIfNeeded();

    logger.warn(
      `[ModelSuppression] 抑制模型: ${modelId}, 原因: ${reason}` +
      (durationMs > 0 ? `, 持续: ${durationMs / 1000}s` : ', 永久'),
    );
  }

  unsuppress(modelId: string): boolean {
    const existed = this.suppressed.delete(modelId);
    if (existed) {
      logger.info(`[ModelSuppression] 解除抑制: ${modelId}`);
    }
    return existed;
  }

  isSuppressed(modelId: string): boolean {
    const entry = this.suppressed.get(modelId);
    if (!entry) return false;

    if (entry.expiresAt && Date.now() >= entry.expiresAt) {
      this.suppressed.delete(modelId);
      logger.debug(`[ModelSuppression] 自动恢复: ${modelId}`);
      return false;
    }

    return true;
  }

  getSuppressionInfo(modelId: string): SuppressedModelEntry | undefined {
    const entry = this.suppressed.get(modelId);
    if (!entry) return undefined;

    if (entry.expiresAt && Date.now() >= entry.expiresAt) {
      this.suppressed.delete(modelId);
      return undefined;
    }

    return entry;
  }

  getAllSuppressed(): SuppressedModelEntry[] {
    this.cleanupExpired();
    return Array.from(this.suppressed.values());
  }

  filterSuppressed<T extends { id: string }>(models: T[]): T[] {
    this.cleanupExpired();
    return models.filter(m => !this.suppressed.has(m.id));
  }

  getSuppressionStats(): {
    total: number;
    byReason: Record<SuppressionReason, number>;
    bySource: { system: number; user: number };
  } {
    this.cleanupExpired();

    const byReason = {} as Record<SuppressionReason, number>;
    let systemCount = 0;
    let userCount = 0;

    for (const entry of this.suppressed.values()) {
      byReason[entry.reason] = (byReason[entry.reason] ?? 0) + 1;
      if (entry.suppressedBy === 'system') {
        systemCount++;
      } else {
        userCount++;
      }
    }

    return {
      total: this.suppressed.size,
      byReason,
      bySource: { system: systemCount, user: userCount },
    };
  }

  clear(): void {
    this.suppressed.clear();
    logger.info('[ModelSuppression] 已清空所有抑制');
  }

  clearExpired(): number {
    const before = this.suppressed.size;
    this.cleanupExpired();
    const removed = before - this.suppressed.size;
    if (removed > 0) {
      logger.debug(`[ModelSuppression] 清理了 ${removed} 个过期抑制`);
    }
    return removed;
  }

  incrementErrorCount(modelId: string): number {
    const entry = this.suppressed.get(modelId);
    if (entry) {
      entry.errorCount = (entry.errorCount ?? 0) + 1;
      return entry.errorCount;
    }
    return 0;
  }

  private getDefaultDuration(reason: SuppressionReason): number {
    switch (reason) {
      case 'maintenance':
      case 'user-disabled':
        return 0;
      case 'quota-exceeded':
        return 60 * 60 * 1000;
      case 'rate-limited':
        return 5 * 60 * 1000;
      case 'error-rate':
        return 15 * 60 * 1000;
      case 'high-latency':
        return 10 * 60 * 1000;
      default:
        return this.defaultDurationMs;
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [modelId, entry] of this.suppressed) {
      if (entry.expiresAt && now >= entry.expiresAt) {
        this.suppressed.delete(modelId);
      }
    }
  }

  private evictIfNeeded(): void {
    if (this.suppressed.size <= this.maxSuppressedModels) return;

    const entries = Array.from(this.suppressed.values())
      .sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));

    while (this.suppressed.size > this.maxSuppressedModels && entries.length > 0) {
      const toRemove = entries.shift();
      if (toRemove) {
        this.suppressed.delete(toRemove.modelId);
      }
    }
  }
}

let globalSuppressionManager: ModelSuppressionManager | null = null;

export function getModelSuppressionManager(): ModelSuppressionManager {
  if (!globalSuppressionManager) {
    globalSuppressionManager = new ModelSuppressionManager();
  }
  return globalSuppressionManager;
}
