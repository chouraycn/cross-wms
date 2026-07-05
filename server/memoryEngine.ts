/**
 * 基础记忆引擎
 *
 * 会话级别的记忆管理系统，支持：
 * - 工作记忆（短期，当前会话上下文）
 * - 长期记忆（持久化，跨会话）
 * - 记忆提取和检索
 * - 记忆重要性评分
 */

import fs from 'fs';
import path from 'path';
import { AppPaths } from './config/appPaths.js';
import { logger } from './logger.js';
import { getGlobalMemoryHostRegistry } from './engine/memory-host/index.js';

/** 记忆条目 */
export interface MemoryItem {
  /** 记忆唯一 ID */
  id: string;
  /** 记忆内容 */
  content: string;
  /** 记忆类型 */
  type: 'fact' | 'preference' | 'experience' | 'instruction' | 'other';
  /** 重要性评分（0-10） */
  importance: number;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 最后访问时间 */
  lastAccessedAt: string;
  /** 访问次数 */
  accessCount: number;
  /** 关联标签 */
  tags?: string[];
  /** 来源会话 ID */
  sourceSessionId?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 记忆查询选项 */
export interface MemoryQueryOptions {
  /** 最大返回数量 */
  limit?: number;
  /** 最小重要性评分 */
  minImportance?: number;
  /** 按类型过滤 */
  types?: MemoryItem['type'][];
  /** 按标签过滤 */
  tags?: string[];
  /** 排序方式 */
  sortBy?: 'importance' | 'recency' | 'accessCount';
  /** 搜索关键词 */
  query?: string;
}

/**
 * 记忆引擎
 */
class MemoryEngine {
  private memoryDir: string;
  private globalMemories: MemoryItem[] = [];
  private sessionMemories: Map<string, MemoryItem[]> = new Map();
  private initialized = false;

  constructor() {
    this.memoryDir = path.join(AppPaths.userDataDir, 'memory');
  }

  /**
   * 初始化记忆引擎
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    logger.info('[MemoryEngine] 正在初始化记忆引擎...');

    try {
      this.ensureMemoryDir();
      this.loadGlobalMemories();
    } catch (e) {
      logger.error('[MemoryEngine] 初始化失败:', e);
    }

    this.initialized = true;
    logger.info(`[MemoryEngine] 记忆引擎初始化完成，全局记忆 ${this.globalMemories.length} 条`);
  }

  private ensureMemoryDir(): void {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
    const sessionsDir = path.join(this.memoryDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
  }

  private loadGlobalMemories(): void {
    const file = path.join(this.memoryDir, 'global-memories.json');
    try {
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (Array.isArray(data)) {
          this.globalMemories = data;
        }
      }
    } catch (e) {
      logger.warn('[MemoryEngine] 加载全局记忆失败:', e);
      this.globalMemories = [];
    }
  }

  private saveGlobalMemories(): void {
    const file = path.join(this.memoryDir, 'global-memories.json');
    try {
      fs.writeFileSync(file, JSON.stringify(this.globalMemories, null, 2));
    } catch (e) {
      logger.error('[MemoryEngine] 保存全局记忆失败:', e);
    }
  }

  private getSessionMemoryFile(sessionId: string): string {
    return path.join(this.memoryDir, 'sessions', `${sessionId}.json`);
  }

  private loadSessionMemories(sessionId: string): MemoryItem[] {
    if (this.sessionMemories.has(sessionId)) {
      return this.sessionMemories.get(sessionId)!;
    }

    const file = this.getSessionMemoryFile(sessionId);
    try {
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (Array.isArray(data)) {
          this.sessionMemories.set(sessionId, data);
          return data;
        }
      }
    } catch (e) {
      logger.warn(`[MemoryEngine] 加载会话记忆失败 ${sessionId}:`, e);
    }

    return [];
  }

  private saveSessionMemories(sessionId: string, memories: MemoryItem[]): void {
    this.sessionMemories.set(sessionId, memories);
    const file = this.getSessionMemoryFile(sessionId);
    try {
      fs.writeFileSync(file, JSON.stringify(memories, null, 2));
    } catch (e) {
      logger.error(`[MemoryEngine] 保存会话记忆失败 ${sessionId}:`, e);
    }
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ===================== 会话记忆 =====================

  /**
   * 添加会话记忆
   */
  addSessionMemory(
    sessionId: string,
    content: string,
    options: {
      type?: MemoryItem['type'];
      importance?: number;
      tags?: string[];
      metadata?: Record<string, unknown>;
    } = {},
  ): MemoryItem {
    const memories = this.loadSessionMemories(sessionId);

    const item: MemoryItem = {
      id: this.generateId(),
      content,
      type: options.type || 'fact',
      importance: options.importance ?? 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
      tags: options.tags,
      sourceSessionId: sessionId,
      metadata: options.metadata,
    };

    memories.push(item);
    this.saveSessionMemories(sessionId, memories);

    logger.debug(`[MemoryEngine] 会话记忆已添加 ${sessionId}: ${content.slice(0, 50)}...`);
    return item;
  }

  /**
   * 查询会话记忆
   */
  async querySessionMemories(
    sessionId: string,
    options: MemoryQueryOptions = {},
  ): Promise<MemoryItem[]> {
    let memories = this.loadSessionMemories(sessionId);

    const {
      limit = 20,
      minImportance = 0,
      types,
      tags,
      sortBy = 'recency',
      query,
    } = options;

    // 在文本搜索前尝试向量搜索
    if (query && this.vecHostAvailable()) {
      try {
        const results = await this.searchWithVectorHost(query, sessionId, limit);
        if (results.length > 0) return results;
      } catch (e) {
        // 降级到文本搜索
        logger.warn('[memoryEngine] 向量搜索失败，降级到文本搜索', e);
      }
    }

    // 过滤
    if (minImportance > 0) {
      memories = memories.filter(m => m.importance >= minImportance);
    }
    if (types && types.length > 0) {
      memories = memories.filter(m => types.includes(m.type));
    }
    if (tags && tags.length > 0) {
      memories = memories.filter(m => m.tags?.some(t => tags.includes(t)));
    }
    if (query) {
      const lowerQuery = query.toLowerCase();
      memories = memories.filter(m =>
        m.content.toLowerCase().includes(lowerQuery) ||
        m.tags?.some(t => t.toLowerCase().includes(lowerQuery))
      );
    }

    // 排序
    memories.sort((a, b) => {
      switch (sortBy) {
        case 'importance':
          return b.importance - a.importance;
        case 'accessCount':
          return b.accessCount - a.accessCount;
        case 'recency':
        default:
          return new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
      }
    });

    // 更新访问时间
    const result = memories.slice(0, limit);
    for (const item of result) {
      item.lastAccessedAt = new Date().toISOString();
      item.accessCount++;
    }
    if (result.length > 0) {
      this.saveSessionMemories(sessionId, memories);
    }

    return result;
  }

  /**
   * 删除会话记忆
   */
  deleteSessionMemory(sessionId: string, memoryId: string): boolean {
    const memories = this.loadSessionMemories(sessionId);
    const idx = memories.findIndex(m => m.id === memoryId);
    if (idx >= 0) {
      memories.splice(idx, 1);
      this.saveSessionMemories(sessionId, memories);
      return true;
    }
    return false;
  }

  /**
   * 更新会话记忆
   */
  updateSessionMemory(
    sessionId: string,
    memoryId: string,
    updates: Partial<Pick<MemoryItem, 'content' | 'type' | 'importance' | 'tags' | 'metadata'>>,
  ): MemoryItem | null {
    const memories = this.loadSessionMemories(sessionId);
    const item = memories.find(m => m.id === memoryId);
    if (!item) return null;

    Object.assign(item, updates);
    item.updatedAt = new Date().toISOString();
    this.saveSessionMemories(sessionId, memories);
    return item;
  }

  // ===================== 全局记忆 =====================

  /**
   * 添加全局记忆（跨会话）
   */
  addGlobalMemory(
    content: string,
    options: {
      type?: MemoryItem['type'];
      importance?: number;
      tags?: string[];
      sourceSessionId?: string;
      metadata?: Record<string, unknown>;
    } = {},
  ): MemoryItem {
    const item: MemoryItem = {
      id: this.generateId(),
      content,
      type: options.type || 'fact',
      importance: options.importance ?? 7,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
      tags: options.tags,
      sourceSessionId: options.sourceSessionId,
      metadata: options.metadata,
    };

    this.globalMemories.push(item);
    this.saveGlobalMemories();

    logger.debug(`[MemoryEngine] 全局记忆已添加: ${content.slice(0, 50)}...`);
    return item;
  }

  /**
   * 查询全局记忆
   */
  async queryGlobalMemories(options: MemoryQueryOptions = {}): Promise<MemoryItem[]> {
    let memories = [...this.globalMemories];

    const {
      limit = 20,
      minImportance = 0,
      types,
      tags,
      sortBy = 'recency',
      query,
    } = options;

    // 在文本搜索前尝试向量搜索
    if (query && this.vecHostAvailable()) {
      try {
        const results = await this.searchWithVectorHost(query, undefined, limit);
        if (results.length > 0) return results;
      } catch (e) {
        // 降级到文本搜索
        logger.warn('[memoryEngine] 向量搜索失败，降级到文本搜索', e);
      }
    }

    if (minImportance > 0) {
      memories = memories.filter(m => m.importance >= minImportance);
    }
    if (types && types.length > 0) {
      memories = memories.filter(m => types.includes(m.type));
    }
    if (tags && tags.length > 0) {
      memories = memories.filter(m => m.tags?.some(t => tags.includes(t)));
    }
    if (query) {
      const lowerQuery = query.toLowerCase();
      memories = memories.filter(m =>
        m.content.toLowerCase().includes(lowerQuery) ||
        m.tags?.some(t => t.toLowerCase().includes(lowerQuery))
      );
    }

    memories.sort((a, b) => {
      switch (sortBy) {
        case 'importance':
          return b.importance - a.importance;
        case 'accessCount':
          return b.accessCount - a.accessCount;
        case 'recency':
        default:
          return new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
      }
    });

    const result = memories.slice(0, limit);
    for (const item of result) {
      item.lastAccessedAt = new Date().toISOString();
      item.accessCount++;
    }
    if (result.length > 0) {
      this.saveGlobalMemories();
    }

    return result;
  }

  /**
   * 删除全局记忆
   */
  deleteGlobalMemory(memoryId: string): boolean {
    const idx = this.globalMemories.findIndex(m => m.id === memoryId);
    if (idx >= 0) {
      this.globalMemories.splice(idx, 1);
      this.saveGlobalMemories();
      return true;
    }
    return false;
  }

  /**
   * 从会话记忆升级为全局记忆
   */
  promoteToGlobal(sessionId: string, memoryId: string): MemoryItem | null {
    const sessionMemories = this.loadSessionMemories(sessionId);
    const item = sessionMemories.find(m => m.id === memoryId);
    if (!item) return null;

    // 升级重要性
    const globalItem: MemoryItem = {
      ...item,
      id: this.generateId(),
      importance: Math.min(item.importance + 2, 10),
      createdAt: item.createdAt,
      updatedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
    };

    this.globalMemories.push(globalItem);
    this.saveGlobalMemories();

    logger.info(`[MemoryEngine] 记忆已升级为全局: ${item.content.slice(0, 50)}...`);
    return globalItem;
  }

  /**
   * 生成上下文提示（用于注入到系统提示词中）
   */
  async getContextPrompt(
    sessionId: string,
    query?: string,
    options: { globalLimit?: number; sessionLimit?: number } = {},
  ): Promise<string> {
    const { globalLimit = 5, sessionLimit = 5 } = options;

    const globalMems = await this.queryGlobalMemories({
      limit: globalLimit,
      minImportance: 5,
      sortBy: 'importance',
      query,
    });

    const sessionMems = await this.querySessionMemories(sessionId, {
      limit: sessionLimit,
      minImportance: 3,
      sortBy: 'recency',
      query,
    });

    const parts: string[] = [];

    if (globalMems.length > 0) {
      parts.push('## 重要记忆（长期）');
      for (const mem of globalMems) {
        parts.push(`- [${mem.type}] ${mem.content}`);
      }
    }

    if (sessionMems.length > 0) {
      parts.push('\n## 会话记忆（当前会话）');
      for (const mem of sessionMems) {
        parts.push(`- [${mem.type}] ${mem.content}`);
      }
    }

    return parts.length > 0 ? parts.join('\n') : '';
  }

  /**
   * 清理过期记忆
   */
  cleanup(options: { olderThanDays?: number; minImportance?: number } = {}): number {
    const { olderThanDays = 90, minImportance = 3 } = options;
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    let removed = 0;

    // 清理全局记忆中低重要性且长期未访问的
    const beforeGlobal = this.globalMemories.length;
    this.globalMemories = this.globalMemories.filter(m =>
      m.importance >= minImportance ||
      new Date(m.lastAccessedAt).getTime() > cutoffTime
    );
    removed += beforeGlobal - this.globalMemories.length;
    this.saveGlobalMemories();

    // 清理会话记忆
    const sessionsDir = path.join(this.memoryDir, 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir);
      for (const file of files) {
        const sessionId = file.replace('.json', '');
        const memories = this.loadSessionMemories(sessionId);
        const before = memories.length;
        const filtered = memories.filter(m =>
          m.importance >= minImportance ||
          new Date(m.lastAccessedAt).getTime() > cutoffTime
        );
        if (filtered.length !== before) {
          this.saveSessionMemories(sessionId, filtered);
          removed += before - filtered.length;
        }
      }
    }

    if (removed > 0) {
      logger.info(`[MemoryEngine] 清理了 ${removed} 条过期记忆`);
    }

    return removed;
  }

  /**
   * 检查向量记忆主机是否可用
   */
  private vecHostAvailable(): boolean {
    try {
      const registry = getGlobalMemoryHostRegistry();
      return registry.getDefaultHostId() !== null;
    } catch {
      return false;
    }
  }

  /**
   * 使用向量主机进行语义搜索
   */
  private async searchWithVectorHost(
    query: string,
    sessionId: string | undefined,
    limit: number,
  ): Promise<MemoryItem[]> {
    const registry = getGlobalMemoryHostRegistry();
    const host = await registry.getHost();

    const results = await host.search(query, {
      topK: limit || 10,
      filter: sessionId ? { sessionId } : undefined,
    });

    // 转换 MemorySearchResult 到 MemoryItem
    return results.map(r => ({
      id: r.entry.id,
      content: r.entry.content,
      type: (r.entry.metadata?.type as MemoryItem['type']) || 'other',
      importance: Math.round((r.entry.importanceScore || 0) * 10),
      createdAt: new Date(r.entry.createdAt).toISOString(),
      updatedAt: new Date(r.entry.updatedAt).toISOString(),
      lastAccessedAt: new Date(r.entry.lastAccessedAt || Date.now()).toISOString(),
      accessCount: r.entry.accessCount || 0,
      tags: r.entry.metadata?.tags as string[] | undefined,
      sourceSessionId: r.entry.sessionId,
      metadata: r.entry.metadata,
    }));
  }

  /**
   * 销毁记忆引擎
   */
  destroy(): void {
    this.globalMemories = [];
    this.sessionMemories.clear();
    this.initialized = false;
  }
}

/** 全局记忆引擎实例 */
export const memoryEngine = new MemoryEngine();
