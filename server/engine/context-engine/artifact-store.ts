import { logger } from '../../logger.js';

export type ArtifactType =
  | 'code'
  | 'file'
  | 'document'
  | 'image'
  | 'data'
  | 'tool-result'
  | 'search-result'
  | 'summary'
  | 'custom';

export interface Artifact {
  id: string;
  type: ArtifactType;
  name: string;
  content: string;
  contentType: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
  source: string;
  sessionId?: string;
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  accessCount: number;
  tags: string[];
  expiresAt?: number;
  references: string[];
}

export interface ArtifactStoreConfig {
  maxTotalSizeBytes: number;
  maxArtifactSizeBytes: number;
  maxArtifacts: number;
  defaultTTLMs: number;
  cleanupStrategy: 'lru' | 'fifo' | 'size';
}

export interface ArtifactSearchOptions {
  type?: ArtifactType | ArtifactType[];
  tags?: string[];
  sessionId?: string;
  source?: string;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  createdAfter?: number;
  createdBefore?: number;
  limit?: number;
  offset?: number;
}

export interface ArtifactStats {
  totalArtifacts: number;
  totalSizeBytes: number;
  byType: Record<ArtifactType, { count: number; sizeBytes: number }>;
  bySession: Record<string, { count: number; sizeBytes: number }>;
  lastCleanupAt?: number;
  lastArtifactAddedAt?: number;
}

const DEFAULT_CONFIG: Required<ArtifactStoreConfig> = {
  maxTotalSizeBytes: 100 * 1024 * 1024,
  maxArtifactSizeBytes: 10 * 1024 * 1024,
  maxArtifacts: 10000,
  defaultTTLMs: 24 * 60 * 60 * 1000,
  cleanupStrategy: 'lru',
};

export class ArtifactStore {
  private config: Required<ArtifactStoreConfig>;
  private artifacts: Map<string, Artifact> = new Map();
  private lastCleanupAt?: number;
  private lastArtifactAddedAt?: number;

  constructor(config: Partial<ArtifactStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.debug('[ArtifactStore] 工件存储初始化完成');
  }

  add(
    artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt' | 'accessedAt' | 'accessCount' | 'references' | 'tags' | 'sizeBytes' | 'metadata'> &
      Partial<Pick<Artifact, 'id' | 'metadata' | 'tags' | 'expiresAt'>>
  ): Artifact {
    const sizeBytes = Buffer.byteLength(artifact.content, 'utf-8');

    if (sizeBytes > this.config.maxArtifactSizeBytes) {
      throw new Error(
        `工件大小 ${sizeBytes} 超过限制 ${this.config.maxArtifactSizeBytes}`
      );
    }

    const id = artifact.id || this.generateId();
    const now = Date.now();

    const fullArtifact: Artifact = {
      id,
      type: artifact.type,
      name: artifact.name,
      content: artifact.content,
      contentType: artifact.contentType,
      sizeBytes,
      metadata: artifact.metadata || {},
      source: artifact.source,
      sessionId: artifact.sessionId,
      createdAt: now,
      updatedAt: now,
      accessedAt: now,
      accessCount: 0,
      tags: artifact.tags || [],
      expiresAt: artifact.expiresAt || now + this.config.defaultTTLMs,
      references: [],
    };

    this.artifacts.set(id, fullArtifact);
    this.lastArtifactAddedAt = now;

    logger.debug(`[ArtifactStore] 添加工件: ${id} (${artifact.type}, ${sizeBytes} bytes)`);

    this.cleanupIfNeeded();

    return fullArtifact;
  }

  get(id: string): Artifact | null {
    const artifact = this.artifacts.get(id);
    if (!artifact) return null;

    artifact.accessedAt = Date.now();
    artifact.accessCount++;

    return { ...artifact };
  }

  update(
    id: string,
    updates: Partial<{
      content: string;
      name: string;
      metadata: Record<string, unknown>;
      tags: string[];
      expiresAt: number;
    }>
  ): Artifact | null {
    const artifact = this.artifacts.get(id);
    if (!artifact) return null;

    if (updates.content !== undefined) {
      artifact.content = updates.content;
      artifact.sizeBytes = Buffer.byteLength(updates.content, 'utf-8');
    }
    if (updates.name !== undefined) artifact.name = updates.name;
    if (updates.metadata !== undefined) artifact.metadata = updates.metadata;
    if (updates.tags !== undefined) artifact.tags = updates.tags;
    if (updates.expiresAt !== undefined) artifact.expiresAt = updates.expiresAt;

    artifact.updatedAt = Date.now();
    artifact.accessedAt = Date.now();

    logger.debug(`[ArtifactStore] 更新工件: ${id}`);
    return { ...artifact };
  }

  remove(id: string): boolean {
    const existed = this.artifacts.delete(id);
    if (existed) {
      logger.debug(`[ArtifactStore] 移除工件: ${id}`);
    }
    return existed;
  }

  search(options: ArtifactSearchOptions = {}): Artifact[] {
    const {
      type,
      tags,
      sessionId,
      source,
      minSizeBytes,
      maxSizeBytes,
      createdAfter,
      createdBefore,
      limit = 50,
      offset = 0,
    } = options;

    const typeSet = type ? (Array.isArray(type) ? new Set(type) : new Set([type])) : null;
    const tagSet = tags ? new Set(tags) : null;

    const results: Artifact[] = [];

    for (const artifact of this.artifacts.values()) {
      if (typeSet && !typeSet.has(artifact.type)) continue;
      if (sessionId && artifact.sessionId !== sessionId) continue;
      if (source && artifact.source !== source) continue;
      if (minSizeBytes !== undefined && artifact.sizeBytes < minSizeBytes) continue;
      if (maxSizeBytes !== undefined && artifact.sizeBytes > maxSizeBytes) continue;
      if (createdAfter !== undefined && artifact.createdAt < createdAfter) continue;
      if (createdBefore !== undefined && artifact.createdAt > createdBefore) continue;
      if (tagSet) {
        const artifactTags = new Set(artifact.tags);
        const hasMatchingTag = Array.from(tagSet).some(t => artifactTags.has(t));
        if (!hasMatchingTag) continue;
      }

      results.push({ ...artifact });
    }

    results.sort((a, b) => b.createdAt - a.createdAt);

    return results.slice(offset, offset + limit);
  }

  getBySession(sessionId: string): Artifact[] {
    return this.search({ sessionId });
  }

  getByType(type: ArtifactType): Artifact[] {
    return this.search({ type });
  }

  clear(): number {
    const count = this.artifacts.size;
    this.artifacts.clear();
    logger.debug(`[ArtifactStore] 清空工件存储，共 ${count} 件`);
    return count;
  }

  clearSession(sessionId: string): number {
    let count = 0;
    for (const artifact of this.artifacts.values()) {
      if (artifact.sessionId === sessionId) {
        this.artifacts.delete(artifact.id);
        count++;
      }
    }
    logger.debug(`[ArtifactStore] 清空会话工件: session=${sessionId}, count=${count}`);
    return count;
  }

  getStats(): ArtifactStats {
    const byType: ArtifactStats['byType'] = {} as ArtifactStats['byType'];
    const bySession: ArtifactStats['bySession'] = {};
    let totalSizeBytes = 0;

    for (const artifact of this.artifacts.values()) {
      totalSizeBytes += artifact.sizeBytes;

      if (!byType[artifact.type]) {
        byType[artifact.type] = { count: 0, sizeBytes: 0 };
      }
      byType[artifact.type].count++;
      byType[artifact.type].sizeBytes += artifact.sizeBytes;

      if (artifact.sessionId) {
        if (!bySession[artifact.sessionId]) {
          bySession[artifact.sessionId] = { count: 0, sizeBytes: 0 };
        }
        bySession[artifact.sessionId].count++;
        bySession[artifact.sessionId].sizeBytes += artifact.sizeBytes;
      }
    }

    return {
      totalArtifacts: this.artifacts.size,
      totalSizeBytes,
      byType,
      bySession,
      lastCleanupAt: this.lastCleanupAt,
      lastArtifactAddedAt: this.lastArtifactAddedAt,
    };
  }

  cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, artifact] of this.artifacts) {
      if (artifact.expiresAt && artifact.expiresAt < now) {
        this.artifacts.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`[ArtifactStore] 清理过期工件: ${removed} 件`);
    }

    this.lastCleanupAt = now;
    return removed;
  }

  private cleanupIfNeeded(): void {
    this.cleanupExpired();

    const stats = this.getStats();

    if (
      stats.totalArtifacts > this.config.maxArtifacts ||
      stats.totalSizeBytes > this.config.maxTotalSizeBytes
    ) {
      this.runCleanup();
    }
  }

  private runCleanup(): void {
    const sorted = Array.from(this.artifacts.values()).sort((a, b) => {
      switch (this.config.cleanupStrategy) {
        case 'lru':
          return a.accessedAt - b.accessedAt;
        case 'fifo':
          return a.createdAt - b.createdAt;
        case 'size':
          return b.sizeBytes - a.sizeBytes;
        default:
          return a.accessedAt - b.accessedAt;
      }
    });

    while (
      this.artifacts.size > this.config.maxArtifacts * 0.8 ||
      this.getStats().totalSizeBytes > this.config.maxTotalSizeBytes * 0.8
    ) {
      const toRemove = sorted.shift();
      if (!toRemove) break;
      this.artifacts.delete(toRemove.id);
    }

    this.lastCleanupAt = Date.now();
    logger.debug('[ArtifactStore] 工件存储清理完成');
  }

  private generateId(): string {
    return `art_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
