import { logger } from '../../logger.js';

export interface MemoryBudgetConfig {
  totalBudgetBytes: number;
  perSessionBudgetBytes: number;
  perSessionBudgetItems: number;
  warningThreshold: number;
  criticalThreshold: number;
  importanceWeights: {
    accessFrequency: number;
    recency: number;
    contentLength: number;
  };
  timeDecayHalfLifeMs: number;
  autoCleanupEnabled: boolean;
  cleanupStrategy: 'lru' | 'fifo' | 'importance' | 'hybrid';
  hybridLruWeight: number;
  hybridImportanceWeight: number;
}

export interface MemoryBudgetStats {
  totalBytesUsed: number;
  totalItems: number;
  totalBudgetBytes: number;
  totalBudgetUsagePercent: number;
  sessionCount: number;
  sessions: Record<string, SessionMemoryStats>;
  lastCleanupTime?: number;
  lastCleanupItemsRemoved: number;
  lastCleanupBytesFreed: number;
  warningCount: number;
  criticalCount: number;
}

export interface SessionMemoryStats {
  bytesUsed: number;
  itemCount: number;
  budgetBytes: number;
  budgetItems: number;
  usagePercentBytes: number;
  usagePercentItems: number;
  createdAt: number;
  lastAccessedAt: number;
}

export interface MemoryItem {
  id: string;
  sessionId: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  sizeBytes: number;
  importanceScore?: number;
}

export interface CleanupResult {
  itemsRemoved: number;
  bytesFreed: number;
  reason: string;
  strategy: string;
}

const DEFAULT_MEMORY_BUDGET_CONFIG: Required<MemoryBudgetConfig> = {
  totalBudgetBytes: 100 * 1024 * 1024,
  perSessionBudgetBytes: 10 * 1024 * 1024,
  perSessionBudgetItems: 1000,
  warningThreshold: 0.7,
  criticalThreshold: 0.9,
  importanceWeights: {
    accessFrequency: 0.4,
    recency: 0.4,
    contentLength: 0.2,
  },
  timeDecayHalfLifeMs: 60 * 60 * 1000,
  autoCleanupEnabled: true,
  cleanupStrategy: 'hybrid',
  hybridLruWeight: 0.5,
  hybridImportanceWeight: 0.5,
};

type BudgetAlertLevel = 'normal' | 'warning' | 'critical';

export class MemoryBudgetManager {
  private config: Required<MemoryBudgetConfig>;
  private items: Map<string, MemoryItem> = new Map();
  private sessionItems: Map<string, Set<string>> = new Map();
  private totalBytesUsed: number = 0;
  private warningCount: number = 0;
  private criticalCount: number = 0;
  private lastCleanupTime?: number;
  private lastCleanupItemsRemoved: number = 0;
  private lastCleanupBytesFreed: number = 0;
  private alertListeners: Map<BudgetAlertLevel, Array<(stats: MemoryBudgetStats) => void>> = new Map();

  constructor(config: Partial<MemoryBudgetConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_BUDGET_CONFIG, ...config };
    if (config.importanceWeights) {
      this.config.importanceWeights = {
        ...DEFAULT_MEMORY_BUDGET_CONFIG.importanceWeights,
        ...config.importanceWeights,
      };
    }
    logger.debug(
      `[MemoryBudgetManager] 初始化完成: totalBudget=${this.formatBytes(this.config.totalBudgetBytes)}, ` +
      `perSession=${this.formatBytes(this.config.perSessionBudgetBytes)}`
    );
  }

  addItem(
    id: string,
    sessionId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): boolean {
    const sizeBytes = this.estimateSize(content, metadata);

    if (sizeBytes > this.config.perSessionBudgetBytes) {
      logger.warn(
        `[MemoryBudgetManager] 单项大小 ${this.formatBytes(sizeBytes)} 超过会话预算 ` +
        `${this.formatBytes(this.config.perSessionBudgetBytes)}，拒绝添加`
      );
      return false;
    }

    const existingItem = this.items.get(id);
    if (existingItem) {
      this.totalBytesUsed -= existingItem.sizeBytes;
      this.totalBytesUsed += sizeBytes;
      existingItem.content = content;
      existingItem.metadata = metadata;
      existingItem.sizeBytes = sizeBytes;
      existingItem.lastAccessedAt = Date.now();
      existingItem.accessCount++;
      existingItem.importanceScore = this.calculateImportance(existingItem);
      this.checkAndAlert();
      return true;
    }

    const item: MemoryItem = {
      id,
      sessionId,
      content,
      metadata,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 1,
      sizeBytes,
      importanceScore: 0,
    };
    item.importanceScore = this.calculateImportance(item);

    this.items.set(id, item);
    this.totalBytesUsed += sizeBytes;

    if (!this.sessionItems.has(sessionId)) {
      this.sessionItems.set(sessionId, new Set());
    }
    this.sessionItems.get(sessionId)!.add(id);

    if (this.config.autoCleanupEnabled) {
      this.autoCleanupIfNeeded(sessionId);
    }

    this.checkAndAlert();
    return true;
  }

  getItem(id: string): MemoryItem | null {
    const item = this.items.get(id);
    if (!item) return null;

    item.lastAccessedAt = Date.now();
    item.accessCount++;
    item.importanceScore = this.calculateImportance(item);

    return { ...item };
  }

  removeItem(id: string): boolean {
    const item = this.items.get(id);
    if (!item) return false;

    this.items.delete(id);
    this.totalBytesUsed -= item.sizeBytes;

    const sessionItems = this.sessionItems.get(item.sessionId);
    if (sessionItems) {
      sessionItems.delete(id);
      if (sessionItems.size === 0) {
        this.sessionItems.delete(item.sessionId);
      }
    }

    return true;
  }

  removeSession(sessionId: string): number {
    const sessionItems = this.sessionItems.get(sessionId);
    if (!sessionItems) return 0;

    let removedCount = 0;
    for (const itemId of sessionItems) {
      const item = this.items.get(itemId);
      if (item) {
        this.totalBytesUsed -= item.sizeBytes;
        this.items.delete(itemId);
        removedCount++;
      }
    }

    this.sessionItems.delete(sessionId);
    logger.debug(`[MemoryBudgetManager] 移除会话 ${sessionId}，共 ${removedCount} 条记录`);
    return removedCount;
  }

  getSessionStats(sessionId: string): SessionMemoryStats | null {
    const sessionItems = this.sessionItems.get(sessionId);
    if (!sessionItems) return null;

    let bytesUsed = 0;
    let createdAt = Infinity;
    let lastAccessedAt = 0;

    for (const itemId of sessionItems) {
      const item = this.items.get(itemId);
      if (item) {
        bytesUsed += item.sizeBytes;
        if (item.createdAt < createdAt) createdAt = item.createdAt;
        if (item.lastAccessedAt > lastAccessedAt) lastAccessedAt = item.lastAccessedAt;
      }
    }

    return {
      bytesUsed,
      itemCount: sessionItems.size,
      budgetBytes: this.config.perSessionBudgetBytes,
      budgetItems: this.config.perSessionBudgetItems,
      usagePercentBytes: (bytesUsed / this.config.perSessionBudgetBytes) * 100,
      usagePercentItems: (sessionItems.size / this.config.perSessionBudgetItems) * 100,
      createdAt,
      lastAccessedAt,
    };
  }

  getStats(): MemoryBudgetStats {
    const sessions: Record<string, SessionMemoryStats> = {};
    for (const sessionId of this.sessionItems.keys()) {
      const stats = this.getSessionStats(sessionId);
      if (stats) {
        sessions[sessionId] = stats;
      }
    }

    return {
      totalBytesUsed: this.totalBytesUsed,
      totalItems: this.items.size,
      totalBudgetBytes: this.config.totalBudgetBytes,
      totalBudgetUsagePercent: (this.totalBytesUsed / this.config.totalBudgetBytes) * 100,
      sessionCount: this.sessionItems.size,
      sessions,
      lastCleanupTime: this.lastCleanupTime,
      lastCleanupItemsRemoved: this.lastCleanupItemsRemoved,
      lastCleanupBytesFreed: this.lastCleanupBytesFreed,
      warningCount: this.warningCount,
      criticalCount: this.criticalCount,
    };
  }

  getTotalUsagePercent(): number {
    return (this.totalBytesUsed / this.config.totalBudgetBytes) * 100;
  }

  getSessionUsagePercent(sessionId: string): number {
    const stats = this.getSessionStats(sessionId);
    return stats ? stats.usagePercentBytes : 0;
  }

  adjustBudget(adjustments: Partial<{
    totalBudgetBytes: number;
    perSessionBudgetBytes: number;
    perSessionBudgetItems: number;
  }>): void {
    if (adjustments.totalBudgetBytes !== undefined) {
      if (adjustments.totalBudgetBytes <= 0) {
        throw new Error('总预算必须大于 0');
      }
      this.config.totalBudgetBytes = adjustments.totalBudgetBytes;
    }
    if (adjustments.perSessionBudgetBytes !== undefined) {
      if (adjustments.perSessionBudgetBytes <= 0) {
        throw new Error('每会话字节预算必须大于 0');
      }
      this.config.perSessionBudgetBytes = adjustments.perSessionBudgetBytes;
    }
    if (adjustments.perSessionBudgetItems !== undefined) {
      if (adjustments.perSessionBudgetItems <= 0) {
        throw new Error('每会话条目预算必须大于 0');
      }
      this.config.perSessionBudgetItems = adjustments.perSessionBudgetItems;
    }

    logger.debug(
      `[MemoryBudgetManager] 预算已调整: total=${this.formatBytes(this.config.totalBudgetBytes)}, ` +
      `perSessionBytes=${this.formatBytes(this.config.perSessionBudgetBytes)}, ` +
      `perSessionItems=${this.config.perSessionBudgetItems}`
    );

    if (this.config.autoCleanupEnabled) {
      this.autoCleanupIfNeeded();
    }
  }

  setCleanupStrategy(strategy: MemoryBudgetConfig['cleanupStrategy']): void {
    this.config.cleanupStrategy = strategy;
    logger.debug(`[MemoryBudgetManager] 清理策略已设置为: ${strategy}`);
  }

  cleanup(targetBytes?: number, sessionId?: string): CleanupResult {
    const strategy = this.config.cleanupStrategy;
    let itemsRemoved = 0;
    let bytesFreed = 0;

    const targetBytesFinal = targetBytes ?? this.calculateCleanupTarget(sessionId);

    const candidates = this.getCleanupCandidates(strategy, sessionId);

    for (const item of candidates) {
      if (bytesFreed >= targetBytesFinal) break;

      this.items.delete(item.id);
      bytesFreed += item.sizeBytes;
      itemsRemoved++;

      const sessionItems = this.sessionItems.get(item.sessionId);
      if (sessionItems) {
        sessionItems.delete(item.id);
        if (sessionItems.size === 0) {
          this.sessionItems.delete(item.sessionId);
        }
      }
    }

    this.totalBytesUsed -= bytesFreed;
    this.lastCleanupTime = Date.now();
    this.lastCleanupItemsRemoved = itemsRemoved;
    this.lastCleanupBytesFreed = bytesFreed;

    const reason = sessionId
      ? `会话 ${sessionId} 预算超限清理`
      : '全局预算超限清理';

    logger.info(
      `[MemoryBudgetManager] 清理完成: 策略=${strategy}, 移除=${itemsRemoved}项, ` +
      `释放=${this.formatBytes(bytesFreed)}, 原因=${reason}`
    );

    return {
      itemsRemoved,
      bytesFreed,
      reason,
      strategy,
    };
  }

  onAlert(level: BudgetAlertLevel, listener: (stats: MemoryBudgetStats) => void): void {
    if (!this.alertListeners.has(level)) {
      this.alertListeners.set(level, []);
    }
    this.alertListeners.get(level)!.push(listener);
  }

  offAlert(level: BudgetAlertLevel, listener: (stats: MemoryBudgetStats) => void): void {
    const listeners = this.alertListeners.get(level);
    if (!listeners) return;
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  clear(): void {
    this.items.clear();
    this.sessionItems.clear();
    this.totalBytesUsed = 0;
    this.warningCount = 0;
    this.criticalCount = 0;
    this.lastCleanupTime = undefined;
    this.lastCleanupItemsRemoved = 0;
    this.lastCleanupBytesFreed = 0;
    logger.debug('[MemoryBudgetManager] 已清空所有数据');
  }

  private calculateImportance(item: MemoryItem): number {
    const { accessFrequency, recency, contentLength } = this.config.importanceWeights;
    const now = Date.now();

    const accessFreqScore = Math.min(item.accessCount / 100, 1);

    const ageMs = now - item.lastAccessedAt;
    const decayFactor = Math.pow(0.5, ageMs / this.config.timeDecayHalfLifeMs);
    const recencyScore = decayFactor;

    const lengthScore = Math.min(item.sizeBytes / (1024 * 1024), 1);

    const totalWeight = accessFrequency + recency + contentLength;
    const score =
      (accessFreqScore * accessFrequency +
        recencyScore * recency +
        lengthScore * contentLength) /
      totalWeight;

    return Math.max(0, Math.min(1, score));
  }

  private getCleanupCandidates(
    strategy: MemoryBudgetConfig['cleanupStrategy'],
    sessionId?: string
  ): MemoryItem[] {
    let items: MemoryItem[];

    if (sessionId) {
      const sessionItemIds = this.sessionItems.get(sessionId);
      if (!sessionItemIds) return [];
      items = Array.from(sessionItemIds)
        .map(id => this.items.get(id))
        .filter((item): item is MemoryItem => item !== undefined);
    } else {
      items = Array.from(this.items.values());
    }

    switch (strategy) {
      case 'fifo':
        return items.sort((a, b) => a.createdAt - b.createdAt);

      case 'lru':
        return items.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

      case 'importance':
        return items.sort(
          (a, b) => (a.importanceScore ?? 0) - (b.importanceScore ?? 0)
        );

      case 'hybrid':
      default: {
        const lruWeight = this.config.hybridLruWeight;
        const importanceWeight = this.config.hybridImportanceWeight;
        const now = Date.now();
        const totalWeight = lruWeight + importanceWeight;

        return items
          .map(item => {
            const maxAge = 7 * 24 * 60 * 60 * 1000;
            const ageNorm = Math.min((now - item.lastAccessedAt) / maxAge, 1);
            const lruScore = ageNorm;

            const importanceScore = 1 - (item.importanceScore ?? 0);

            const hybridScore =
              (lruScore * lruWeight + importanceScore * importanceWeight) / totalWeight;

            return { item, hybridScore };
          })
          .sort((a, b) => b.hybridScore - a.hybridScore)
          .map(({ item }) => item);
      }
    }
  }

  private calculateCleanupTarget(sessionId?: string): number {
    if (sessionId) {
      const stats = this.getSessionStats(sessionId);
      if (!stats) return 0;
      const targetBytes = this.config.perSessionBudgetBytes * this.config.warningThreshold;
      return Math.max(0, stats.bytesUsed - targetBytes);
    }

    const targetBytes = this.config.totalBudgetBytes * this.config.warningThreshold;
    return Math.max(0, this.totalBytesUsed - targetBytes);
  }

  private autoCleanupIfNeeded(sessionId?: string): void {
    if (sessionId) {
      const stats = this.getSessionStats(sessionId);
      if (stats && stats.bytesUsed > this.config.perSessionBudgetBytes) {
        logger.warn(
          `[MemoryBudgetManager] 会话 ${sessionId} 预算超限 ` +
          `(${this.formatBytes(stats.bytesUsed)}/${this.formatBytes(this.config.perSessionBudgetBytes)})，` +
          `启动清理`
        );
        this.cleanup(undefined, sessionId);
      }
      if (stats && stats.itemCount > this.config.perSessionBudgetItems) {
        logger.warn(
          `[MemoryBudgetManager] 会话 ${sessionId} 条目数超限 ` +
          `(${stats.itemCount}/${this.config.perSessionBudgetItems})，启动清理`
        );
        this.cleanup(undefined, sessionId);
      }
    }

    if (this.totalBytesUsed > this.config.totalBudgetBytes) {
      logger.warn(
        `[MemoryBudgetManager] 全局预算超限 ` +
        `(${this.formatBytes(this.totalBytesUsed)}/${this.formatBytes(this.config.totalBudgetBytes)})，` +
        `启动全局清理`
      );
      this.cleanup();
    }
  }

  private checkAndAlert(): void {
    const usagePercent = this.getTotalUsagePercent();
    const stats = this.getStats();

    if (usagePercent >= this.config.criticalThreshold * 100) {
      this.criticalCount++;
      this.emitAlert('critical', stats);
      logger.warn(
        `[MemoryBudgetManager] 预算严重告警: 使用 ${usagePercent.toFixed(1)}% ` +
        `(${this.formatBytes(this.totalBytesUsed)}/${this.formatBytes(this.config.totalBudgetBytes)})`
      );
    } else if (usagePercent >= this.config.warningThreshold * 100) {
      this.warningCount++;
      this.emitAlert('warning', stats);
      logger.debug(
        `[MemoryBudgetManager] 预算告警: 使用 ${usagePercent.toFixed(1)}% ` +
        `(${this.formatBytes(this.totalBytesUsed)}/${this.formatBytes(this.config.totalBudgetBytes)})`
      );
    }
  }

  private emitAlert(level: BudgetAlertLevel, stats: MemoryBudgetStats): void {
    const listeners = this.alertListeners.get(level);
    if (!listeners || listeners.length === 0) return;

    for (const listener of listeners) {
      try {
        listener(stats);
      } catch (err) {
        logger.error(
          `[MemoryBudgetManager] 告警监听器执行失败:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  private estimateSize(content: string, metadata?: Record<string, unknown>): number {
    let size = Buffer.byteLength(content, 'utf-8');
    if (metadata) {
      size += Buffer.byteLength(JSON.stringify(metadata), 'utf-8');
    }
    return size;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
