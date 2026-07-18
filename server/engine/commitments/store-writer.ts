/**
 * 存储写入器
 *
 * 承诺存储的写入管理，提供批量写入、原子操作、
 * 写入队列、防抖、去重和自动保存等功能。
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../../logger.js';
import type {
  CommitmentRecord,
  CommitmentStoreFile,
  CommitmentCandidate,
  CommitmentScope,
  CommitmentHeartbeat,
} from './types.js';
import {
  loadCommitmentStore,
  saveCommitmentStore,
  addCommitment,
  resolveCommitmentStorePath,
  coerceCommitment,
} from './store.js';

export type StoreWriterOptions = {
  storePath?: string;
  debounceMs?: number;
  maxBatchSize?: number;
  flushIntervalMs?: number;
  maxRetries?: number;
  enableDeduplication?: boolean;
  atomicWrites?: boolean;
};

export type PendingWrite = {
  id: string;
  type: 'add' | 'update' | 'delete' | 'status' | 'attempted' | 'heartbeat';
  record?: Partial<CommitmentRecord>;
  commitmentId?: string;
  status?: string;
  failureReason?: string;
  heartbeat?: Omit<CommitmentHeartbeat, 'id'>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  createdAtMs: number;
  retries: number;
};

export type StoreWriterStats = {
  pendingWrites: number;
  totalWrites: number;
  failedWrites: number;
  successfulWrites: number;
  lastFlushAt?: number;
  totalFlushCount: number;
  averageFlushTimeMs: number;
  dedupedWrites: number;
};

export class CommitmentStoreWriter {
  private readonly storePath: string;
  private readonly debounceMs: number;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxRetries: number;
  private readonly enableDeduplication: boolean;
  private readonly atomicWrites: boolean;

  private pendingWrites: PendingWrite[] = [];
  private dedupeKeys: Set<string> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private totalWrites = 0;
  private failedWrites = 0;
  private successfulWrites = 0;
  private dedupedWrites = 0;
  private lastFlushAt: number | undefined;
  private totalFlushCount = 0;
  private totalFlushTimeMs = 0;
  private isShutdown = false;

  constructor(options: StoreWriterOptions = {}) {
    this.storePath = options.storePath ?? resolveCommitmentStorePath();
    this.debounceMs = options.debounceMs ?? 100;
    this.maxBatchSize = options.maxBatchSize ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.maxRetries = options.maxRetries ?? 3;
    this.enableDeduplication = options.enableDeduplication ?? true;
    this.atomicWrites = options.atomicWrites ?? false;

    this.startFlushInterval();
  }

  private startFlushInterval(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      if (this.pendingWrites.length > 0 && !this.isFlushing && !this.isShutdown) {
        void this.flush();
      }
    }, this.flushIntervalMs);

    if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      this.flushTimer.unref();
    }
  }

  private generateDedupeKey(write: PendingWrite): string {
    if (!this.enableDeduplication) {
      return '';
    }
    switch (write.type) {
      case 'add':
        return `add:${write.record?.dedupeKey || write.id}`;
      case 'update':
        return `update:${write.commitmentId}`;
      case 'delete':
        return `delete:${write.commitmentId}`;
      case 'status':
        return `status:${write.commitmentId}:${write.status}`;
      case 'attempted':
        return `attempted:${write.commitmentId}`;
      case 'heartbeat':
        return `heartbeat:${write.heartbeat?.commitmentId}:${write.heartbeat?.heartbeatAtMs}`;
      default:
        return write.id;
    }
  }

  async addCommitment(params: {
    candidate: CommitmentCandidate;
    scope: CommitmentScope;
    itemId?: string;
    earliestMs: number;
    latestMs: number;
    timezone: string;
    nowMs?: number;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      const nowMs = params.nowMs ?? Date.now();
      const record: Partial<CommitmentRecord> = {
        id: `cm_${nowMs.toString(36)}_${randomUUID().slice(0, 8)}`,
        kind: params.candidate.kind,
        sensitivity: params.candidate.sensitivity,
        source: params.candidate.source,
        priority: params.candidate.priority || 'medium',
        status: 'pending',
        reason: params.candidate.reason,
        suggestedText: params.candidate.suggestedText,
        dedupeKey: params.candidate.dedupeKey,
        confidence: params.candidate.confidence,
        dueWindow: {
          earliestMs: params.earliestMs,
          latestMs: params.latestMs,
          timezone: params.timezone,
        },
        ...params.scope,
        tags: params.candidate.tags,
        metadata: params.candidate.metadata,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        attempts: 0,
      };

      const write: PendingWrite = {
        id: randomUUID(),
        type: 'add',
        record,
        resolve: () => resolve(record.id as string),
        reject,
        createdAtMs: nowMs,
        retries: 0,
      };

      this.enqueueWrite(write);
    });
  }

  async updateCommitment(
    id: string,
    updates: Partial<CommitmentRecord>,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const write: PendingWrite = {
        id: randomUUID(),
        type: 'update',
        commitmentId: id,
        record: { ...updates, updatedAtMs: Date.now() },
        resolve: (value) => resolve(value as boolean),
        reject,
        createdAtMs: Date.now(),
        retries: 0,
      };

      this.enqueueWrite(write);
    });
  }

  async deleteCommitment(id: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const write: PendingWrite = {
        id: randomUUID(),
        type: 'delete',
        commitmentId: id,
        resolve: (value) => resolve(value as boolean),
        reject,
        createdAtMs: Date.now(),
        retries: 0,
      };

      this.enqueueWrite(write);
    });
  }

  async updateStatus(
    id: string,
    status: 'sent' | 'dismissed' | 'expired' | 'completed' | 'failed',
    failureReason?: string,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const write: PendingWrite = {
        id: randomUUID(),
        type: 'status',
        commitmentId: id,
        status,
        failureReason,
        resolve: (value) => resolve(value as boolean),
        reject,
        createdAtMs: Date.now(),
        retries: 0,
      };

      this.enqueueWrite(write);
    });
  }

  async markAttempted(id: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const write: PendingWrite = {
        id: randomUUID(),
        type: 'attempted',
        commitmentId: id,
        resolve: (value) => resolve(value as boolean),
        reject,
        createdAtMs: Date.now(),
        retries: 0,
      };

      this.enqueueWrite(write);
    });
  }

  async addHeartbeat(heartbeat: Omit<CommitmentHeartbeat, 'id'>): Promise<CommitmentHeartbeat> {
    return new Promise((resolve, reject) => {
      const write: PendingWrite = {
        id: randomUUID(),
        type: 'heartbeat',
        heartbeat,
        resolve: (value) => resolve(value as CommitmentHeartbeat),
        reject,
        createdAtMs: Date.now(),
        retries: 0,
      };

      this.enqueueWrite(write);
    });
  }

  private enqueueWrite(write: PendingWrite): void {
    if (this.isShutdown) {
      write.reject(new Error('StoreWriter is shutdown'));
      return;
    }

    if (this.enableDeduplication) {
      const dedupeKey = this.generateDedupeKey(write);
      if (dedupeKey && this.dedupeKeys.has(dedupeKey)) {
        this.dedupedWrites++;
        logger.debug(`[Commitments StoreWriter] Deduped write: ${dedupeKey}`);
        write.resolve(true);
        return;
      }
      if (dedupeKey) {
        this.dedupeKeys.add(dedupeKey);
      }
    }

    this.pendingWrites.push(write);
    logger.debug(`[Commitments StoreWriter] Enqueued write: ${write.type} (pending: ${this.pendingWrites.length})`);

    if (this.pendingWrites.length >= this.maxBatchSize) {
      void this.flush();
    } else {
      this.scheduleDebounce();
    }
  }

  private scheduleDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.flush();
    }, this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.pendingWrites.length === 0 || this.isShutdown) {
      return;
    }

    this.isFlushing = true;
    const flushStartTime = Date.now();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const writes = this.pendingWrites.splice(0, this.maxBatchSize);
    logger.debug(`[Commitments StoreWriter] Flushing ${writes.length} writes`);

    if (this.enableDeduplication) {
      for (const write of writes) {
        const dedupeKey = this.generateDedupeKey(write);
        if (dedupeKey) {
          this.dedupeKeys.delete(dedupeKey);
        }
      }
    }

    try {
      await this.applyBatch(writes);
      this.successfulWrites += writes.length;
      this.totalWrites += writes.length;
      this.lastFlushAt = Date.now();
      this.totalFlushCount++;
      this.totalFlushTimeMs += (Date.now() - flushStartTime);

      for (const write of writes) {
        write.resolve(true);
      }
    } catch (err) {
      logger.error(`[Commitments StoreWriter] Flush failed: ${String(err)}`);
      this.failedWrites += writes.length;
      this.totalWrites += writes.length;

      const retryable = writes.filter((w) => w.retries < this.maxRetries);
      const failed = writes.filter((w) => w.retries >= this.maxRetries);

      for (const write of failed) {
        write.reject(err);
      }

      for (const write of retryable) {
        write.retries++;
        this.pendingWrites.unshift(write);
        if (this.enableDeduplication) {
          const dedupeKey = this.generateDedupeKey(write);
          if (dedupeKey) {
            this.dedupeKeys.add(dedupeKey);
          }
        }
      }
    } finally {
      this.isFlushing = false;
    }

    if (this.pendingWrites.length > 0) {
      void this.flush();
    }
  }

  private async applyBatch(writes: PendingWrite[]): Promise<void> {
    let store: CommitmentStoreFile;
    try {
      store = await loadCommitmentStore(this.storePath);
    } catch {
      store = { version: 1, commitments: [], heartbeats: [] };
    }

    const nowMs = Date.now();

    for (const write of writes) {
      switch (write.type) {
        case 'add':
          if (write.record) {
            const record = coerceCommitment(write.record);
            if (record) {
              const existingIndex = store.commitments.findIndex(
                (c) =>
                  c.agentId === record.agentId &&
                  c.sessionKey === record.sessionKey &&
                  c.channel === record.channel &&
                  c.dedupeKey === record.dedupeKey &&
                  (c.status === 'pending' || c.status === 'snoozed'),
              );
              if (existingIndex >= 0) {
                const existing = store.commitments[existingIndex];
                store.commitments[existingIndex] = {
                  ...existing,
                  reason: record.reason || existing.reason,
                  suggestedText: record.suggestedText || existing.suggestedText,
                  confidence: Math.max(existing.confidence, record.confidence),
                  priority: this.priorityToNumber(existing.priority) >= this.priorityToNumber(record.priority)
                    ? existing.priority
                    : record.priority,
                  dueWindow: {
                    earliestMs: Math.min(existing.dueWindow.earliestMs, record.dueWindow.earliestMs),
                    latestMs: Math.max(existing.dueWindow.latestMs, record.dueWindow.latestMs),
                    timezone: record.dueWindow.timezone,
                  },
                  updatedAtMs: nowMs,
                };
              } else {
                store.commitments.push(record);
              }
            }
          }
          break;
        case 'update':
          if (write.commitmentId && write.record) {
            const idx = store.commitments.findIndex((c) => c.id === write.commitmentId);
            if (idx !== -1) {
              store.commitments[idx] = {
                ...store.commitments[idx],
                ...write.record,
                id: store.commitments[idx].id,
              } as CommitmentRecord;
            }
          }
          break;
        case 'delete':
          if (write.commitmentId) {
            store.commitments = store.commitments.filter((c) => c.id !== write.commitmentId);
          }
          break;
        case 'status':
          if (write.commitmentId && write.status) {
            const idx = store.commitments.findIndex((c) => c.id === write.commitmentId);
            if (idx !== -1) {
              const commitment = store.commitments[idx];
              const updated: CommitmentRecord = {
                ...commitment,
                status: write.status as CommitmentRecord['status'],
                updatedAtMs: nowMs,
              };
              if (write.status === 'sent') updated.sentAtMs = nowMs;
              if (write.status === 'dismissed') updated.dismissedAtMs = nowMs;
              if (write.status === 'expired') updated.expiredAtMs = nowMs;
              if (write.status === 'completed') updated.completedAtMs = nowMs;
              if (write.status === 'failed') {
                updated.failedAtMs = nowMs;
                updated.failureReason = write.failureReason;
              }
              store.commitments[idx] = updated;
            }
          }
          break;
        case 'attempted':
          if (write.commitmentId) {
            const idx = store.commitments.findIndex((c) => c.id === write.commitmentId);
            if (idx !== -1) {
              store.commitments[idx] = {
                ...store.commitments[idx],
                attempts: store.commitments[idx].attempts + 1,
                lastAttemptAtMs: nowMs,
                updatedAtMs: nowMs,
              };
            }
          }
          break;
        case 'heartbeat':
          if (write.heartbeat) {
            if (!store.heartbeats) {
              store.heartbeats = [];
            }
            const heartbeat: CommitmentHeartbeat = {
              ...write.heartbeat,
              id: `hb_${nowMs.toString(36)}_${randomUUID().slice(0, 8)}`,
            };
            store.heartbeats.push(heartbeat);
            write.resolve(heartbeat);
          }
          break;
      }
    }

    await saveCommitmentStore(this.storePath, store);
  }

  getStats(): StoreWriterStats {
    return {
      pendingWrites: this.pendingWrites.length,
      totalWrites: this.totalWrites,
      failedWrites: this.failedWrites,
      successfulWrites: this.successfulWrites,
      lastFlushAt: this.lastFlushAt,
      totalFlushCount: this.totalFlushCount,
      averageFlushTimeMs: this.totalFlushCount > 0 ? this.totalFlushTimeMs / this.totalFlushCount : 0,
      dedupedWrites: this.dedupedWrites,
    };
  }

  getPendingCount(): number {
    return this.pendingWrites.length;
  }

  private priorityToNumber(priority: string): number {
    switch (priority) {
      case 'low': return 1;
      case 'medium': return 2;
      case 'high': return 3;
      case 'urgent': return 4;
      default: return 2;
    }
  }

  async shutdown(): Promise<void> {
    this.isShutdown = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.flush();
    logger.info(`[Commitments StoreWriter] Shutdown complete. Total writes: ${this.totalWrites}, Successful: ${this.successfulWrites}, Failed: ${this.failedWrites}`);
  }

  isShutdownStatus(): boolean {
    return this.isShutdown;
  }
}

export class CommitmentStoreWriterManager {
  private writers: Map<string, CommitmentStoreWriter> = new Map();
  private defaultOptions: StoreWriterOptions = {};

  setDefaultOptions(options: StoreWriterOptions): void {
    this.defaultOptions = { ...options };
  }

  getWriter(storePath?: string): CommitmentStoreWriter {
    const path = storePath ?? resolveCommitmentStorePath();
    let writer = this.writers.get(path);
    if (!writer) {
      writer = new CommitmentStoreWriter({ ...this.defaultOptions, storePath: path });
      this.writers.set(path, writer);
    }
    return writer;
  }

  async flushAll(): Promise<void> {
    for (const writer of this.writers.values()) {
      await writer.flush();
    }
  }

  async shutdownAll(): Promise<void> {
    for (const writer of this.writers.values()) {
      await writer.shutdown();
    }
  }

  getWriterCount(): number {
    return this.writers.size;
  }

  getAllStats(): Map<string, StoreWriterStats> {
    const stats = new Map<string, StoreWriterStats>();
    for (const [path, writer] of this.writers) {
      stats.set(path, writer.getStats());
    }
    return stats;
  }
}

export const commitmentStoreWriterManager = new CommitmentStoreWriterManager();

export function getCommitmentStoreWriter(storePath?: string): CommitmentStoreWriter {
  return commitmentStoreWriterManager.getWriter(storePath);
}
