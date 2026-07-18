import { LRUCache } from '../../../cache/lru-cache.js';
import { logger } from '../../../logger.js';
import type { SessionData, SessionMetadata, TranscriptMessage } from './types.js';

export interface StoreCacheOptions {
  maxSize?: number;
  defaultTTLMs?: number;
  maxMemoryBytes?: number;
}

export class SessionStoreCache {
  private metadataCache: LRUCache<SessionMetadata>;
  private sessionDataCache: LRUCache<SessionData>;
  private messagesCache: LRUCache<TranscriptMessage[]>;

  private hitCount = 0;
  private missCount = 0;

  constructor(options: StoreCacheOptions = {}) {
    const maxSize = options.maxSize ?? 100;
    const defaultTTLMs = options.defaultTTLMs ?? 5 * 60 * 1000;
    const maxMemoryBytes = options.maxMemoryBytes ?? 50 * 1024 * 1024;

    this.metadataCache = new LRUCache<SessionMetadata>({
      maxSize,
      defaultTTL: defaultTTLMs,
      maxMemoryBytes: Math.floor(maxMemoryBytes / 4),
    });

    this.sessionDataCache = new LRUCache<SessionData>({
      maxSize: Math.floor(maxSize / 2),
      defaultTTL: defaultTTLMs,
      maxMemoryBytes: Math.floor(maxMemoryBytes / 2),
    });

    this.messagesCache = new LRUCache<TranscriptMessage[]>({
      maxSize: Math.floor(maxSize / 2),
      defaultTTL: defaultTTLMs,
      maxMemoryBytes: Math.floor(maxMemoryBytes / 4),
    });
  }

  getMetadata(sessionId: string): SessionMetadata | undefined {
    const key = `meta:${sessionId}`;
    const value = this.metadataCache.get(key);
    if (value) {
      this.hitCount++;
      logger.debug('[StoreCache] 元数据缓存命中:', sessionId);
    } else {
      this.missCount++;
      logger.debug('[StoreCache] 元数据缓存未命中:', sessionId);
    }
    return value;
  }

  setMetadata(sessionId: string, metadata: SessionMetadata): void {
    const key = `meta:${sessionId}`;
    this.metadataCache.set(key, metadata);
    logger.debug('[StoreCache] 元数据已缓存:', sessionId);
  }

  invalidateMetadata(sessionId: string): boolean {
    const key = `meta:${sessionId}`;
    return this.metadataCache.delete(key);
  }

  getSessionData(sessionId: string): SessionData | undefined {
    const key = `data:${sessionId}`;
    const value = this.sessionDataCache.get(key);
    if (value) {
      this.hitCount++;
      logger.debug('[StoreCache] 会话数据缓存命中:', sessionId);
    } else {
      this.missCount++;
      logger.debug('[StoreCache] 会话数据缓存未命中:', sessionId);
    }
    return value;
  }

  setSessionData(sessionId: string, data: SessionData): void {
    const key = `data:${sessionId}`;
    this.sessionDataCache.set(key, data);
    this.metadataCache.set(`meta:${sessionId}`, data.metadata);
    logger.debug('[StoreCache] 会话数据已缓存:', sessionId);
  }

  invalidateSessionData(sessionId: string): void {
    this.sessionDataCache.delete(`data:${sessionId}`);
    this.metadataCache.delete(`meta:${sessionId}`);
    this.messagesCache.delete(`msgs:${sessionId}`);
  }

  getMessages(sessionId: string): TranscriptMessage[] | undefined {
    const key = `msgs:${sessionId}`;
    const value = this.messagesCache.get(key);
    if (value) {
      this.hitCount++;
      logger.debug('[StoreCache] 消息缓存命中:', sessionId);
    } else {
      this.missCount++;
      logger.debug('[StoreCache] 消息缓存未命中:', sessionId);
    }
    return value;
  }

  setMessages(sessionId: string, messages: TranscriptMessage[]): void {
    const key = `msgs:${sessionId}`;
    this.messagesCache.set(key, messages);
    logger.debug('[StoreCache] 消息已缓存:', sessionId, 'count:', messages.length);
  }

  appendMessage(sessionId: string, message: TranscriptMessage): void {
    const key = `msgs:${sessionId}`;
    const cached = this.messagesCache.get(key);
    if (cached) {
      cached.push(message);
      this.messagesCache.set(key, cached);
    }
  }

  invalidateMessages(sessionId: string): boolean {
    const key = `msgs:${sessionId}`;
    return this.messagesCache.delete(key);
  }

  clear(): void {
    this.metadataCache.clear();
    this.sessionDataCache.clear();
    this.messagesCache.clear();
    logger.info('[StoreCache] 缓存已清空');
  }

  pruneExpired(): number {
    const metaRemoved = this.metadataCache.pruneExpired();
    const dataRemoved = this.sessionDataCache.pruneExpired();
    const msgsRemoved = this.messagesCache.pruneExpired();
    const total = metaRemoved + dataRemoved + msgsRemoved;
    if (total > 0) {
      logger.debug('[StoreCache] 清理过期条目:', total);
    }
    return total;
  }

  getStats(): {
    hitCount: number;
    missCount: number;
    hitRate: number;
    metadataSize: number;
    sessionDataSize: number;
    messagesSize: number;
  } {
    const total = this.hitCount + this.missCount;
    return {
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: total > 0 ? this.hitCount / total : 0,
      metadataSize: this.metadataCache.size(),
      sessionDataSize: this.sessionDataCache.size(),
      messagesSize: this.messagesCache.size(),
    };
  }

  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }
}
