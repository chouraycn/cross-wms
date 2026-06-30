import { logger } from '../../logger.js';
import { insertMemoryWithChunks } from '../vecMemoryStore.js';

export type MemorySyncStrategy = 'on_turn' | 'on_search' | 'interval' | 'manual';

export interface MemorySyncConfig {
  strategy: MemorySyncStrategy;
  intervalMs?: number;
  batchSize?: number;
  minContentLength?: number;
  includeSystemMessages?: boolean;
  includeToolResults?: boolean;
}

export const DEFAULT_MEMORY_SYNC_CONFIG: Required<MemorySyncConfig> = {
  strategy: 'on_search',
  intervalMs: 60000,
  batchSize: 20,
  minContentLength: 10,
  includeSystemMessages: false,
  includeToolResults: false,
};

export interface SyncableMessage {
  id?: string;
  role: string;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySyncStats {
  totalSynced: number;
  totalSkipped: number;
  lastSyncTime?: number;
  lastSyncCount: number;
  failedCount: number;
}

export class MemorySyncer {
  private config: Required<MemorySyncConfig>;
  private sessionId: string;
  private agentId: string;
  private memoryStoreReady: boolean = false;
  private lastSyncedIndex: number = -1;
  private stats: MemorySyncStats = {
    totalSynced: 0,
    totalSkipped: 0,
    lastSyncCount: 0,
    failedCount: 0,
  };
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private syncInProgress: boolean = false;

  constructor(
    sessionId: string,
    agentId: string,
    config: Partial<MemorySyncConfig> = {}
  ) {
    this.sessionId = sessionId;
    this.agentId = agentId;
    this.config = { ...DEFAULT_MEMORY_SYNC_CONFIG, ...config };
  }

  async init(): Promise<void> {
    if (this.memoryStoreReady) return;

    try {
      this.memoryStoreReady = true;
      logger.debug(`[MemorySyncer] 初始化完成: session=${this.sessionId}, strategy=${this.config.strategy}`);

      if (this.config.strategy === 'interval') {
        this.startIntervalSync();
      }
    } catch (err) {
      logger.warn(
        '[MemorySyncer] 记忆存储初始化失败:',
        err instanceof Error ? err.message : String(err)
      );
      this.memoryStoreReady = false;
    }
  }

  async onTurnEnd(messages: SyncableMessage[]): Promise<void> {
    if (this.config.strategy !== 'on_turn') return;
    await this.syncNewMessages(messages);
  }

  async onSearch(messages: SyncableMessage[]): Promise<void> {
    if (this.config.strategy !== 'on_search') return;
    await this.syncNewMessages(messages);
  }

  async syncAll(messages: SyncableMessage[]): Promise<number> {
    await this.ensureReady();

    const filter = messages.filter(m => this.shouldSyncMessage(m));
    if (filter.length === 0) return 0;

    const entries = filter.map(m => ({
      content: m.content,
      source: 'conversation',
      metadata: {
        sessionId: this.sessionId,
        agentId: this.agentId,
        role: m.role,
        messageId: m.id,
        timestamp: m.timestamp,
        ...m.metadata,
      },
    }));

    try {
      for (const entry of entries) {
        await insertMemoryWithChunks(entry.content, entry.metadata, {});
      }
      this.stats.totalSynced += entries.length;
      this.stats.lastSyncCount = entries.length;
      this.stats.lastSyncTime = Date.now();
      this.lastSyncedIndex = messages.length - 1;

      logger.debug(`[MemorySyncer] 同步 ${entries.length} 条消息到记忆`);
      return entries.length;
    } catch (err) {
      this.stats.failedCount++;
      logger.error(
        '[MemorySyncer] 同步失败:',
        err instanceof Error ? err.message : String(err)
      );
      return 0;
    }
  }

  async syncNewMessages(messages: SyncableMessage[]): Promise<number> {
    if (this.syncInProgress) return 0;

    this.syncInProgress = true;
    try {
      await this.ensureReady();

      const startIndex = this.lastSyncedIndex + 1;
      if (startIndex >= messages.length) return 0;

      const newMessages = messages.slice(startIndex);
      const toSync = newMessages.filter(m => this.shouldSyncMessage(m));

      if (toSync.length === 0) {
        this.lastSyncedIndex = messages.length - 1;
        return 0;
      }

      const batchSize = this.config.batchSize;
      let totalSynced = 0;

      for (let i = 0; i < toSync.length; i += batchSize) {
        const batch = toSync.slice(i, i + batchSize);
        const entries = batch.map(m => ({
          content: m.content,
          source: 'conversation',
          metadata: {
            sessionId: this.sessionId,
            agentId: this.agentId,
            role: m.role,
            messageId: m.id,
            timestamp: m.timestamp,
            ...m.metadata,
          },
        }));

        try {
          for (const entry of entries) {
            await insertMemoryWithChunks(entry.content, entry.metadata, {});
          }
          totalSynced += entries.length;
        } catch (err) {
          this.stats.failedCount++;
          logger.error(
            `[MemorySyncer] 批次同步失败 (${i}-${i + batch.length}):`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      this.stats.totalSynced += totalSynced;
      this.stats.lastSyncCount = totalSynced;
      this.stats.lastSyncTime = Date.now();
      this.lastSyncedIndex = messages.length - 1;

      if (totalSynced > 0) {
        logger.debug(`[MemorySyncer] 同步 ${totalSynced} 条新消息到记忆`);
      }

      return totalSynced;
    } finally {
      this.syncInProgress = false;
    }
  }

  startIntervalSync(): void {
    if (this.intervalTimer) return;

    this.intervalTimer = setInterval(() => {
      logger.debug('[MemorySyncer] 触发周期同步');
    }, this.config.intervalMs);

    logger.debug(`[MemorySyncer] 周期同步已启动, 间隔=${this.config.intervalMs}ms`);
  }

  stopIntervalSync(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      logger.debug('[MemorySyncer] 周期同步已停止');
    }
  }

  getStats(): MemorySyncStats {
    return { ...this.stats };
  }

  getLastSyncedIndex(): number {
    return this.lastSyncedIndex;
  }

  setLastSyncedIndex(index: number): void {
    this.lastSyncedIndex = index;
  }

  getStrategy(): MemorySyncStrategy {
    return this.config.strategy;
  }

  setStrategy(strategy: MemorySyncStrategy): void {
    if (strategy === 'interval' && this.config.strategy !== 'interval') {
      this.startIntervalSync();
    } else if (this.config.strategy === 'interval' && strategy !== 'interval') {
      this.stopIntervalSync();
    }
    this.config.strategy = strategy;
  }

  async dispose(): Promise<void> {
    this.stopIntervalSync();
    this.memoryStoreReady = false;
    this.lastSyncedIndex = -1;
  }

  private shouldSyncMessage(msg: SyncableMessage): boolean {
    if (!msg.content || msg.content.length < this.config.minContentLength) {
      this.stats.totalSkipped++;
      return false;
    }

    if (msg.role === 'system' && !this.config.includeSystemMessages) {
      this.stats.totalSkipped++;
      return false;
    }

    if (msg.role === 'tool' && !this.config.includeToolResults) {
      this.stats.totalSkipped++;
      return false;
    }

    if (msg.role !== 'user' && msg.role !== 'assistant' && msg.role !== 'tool') {
      this.stats.totalSkipped++;
      return false;
    }

    return true;
  }

  private async ensureReady(): Promise<void> {
    if (!this.memoryStoreReady) {
      await this.init();
    }
  }
}
