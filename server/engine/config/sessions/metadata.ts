import { logger } from '../../../logger.js';
import { SessionStore, getSessionStore } from './store.js';
import type { SessionMetadata } from './types.js';
import { SessionMetadataSchema } from './types.js';

// 重新导出 SessionMetadata 类型，便于外部直接从本模块引入
export type { SessionMetadata } from './types.js';

export class SessionMetadataManager {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  get(sessionId: string): SessionMetadata | null {
    return this.store.getMetadata(sessionId);
  }

  async update(
    sessionId: string,
    updates: Partial<SessionMetadata>
  ): Promise<SessionMetadata | null> {
    return this.store.updateMetadata(sessionId, updates);
  }

  async setTitle(sessionId: string, title: string): Promise<SessionMetadata | null> {
    return this.store.updateMetadata(sessionId, { title });
  }

  async setStatus(
    sessionId: string,
    status: SessionMetadata['status']
  ): Promise<SessionMetadata | null> {
    return this.store.updateMetadata(sessionId, { status });
  }

  async setModel(sessionId: string, model: string): Promise<SessionMetadata | null> {
    return this.store.updateMetadata(sessionId, { model });
  }

  async setAgentId(sessionId: string, agentId: string | null): Promise<SessionMetadata | null> {
    return this.store.updateMetadata(sessionId, { agentId });
  }

  async setFolder(sessionId: string, folderId: string | null): Promise<SessionMetadata | null> {
    return this.store.updateMetadata(sessionId, { folderId });
  }

  async setTags(sessionId: string, tags: string[]): Promise<SessionMetadata | null> {
    return this.store.updateMetadata(sessionId, { tags });
  }

  async addTag(sessionId: string, tag: string): Promise<SessionMetadata | null> {
    const metadata = this.store.getMetadata(sessionId);
    if (!metadata) return null;

    const tags = [...metadata.tags];
    if (!tags.includes(tag)) {
      tags.push(tag);
    }

    return this.store.updateMetadata(sessionId, { tags });
  }

  async removeTag(sessionId: string, tag: string): Promise<SessionMetadata | null> {
    const metadata = this.store.getMetadata(sessionId);
    if (!metadata) return null;

    const tags = metadata.tags.filter(t => t !== tag);
    return this.store.updateMetadata(sessionId, { tags });
  }

  async setSummary(sessionId: string, summary: string): Promise<SessionMetadata | null> {
    return this.store.updateMetadata(sessionId, { summary });
  }

  async setLastActive(sessionId: string): Promise<SessionMetadata | null> {
    return this.store.updateMetadata(sessionId, {
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async incrementMessageCount(sessionId: string, increment: number = 1): Promise<SessionMetadata | null> {
    const metadata = this.store.getMetadata(sessionId);
    if (!metadata) return null;

    return this.store.updateMetadata(sessionId, {
      messageCount: Math.max(0, metadata.messageCount + increment),
    });
  }

  validate(metadata: unknown): metadata is SessionMetadata {
    const result = SessionMetadataSchema.safeParse(metadata);
    if (!result.success) {
      logger.warn('[SessionMetadata] 验证失败:', result.error.issues);
      return false;
    }
    return true;
  }

  createDefault(
    sessionId: string,
    overrides: Partial<SessionMetadata> = {}
  ): SessionMetadata {
    return SessionMetadataSchema.parse({
      id: sessionId,
      ...overrides,
    });
  }

  toJSON(metadata: SessionMetadata): Record<string, unknown> {
    return JSON.parse(JSON.stringify(metadata));
  }

  fromJSON(data: unknown): SessionMetadata | null {
    const result = SessionMetadataSchema.safeParse(data);
    if (result.success) {
      return result.data;
    }
    logger.warn('[SessionMetadata] 从 JSON 解析失败:', result.error.issues);
    return null;
  }

  merge(
    base: SessionMetadata,
    updates: Partial<SessionMetadata>
  ): SessionMetadata {
    return SessionMetadataSchema.parse({
      ...base,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }

  getAge(metadata: SessionMetadata): number {
    const created = new Date(metadata.createdAt).getTime();
    return Date.now() - created;
  }

  getIdleTime(metadata: SessionMetadata): number {
    const lastActive = new Date(metadata.lastActiveAt).getTime();
    return Date.now() - lastActive;
  }

  isArchived(metadata: SessionMetadata): boolean {
    return metadata.status === 'archived';
  }

  isActive(metadata: SessionMetadata): boolean {
    return metadata.status === 'active';
  }

  isDeleted(metadata: SessionMetadata): boolean {
    return metadata.status === 'deleted';
  }

  isToday(metadata: SessionMetadata): boolean {
    const today = new Date().toISOString().split('T')[0];
    return metadata.sessionDate === today;
  }

  getDateString(metadata: SessionMetadata): string {
    return metadata.sessionDate || metadata.createdAt.split('T')[0];
  }
}

// ===== 会话元数据精简函数实现 =====

/**
 * 读取指定会话的元数据。
 * 内部通过全局 SessionStore 单例获取，未初始化时返回 null。
 */
export function readSessionMetadata(sessionId: string): SessionMetadata | null {
  try {
    const store = getSessionStore();
    return store.getMetadata(sessionId);
  } catch (err) {
    logger.error('[metadata] readSessionMetadata 失败:', sessionId, err);
    return null;
  }
}

/**
 * 全量写入指定会话的元数据。
 * 若会话已存在则替换其元数据；若不存在则基于给定元数据创建新会话。
 */
export async function writeSessionMetadata(
  sessionId: string,
  metadata: SessionMetadata,
): Promise<SessionMetadata | null> {
  try {
    const store = getSessionStore();
    const existing = store.getMetadata(sessionId);
    if (existing) {
      // 会话已存在：用完整 metadata 作为 patch 进行替换
      return store.updateMetadata(sessionId, metadata);
    }
    // 会话不存在：创建新会话
    return store.createSession({ ...metadata, id: sessionId });
  } catch (err) {
    logger.error('[metadata] writeSessionMetadata 失败:', sessionId, err);
    return null;
  }
}

/**
 * 增量更新指定会话的元数据。
 * 仅合并 patch 中提供的字段，未提供的字段保持不变。
 */
export async function updateSessionMetadata(
  sessionId: string,
  patch: Partial<SessionMetadata>,
): Promise<SessionMetadata | null> {
  try {
    const store = getSessionStore();
    return store.updateMetadata(sessionId, patch);
  } catch (err) {
    logger.error('[metadata] updateSessionMetadata 失败:', sessionId, err);
    return null;
  }
}
