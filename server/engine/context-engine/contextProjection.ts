import { logger } from '../../logger.js';
import type {
  AgentMessage,
  ContextEngineProjection,
} from './types.js';

const MAX_CACHE_SIZE = 10;

export interface ProjectionCacheEntry {
  fingerprint: string;
  epoch: string;
  mode: 'per_turn' | 'thread_bootstrap';
  systemMessages: AgentMessage[];
  toolDefinitions: string[];
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export type ProjectionMode = 'per_turn' | 'thread_bootstrap';

export interface ProjectionComputeOptions {
  systemMessages: AgentMessage[];
  availableTools?: Set<string>;
  toolDefinitions?: string[];
}

export function generateFingerprint(
  systemMessages: AgentMessage[],
  toolDefinitions: string[] = []
): string {
  const normalizedMessages = systemMessages
    .map(m => `${m.role}:${m.content || ''}`)
    .join('|');
  const normalizedTools = toolDefinitions.sort().join(',');
  const combined = `${normalizedMessages}||${normalizedTools}`;

  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
  const lengthHash = combined.length.toString(16).padStart(4, '0');

  return `fp_${hashStr}_${lengthHash}`;
}

function epochNext(prevEpoch?: string): string {
  if (!prevEpoch) {
    return '1';
  }
  const num = parseInt(prevEpoch, 10);
  if (isNaN(num)) {
    return '1';
  }
  return String(num + 1);
}

export class ContextProjectionManager {
  private cache: Map<string, ProjectionCacheEntry> = new Map();
  private maxSize: number;
  private currentEpoch: string = '0';
  private currentFingerprint: string | null = null;
  private mode: ProjectionMode;

  constructor(mode: ProjectionMode = 'per_turn', maxSize: number = MAX_CACHE_SIZE) {
    this.mode = mode;
    this.maxSize = maxSize;
  }

  getMode(): ProjectionMode {
    return this.mode;
  }

  setMode(mode: ProjectionMode): void {
    if (this.mode !== mode) {
      this.mode = mode;
      logger.debug(`[ContextProjectionManager] 模式切换为: ${mode}`);
    }
  }

  getCurrentEpoch(): string {
    return this.currentEpoch;
  }

  getCurrentFingerprint(): string | null {
    return this.currentFingerprint;
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  computeProjection(options: ProjectionComputeOptions): ContextEngineProjection {
    const { systemMessages, availableTools, toolDefinitions } = options;

    const tools = toolDefinitions ?? (availableTools ? Array.from(availableTools) : []);
    const fingerprint = generateFingerprint(systemMessages, tools);

    const cacheHit = this.tryGetCache(fingerprint);

    if (cacheHit) {
      logger.debug(`[ContextProjectionManager] 缓存命中: fingerprint=${fingerprint}, epoch=${cacheHit.epoch}`);
      this.currentFingerprint = fingerprint;
      this.currentEpoch = cacheHit.epoch;
      return {
        mode: this.mode,
        epoch: cacheHit.epoch,
        fingerprint,
      };
    }

    const newEpoch = this.mode === 'per_turn'
      ? epochNext(this.currentEpoch)
      : (this.currentFingerprint ? epochNext(this.currentEpoch) : '1');

    this.putCache({
      fingerprint,
      epoch: newEpoch,
      mode: this.mode,
      systemMessages: [...systemMessages],
      toolDefinitions: [...tools],
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 1,
    });

    this.currentFingerprint = fingerprint;
    this.currentEpoch = newEpoch;

    logger.debug(`[ContextProjectionManager] 新投影生成: fingerprint=${fingerprint}, epoch=${newEpoch}, mode=${this.mode}`);

    return {
      mode: this.mode,
      epoch: newEpoch,
      fingerprint,
    };
  }

  isCacheHit(fingerprint: string): boolean {
    return this.cache.has(fingerprint);
  }

  tryGetCache(fingerprint: string): ProjectionCacheEntry | null {
    const entry = this.cache.get(fingerprint);
    if (!entry) {
      return null;
    }

    entry.lastAccessedAt = Date.now();
    entry.accessCount += 1;

    this.cache.delete(fingerprint);
    this.cache.set(fingerprint, entry);

    return entry;
  }

  putCache(entry: ProjectionCacheEntry): void {
    if (this.cache.has(entry.fingerprint)) {
      this.cache.delete(entry.fingerprint);
    }

    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        const evicted = this.cache.get(firstKey);
        this.cache.delete(firstKey);
        logger.debug(`[ContextProjectionManager] LRU 淘汰: fingerprint=${firstKey}, epoch=${evicted?.epoch}`);
      }
    }

    this.cache.set(entry.fingerprint, entry);
  }

  invalidate(fingerprint?: string): boolean {
    if (fingerprint) {
      const existed = this.cache.delete(fingerprint);
      if (existed) {
        logger.debug(`[ContextProjectionManager] 投影失效: fingerprint=${fingerprint}`);
      }
      return existed;
    }

    const size = this.cache.size;
    this.cache.clear();
    if (size > 0) {
      logger.debug(`[ContextProjectionManager] 全部投影失效，清除 ${size} 条缓存`);
    }
    return size > 0;
  }

  resetEpoch(): void {
    this.currentEpoch = '0';
    this.currentFingerprint = null;
    logger.debug('[ContextProjectionManager] epoch 已重置');
  }

  getCacheStats(): {
    size: number;
    maxSize: number;
    entries: Array<{
      fingerprint: string;
      epoch: string;
      mode: string;
      accessCount: number;
      ageMs: number;
    }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.values()).map(entry => ({
      fingerprint: entry.fingerprint,
      epoch: entry.epoch,
      mode: entry.mode,
      accessCount: entry.accessCount,
      ageMs: now - entry.createdAt,
    }));

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      entries,
    };
  }

  dispose(): void {
    this.cache.clear();
    this.currentEpoch = '0';
    this.currentFingerprint = null;
  }
}

export function createContextProjectionManager(
  mode: ProjectionMode = 'per_turn',
  maxSize?: number
): ContextProjectionManager {
  return new ContextProjectionManager(mode, maxSize);
}
