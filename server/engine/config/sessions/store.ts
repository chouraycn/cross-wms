import fs from 'fs';
import { logger } from '../../../logger.js';
import { SessionStoreWriter } from './store-writer.js';
import { SessionStoreCache } from './store-cache.js';
import { SessionStoreMaintenance } from './store-maintenance.js';
import { SessionAccessor } from './session-accessor.js';
import { resolveSessionPaths, ensureSessionDirs, isValidSessionId } from './paths.js';
import { runMigrations, needsMigration } from './store-migrations.js';
import { generateSessionId } from './session-key.js';
import {
  sessionFileExists,
  archivedSessionFileExists,
  listSessionFiles,
  listArchivedSessionFiles,
  moveSessionToArchive,
  moveSessionFromArchive,
  deleteSessionFile,
  deleteArchivedSessionFile,
  getSessionFileInfo,
} from './session-file.js';
import type {
  SessionMetadata,
  SessionData,
  SessionStoreConfig,
  SessionStoreStats,
  SessionListOptions,
  SessionListResult,
  TranscriptMessage,
  SessionStatus,
} from './types.js';
import { SessionMetadataSchema, SessionDataSchema } from './types.js';
import { loadRegistry, findRegistryEntries } from './session-registry-maintenance.js';

export class SessionStore {
  private config: SessionStoreConfig;
  private paths: ReturnType<typeof resolveSessionPaths>;
  private writer: SessionStoreWriter;
  private cache: SessionStoreCache;
  private maintenance: SessionStoreMaintenance;
  private accessor: SessionAccessor;
  private initialized = false;

  constructor(config: SessionStoreConfig) {
    this.config = config;
    this.paths = resolveSessionPaths(config.baseDir, config.archivedDir);
    this.writer = new SessionStoreWriter(config.baseDir, {
      enableAtomicWrites: config.atomicWrites,
      enableFileLocking: config.enableFileLocking,
    });
    this.cache = new SessionStoreCache({
      maxSize: config.cacheMaxSize,
      defaultTTLMs: config.cacheTTLMs,
    });
    this.maintenance = new SessionStoreMaintenance(
      this.paths.baseDir,
      this.paths.archivedDir,
      this.paths.registryFile
    );
    this.accessor = new SessionAccessor(this.paths.baseDir, this.paths.archivedDir);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    logger.info('[SessionStore] 初始化会话存储...');
    ensureSessionDirs(this.paths);

    if (needsMigration(this.paths.baseDir)) {
      logger.info('[SessionStore] 检测到需要数据迁移');
      await runMigrations(this.paths.baseDir, this.paths.archivedDir);
    }

    this.initialized = true;
    logger.info('[SessionStore] 会话存储初始化完成');
  }

  createSession(
    metadata: Partial<SessionMetadata> & { id?: string } = {}
  ): SessionMetadata {
    const sessionId = metadata.id || generateSessionId();
    const now = new Date().toISOString();

    const newMetadata: SessionMetadata = SessionMetadataSchema.parse({
      ...metadata,
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
      sessionDate: now.split('T')[0],
    });

    const sessionData: SessionData = {
      metadata: newMetadata,
      goals: [],
      artifacts: [],
      targets: [],
      extra: {},
    };

    const firstLine = JSON.stringify({
      session: newMetadata,
      messages: [],
      ...sessionData,
    });

    this.writer.writeSessionFile(sessionId, firstLine + '\n')
      .catch(err => logger.error('[SessionStore] 创建会话失败:', sessionId, err));

    this.cache.setMetadata(sessionId, newMetadata);
    this.cache.setSessionData(sessionId, sessionData);

    this.maintenance.updateRegistryEntry(sessionId, {
      sessionId,
      status: newMetadata.status,
      title: newMetadata.title,
      createdAt: newMetadata.createdAt,
      updatedAt: newMetadata.updatedAt,
      lastActiveAt: newMetadata.lastActiveAt,
      size: 0,
      messageCount: 0,
      tags: newMetadata.tags,
    });

    logger.info('[SessionStore] 会话已创建:', sessionId);
    return newMetadata;
  }

  getSession(sessionId: string, isArchived: boolean = false): SessionData | null {
    if (!isValidSessionId(sessionId)) return null;

    const cached = this.cache.getSessionData(sessionId);
    if (cached && !isArchived) return cached;

    const data = this.accessor.getSessionData(sessionId, isArchived);
    if (data && !isArchived) {
      this.cache.setSessionData(sessionId, data);
    }

    return data;
  }

  getMetadata(sessionId: string, isArchived: boolean = false): SessionMetadata | null {
    if (!isValidSessionId(sessionId)) return null;

    const cached = this.cache.getMetadata(sessionId);
    if (cached && !isArchived) return cached;

    const metadata = this.accessor.getMetadata(sessionId, isArchived);
    if (metadata && !isArchived) {
      this.cache.setMetadata(sessionId, metadata);
    }

    return metadata;
  }

  async updateMetadata(
    sessionId: string,
    updates: Partial<SessionMetadata>
  ): Promise<SessionMetadata | null> {
    if (!isValidSessionId(sessionId)) return null;

    const current = this.getMetadata(sessionId);
    if (!current) return null;

    const updated = SessionMetadataSchema.parse({
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    });

    const result = await this.writer.rewriteFirstLine(
      sessionId,
      this.buildFirstLineWithMetadata(sessionId, updated)
    );

    if (result.success) {
      this.cache.setMetadata(sessionId, updated);
      this.maintenance.updateRegistryEntry(sessionId, {
        status: updated.status,
        title: updated.title,
        updatedAt: updated.updatedAt,
        lastActiveAt: updated.lastActiveAt,
        tags: updated.tags,
      });
      return updated;
    }

    return null;
  }

  async deleteSession(sessionId: string, permanent: boolean = false): Promise<boolean> {
    if (!isValidSessionId(sessionId)) return false;

    if (permanent) {
      const deleted = deleteSessionFile(this.paths.baseDir, sessionId)
        || deleteArchivedSessionFile(this.paths.archivedDir, sessionId);
      if (deleted) {
        this.cache.invalidateSessionData(sessionId);
        this.maintenance.removeRegistryEntry(sessionId);
        logger.info('[SessionStore] 会话已永久删除:', sessionId);
      }
      return deleted;
    }

    return this.updateMetadata(sessionId, { status: 'deleted' as SessionStatus })
      .then(r => !!r);
  }

  async archiveSession(sessionId: string): Promise<boolean> {
    if (!isValidSessionId(sessionId)) return false;
    if (!sessionFileExists(this.paths.baseDir, sessionId)) return false;

    const metadata = this.getMetadata(sessionId);
    if (metadata?.status === 'archived') return false;

    await this.updateMetadata(sessionId, { status: 'archived' });

    const moved = moveSessionToArchive(
      this.paths.baseDir,
      this.paths.archivedDir,
      sessionId
    );

    if (moved) {
      this.cache.invalidateSessionData(sessionId);
      this.maintenance.updateRegistryEntry(sessionId, { status: 'archived' });
      logger.info('[SessionStore] 会话已归档:', sessionId);
    }

    return moved;
  }

  async restoreSession(sessionId: string): Promise<boolean> {
    if (!isValidSessionId(sessionId)) return false;
    if (!archivedSessionFileExists(this.paths.archivedDir, sessionId)) return false;

    const moved = moveSessionFromArchive(
      this.paths.baseDir,
      this.paths.archivedDir,
      sessionId
    );

    if (moved) {
      await this.updateMetadata(sessionId, { status: 'active' });
      this.maintenance.updateRegistryEntry(sessionId, { status: 'active' });
      logger.info('[SessionStore] 会话已恢复:', sessionId);
    }

    return moved;
  }

  listSessions(options: SessionListOptions = {}): SessionListResult {
    const registry = loadRegistry(this.paths.registryFile);
    let entries = findRegistryEntries(registry, {
      status: options.status,
      searchQuery: options.searchQuery,
      tags: options.tags,
    });

    if (options.dateFrom) {
      entries = entries.filter(e => e.sessionDate >= options.dateFrom!);
    }
    if (options.dateTo) {
      entries = entries.filter(e => e.sessionDate <= options.dateTo!);
    }

    const sortBy = options.sortBy || 'updatedAt';
    const sortOrder = options.sortOrder || 'desc';

    entries.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    const total = entries.length;
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    const paged = entries.slice(offset, offset + limit);

    const sessions = paged.map(e => {
      const meta = this.getMetadata(e.sessionId, e.status === 'archived');
      return meta || SessionMetadataSchema.parse({
        id: e.sessionId,
        title: e.title,
        status: e.status,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        lastActiveAt: e.lastActiveAt,
        messageCount: e.messageCount,
        tags: e.tags,
      });
    });

    return {
      sessions,
      total,
      hasMore: offset + limit < total,
    };
  }

  getMessages(
    sessionId: string,
    isArchived: boolean = false
  ): TranscriptMessage[] {
    if (!isValidSessionId(sessionId)) return [];

    const cached = this.cache.getMessages(sessionId);
    if (cached && !isArchived) return cached;

    const messages = this.accessor.getMessages(sessionId, isArchived);
    if (!isArchived) {
      this.cache.setMessages(sessionId, messages);
    }

    return messages;
  }

  async appendMessage(
    sessionId: string,
    message: TranscriptMessage
  ): Promise<boolean> {
    if (!isValidSessionId(sessionId)) return false;
    if (!sessionFileExists(this.paths.baseDir, sessionId)) return false;

    const line = JSON.stringify({ message });
    const result = await this.writer.appendToSessionFile(sessionId, line);

    if (result.success) {
      this.cache.appendMessage(sessionId, message);

      const info = getSessionFileInfo(this.paths.baseDir, sessionId, false);
      if (info) {
        this.maintenance.updateRegistryEntry(sessionId, {
          size: info.size,
          lastActiveAt: new Date().toISOString(),
        });
      }
    }

    return result.success;
  }

  getStats(): SessionStoreStats {
    const diskUsage = this.maintenance.getDiskUsage();
    const cacheStats = this.cache.getStats();
    const activeIds = listSessionFiles(this.paths.baseDir);
    const archivedIds = listArchivedSessionFiles(this.paths.archivedDir);

    return {
      totalSessions: activeIds.length + archivedIds.length,
      activeSessions: activeIds.length,
      archivedSessions: archivedIds.length,
      totalSizeBytes: diskUsage.totalBytes,
      cacheHitCount: cacheStats.hitCount,
      cacheMissCount: cacheStats.missCount,
    };
  }

  runMaintenance() {
    return this.maintenance.runMaintenance();
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('[SessionStore] 缓存已清空');
  }

  getPaths() {
    return this.paths;
  }

  getWriter() {
    return this.writer;
  }

  getCache() {
    return this.cache;
  }

  getMaintenance() {
    return this.maintenance;
  }

  getAccessor() {
    return this.accessor;
  }

  private buildFirstLineWithMetadata(
    sessionId: string,
    metadata: SessionMetadata
  ): string {
    const currentData = this.accessor.getSessionData(sessionId, false);
    const messages = this.accessor.getMessages(sessionId, false);

    const firstLineData = {
      session: metadata,
      messages: messages.slice(0, 0),
      goals: currentData?.goals || [],
      artifacts: currentData?.artifacts || [],
      targets: currentData?.targets || [],
      threadInfo: currentData?.threadInfo,
      extra: currentData?.extra || {},
    };

    return JSON.stringify(firstLineData);
  }
}

let globalStore: SessionStore | null = null;

export function getSessionStore(config?: SessionStoreConfig): SessionStore {
  if (!globalStore && config) {
    globalStore = new SessionStore(config);
  }
  if (!globalStore) {
    throw new Error('SessionStore not initialized');
  }
  return globalStore;
}
