/**
 * Context Projection - 上下文投影系统
 *
 * 实现 Thread Bootstrap + Epoch 投影机制，支持多会话上下文复用
 * 参考 OpenClaw 的 Context Projection 架构
 */

import { logger } from '../logger.js';

/** 投影类型 */
export type ProjectionType = 'thread-bootstrap' | 'epoch' | 'full' | 'partial' | 'compact';

/** 投影来源 */
export interface ProjectionSource {
  sessionId: string;
  agentId?: string;
  timestamp: number;
}

/** 投影内容 */
export interface ProjectionContent {
  messages: Array<{ role: string; content: unknown }>;
  metadata?: Record<string, unknown>;
  tokenCount: number;
}

/** 上下文投影 */
export interface ContextProjection {
  id: string;
  type: ProjectionType;
  source: ProjectionSource;
  content: ProjectionContent;
  fingerprint: string;
  epoch: number;
  createdAt: number;
  expiresAt?: number;
  tags: string[];
}

/** 投影构建选项 */
export interface ProjectionBuildOptions {
  type: ProjectionType;
  maxTokens?: number;
  includeSystem?: boolean;
  includeTools?: boolean;
  tags?: string[];
  ttlMs?: number;
}

/** 投影指纹输入 */
export interface ProjectionFingerprintInput {
  messages: Array<{ role: string; content: unknown }>;
  systemPrompt?: string;
  tools?: unknown[];
  agentId?: string;
  modelId?: string;
}

/** 投影比较结果 */
export interface ProjectionComparison {
  areIdentical: boolean;
  messageCountDiff: number;
  tokenCountDiff: number;
  commonMessages: number;
  addedMessages: number;
  removedMessages: number;
  epochDiff: number;
}

/** 投影合并选项 */
export interface ProjectionMergeOptions {
  strategy: 'newest' | 'union' | 'intersection' | 'longest';
  resolveConflicts?: 'left' | 'right' | 'newest' | 'longest';
  maxTokens?: number;
}

/** 投影差异 */
export interface ProjectionDiff {
  added: Array<{ role: string; content: unknown }>;
  removed: Array<{ role: string; content: unknown }>;
  modified: Array<{ before: unknown; after: unknown }>;
}

/** MMR 重排序结果 */
export interface MMRRerankResult<T> {
  items: T[];
  diversityScores: number[];
  relevanceScores: number[];
  finalScores: number[];
}

/** LRU 缓存项 */
interface LRUCacheItem<T> {
  key: string;
  value: T;
  timestamp: number;
}

/**
 * 计算投影指纹
 *
 * 使用内容哈希生成稳定的指纹，用于缓存和去重
 */
export function computeProjectionFingerprint(input: ProjectionFingerprintInput): string {
  const normalized = {
    messages: input.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
    systemPrompt: input.systemPrompt ?? '',
    tools: input.tools ?? [],
    agentId: input.agentId ?? '',
    modelId: input.modelId ?? '',
  };

  // 简单哈希：使用 JSON.stringify + 字符编码
  const json = JSON.stringify(normalized);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }

  return `proj_${Math.abs(hash).toString(16)}_${input.messages.length}`;
}

/**
 * LRU 缓存实现
 */
class LRUCache<T> {
  private items: Map<string, LRUCacheItem<T>> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const item = this.items.get(key);
    if (!item) return undefined;

    // 更新访问时间
    item.timestamp = Date.now();
    return item.value;
  }

  set(key: string, value: T): void {
    // 超出容量时淘汰最旧的
    if (this.items.size >= this.maxSize && !this.items.has(key)) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [k, v] of this.items) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        this.items.delete(oldestKey);
      }
    }

    this.items.set(key, {
      key,
      value,
      timestamp: Date.now(),
    });
  }

  has(key: string): boolean {
    return this.items.has(key);
  }

  delete(key: string): boolean {
    return this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }

  size(): number {
    return this.items.size;
  }

  keys(): string[] {
    return Array.from(this.items.keys());
  }
}

/**
 * Epoch 管理器
 *
 * 管理上下文的不同时代版本
 */
export class EpochManager {
  private epochs: Map<string, number> = new Map();
  private epochProjections: Map<string, Map<number, ContextProjection>> = new Map();

  /**
   * 获取当前 epoch
   */
  getCurrentEpoch(sessionId: string): number {
    return this.epochs.get(sessionId) ?? 1;
  }

  /**
   * 递增 epoch
   */
  incrementEpoch(sessionId: string): number {
    const next = (this.epochs.get(sessionId) ?? 1) + 1;
    this.epochs.set(sessionId, next);
    logger.debug(`[EpochManager] Session ${sessionId} epoch incremented to ${next}`);
    return next;
  }

  /**
   * 重置 epoch
   */
  resetEpoch(sessionId: string): void {
    this.epochs.set(sessionId, 0);
    this.epochProjections.delete(sessionId);
    logger.debug(`[EpochManager] Session ${sessionId} epoch reset`);
  }

  /**
   * 保存 epoch 投影
   */
  saveProjection(sessionId: string, projection: ContextProjection): void {
    let sessionProjections = this.epochProjections.get(sessionId);
    if (!sessionProjections) {
      sessionProjections = new Map();
      this.epochProjections.set(sessionId, sessionProjections);
    }
    sessionProjections.set(projection.epoch, projection);
  }

  /**
   * 获取指定 epoch 的投影
   */
  getProjection(sessionId: string, epoch: number): ContextProjection | null {
    return this.epochProjections.get(sessionId)?.get(epoch) ?? null;
  }

  /**
   * 获取最新投影
   */
  getLatestProjection(sessionId: string): ContextProjection | null {
    const sessionProjections = this.epochProjections.get(sessionId);
    if (!sessionProjections || sessionProjections.size === 0) return null;

    const epochs = Array.from(sessionProjections.keys()).sort((a, b) => b - a);
    return sessionProjections.get(epochs[0]) ?? null;
  }

  /**
   * 获取所有 epoch 列表
   */
  listEpochs(sessionId: string): number[] {
    const sessionProjections = this.epochProjections.get(sessionId);
    if (!sessionProjections) return [];
    return Array.from(sessionProjections.keys()).sort((a, b) => a - b);
  }

  /**
   * 清理会话数据
   */
  cleanupSession(sessionId: string): void {
    this.epochs.delete(sessionId);
    this.epochProjections.delete(sessionId);
  }
}

/**
 * 上下文投影管理器
 */
export class ContextProjectionManager {
  private projections: Map<string, ContextProjection> = new Map();
  private fingerprintCache: LRUCache<ContextProjection>;
  private epochManager: EpochManager;
  private _maxProjections: number;

  constructor(maxProjections: number = 100) {
    this._maxProjections = maxProjections;
    this.fingerprintCache = new LRUCache<ContextProjection>(maxProjections);
    this.epochManager = new EpochManager();
  }

  get size(): number {
    return this.projections.size;
  }

  get maxProjections(): number {
    return this._maxProjections;
  }

  /**
   * 构建投影
   */
  buildProjection(
    sessionId: string,
    messages: Array<{ role: string; content: unknown }>,
    options: ProjectionBuildOptions,
  ): ContextProjection {
    const {
      type,
      maxTokens,
      includeSystem = true,
      tags = [],
      ttlMs,
    } = options;

    // 合并 tags，type 作为默认 tag
    const mergedTags = [type, ...tags.filter(t => t !== type)];

    // 过滤消息
    let filtered = messages;
    if (!includeSystem) {
      filtered = messages.filter(m => m.role !== 'system');
    }

    // 计算 token
    let tokenCount = 0;
    for (const msg of filtered) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
      tokenCount += Math.ceil(content.length / 4);
    }

    // 截断到 maxTokens（从尾部截断，保留最新消息）
    let projectionMessages = filtered;
    if (maxTokens && tokenCount > maxTokens) {
      let keptTokens = 0;
      let keptCount = 0;
      for (let i = filtered.length - 1; i >= 0; i--) {
        const msg = filtered[i];
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
        const msgTokens = Math.ceil(content.length / 4);
        if (keptTokens + msgTokens > maxTokens && keptCount > 0) break;
        if (keptCount === 0) {
          keptTokens = msgTokens;
          keptCount = 1;
        } else {
          keptTokens += msgTokens;
          keptCount++;
        }
      }
      projectionMessages = filtered.slice(-keptCount);
      tokenCount = keptTokens;
    }

    // 计算指纹
    const fingerprint = computeProjectionFingerprint({
      messages: projectionMessages,
    });

    // 创建新投影
    const now = Date.now();
    const projection: ContextProjection = {
      id: `proj_${now}_${Math.random().toString(36).slice(2, 10)}`,
      type,
      source: {
        sessionId,
        timestamp: now,
      },
      content: {
        messages: projectionMessages,
        tokenCount,
      },
      fingerprint,
      epoch: this.epochManager.getCurrentEpoch(sessionId),
      createdAt: now,
      expiresAt: ttlMs ? now + ttlMs : undefined,
      tags: mergedTags,
    };

    return projection;
  }

  /**
   * 添加投影
   */
  addProjection(projection: ContextProjection): void {
    // 检查是否已存在相同指纹的投影
    const existing = this.fingerprintCache.get(projection.fingerprint);
    if (existing && existing.id !== projection.id) {
      projection.epoch = existing.epoch + 1;
    }

    // 超出容量时淘汰最旧的
    if (this.projections.size >= this._maxProjections && !this.projections.has(projection.id)) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;

      for (const [id, proj] of this.projections) {
        if (proj.createdAt < oldestTime) {
          oldestTime = proj.createdAt;
          oldestId = id;
        }
      }

      if (oldestId) {
        const oldProj = this.projections.get(oldestId);
        this.projections.delete(oldestId);
        if (oldProj) {
          this.fingerprintCache.delete(oldProj.fingerprint);
        }
      }
    }

    this.projections.set(projection.id, projection);
    this.fingerprintCache.set(projection.fingerprint, projection);
    this.epochManager.saveProjection(projection.source.sessionId, projection);
  }

  /**
   * 构建 thread-bootstrap 投影
   *
   * 用于新线程初始化时的上下文引导
   */
  buildThreadBootstrap(
    sourceSessionId: string,
    messages: Array<{ role: string; content: unknown }>,
    options: Omit<ProjectionBuildOptions, 'type'> = {},
  ): ContextProjection {
    return this.buildProjection(sourceSessionId, messages, {
      ...options,
      type: 'thread-bootstrap',
      tags: ['bootstrap', ...(options.tags ?? [])],
    });
  }

  /**
   * 构建 epoch 投影
   *
   * 在关键时间点保存上下文快照
   */
  buildEpochProjection(
    sessionId: string,
    messages: Array<{ role: string; content: unknown }>,
    options: Omit<ProjectionBuildOptions, 'type'> = {},
  ): ContextProjection {
    const epoch = this.epochManager.incrementEpoch(sessionId);
    const projection = this.buildProjection(sessionId, messages, {
      ...options,
      type: 'epoch',
      tags: [`epoch-${epoch}`, ...(options.tags ?? [])],
    });
    return projection;
  }

  /**
   * 获取投影
   */
  getProjection(projectionId: string): ContextProjection | null {
    const projection = this.projections.get(projectionId);
    if (!projection) return null;

    // 检查是否过期
    if (projection.expiresAt && projection.expiresAt < Date.now()) {
      this.projections.delete(projectionId);
      return null;
    }

    return projection;
  }

  /**
   * 通过指纹查找投影
   */
  findByFingerprint(fingerprint: string, sessionId?: string, type?: ProjectionType): ContextProjection | null {
    const proj = this.fingerprintCache.get(fingerprint);
    if (!proj) return null;
    if (sessionId && proj.source.sessionId !== sessionId) return null;
    if (type && proj.type !== type) return null;
    // 检查是否过期
    if (proj.expiresAt && proj.expiresAt < Date.now()) {
      this.projections.delete(proj.id);
      this.fingerprintCache.delete(fingerprint);
      return null;
    }
    return proj;
  }

  /**
   * 获取会话的所有投影
   */
  listBySession(sessionId: string): ContextProjection[] {
    const results: ContextProjection[] = [];
    for (const proj of this.projections.values()) {
      if (proj.source.sessionId === sessionId) {
        if (proj.expiresAt && proj.expiresAt < Date.now()) continue;
        results.push(proj);
      }
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 删除投影
   */
  delete(projectionId: string): boolean {
    const proj = this.projections.get(projectionId);
    if (!proj) return false;
    this.projections.delete(projectionId);
    this.fingerprintCache.delete(proj.fingerprint);
    return true;
  }

  /**
   * 清除过期投影
   */
  cleanupExpired(): number {
    let count = 0;
    const now = Date.now();
    for (const [id, proj] of this.projections) {
      if (proj.expiresAt && proj.expiresAt < now) {
        this.projections.delete(id);
        count++;
      }
    }
    if (count > 0) {
      logger.debug(`[ContextProjection] Cleaned up ${count} expired projections`);
    }
    return count;
  }

  /**
   * 获取 epoch 管理器
   */
  getEpochManager(): EpochManager {
    return this.epochManager;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalProjections: number;
    sessionsWithProjections: number;
    maxProjections: number;
  } {
    const sessions = new Set<string>();
    for (const proj of this.projections.values()) {
      sessions.add(proj.source.sessionId);
    }
    return {
      totalProjections: this.projections.size,
      sessionsWithProjections: sessions.size,
      maxProjections: this._maxProjections,
    };
  }

  /**
   * 清空所有投影
   */
  clear(): void {
    this.projections.clear();
    this.fingerprintCache.clear();
    logger.debug('[ContextProjection] All projections cleared');
  }
}

/** 全局投影管理器实例 */
let globalProjectionManager: ContextProjectionManager | null = null;

/**
 * 获取全局投影管理器
 */
export function getGlobalProjectionManager(): ContextProjectionManager {
  if (!globalProjectionManager) {
    globalProjectionManager = new ContextProjectionManager();
  }
  return globalProjectionManager;
}

/**
 * 设置全局投影管理器
 */
export function setGlobalProjectionManager(manager: ContextProjectionManager): void {
  globalProjectionManager = manager;
}

/**
 * 创建投影管理器
 */
export function createProjectionManager(maxProjections?: number): ContextProjectionManager {
  return new ContextProjectionManager(maxProjections);
}

// ===================== 投影实用函数 =====================

/**
 * 比较两个投影
 */
export function compareProjections(
  a: ContextProjection,
  b: ContextProjection,
): ProjectionComparison {
  const aContents = new Set(
    a.content.messages.map(m => `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`),
  );
  const bContents = new Set(
    b.content.messages.map(m => `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`),
  );

  let commonCount = 0;
  let addedCount = 0;
  let removedCount = 0;

  for (const content of aContents) {
    if (bContents.has(content)) {
      commonCount++;
    } else {
      removedCount++;
    }
  }

  for (const content of bContents) {
    if (!aContents.has(content)) {
      addedCount++;
    }
  }

  return {
    areIdentical: addedCount === 0 && removedCount === 0,
    messageCountDiff: b.content.messages.length - a.content.messages.length,
    tokenCountDiff: b.content.tokenCount - a.content.tokenCount,
    commonMessages: commonCount,
    addedMessages: addedCount,
    removedMessages: removedCount,
    epochDiff: b.epoch - a.epoch,
  };
}

/**
 * MMR (Maximum Marginal Relevance) 重排序
 *
 * 在保持相关性的同时增加结果多样性
 */
export function mmrRerank<T extends { content: unknown }>(
  items: T[],
  queryEmbedding: number[],
  getEmbedding: (item: T) => number[],
  options: {
    lambda?: number;
    k?: number;
  } = {},
): MMRRerankResult<T> {
  const { lambda = 0.5, k = items.length } = options;
  const results: T[] = [];
  const selectedEmbeddings: number[][] = [];
  const diversityScores: number[] = [];
  const relevanceScores: number[] = [];
  const finalScores: number[] = [];

  // 计算所有相关性分数
  const relevanceMap = new Map<number, number>();
  for (let i = 0; i < items.length; i++) {
    const embedding = getEmbedding(items[i]);
    const relevance = cosineSimilarity(queryEmbedding, embedding);
    relevanceMap.set(i, relevance);
  }

  // MMR 选择
  for (let i = 0; i < Math.min(k, items.length); i++) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let j = 0; j < items.length; j++) {
      if (results.includes(items[j])) continue;

      const relevance = relevanceMap.get(j) ?? 0;
      let diversity = 1;
      if (selectedEmbeddings.length > 0) {
        const avgSim = selectedEmbeddings.reduce((sum, sel) => {
          return sum + cosineSimilarity(getEmbedding(items[j]), sel);
        }, 0) / selectedEmbeddings.length;
        diversity = 1 - avgSim;
      }

      const score = lambda * relevance + (1 - lambda) * diversity;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = j;
      }
    }

    if (bestIdx !== -1) {
      results.push(items[bestIdx]);
      selectedEmbeddings.push(getEmbedding(items[bestIdx]));
      const relevance = relevanceMap.get(bestIdx) ?? 0;
      relevanceScores.push(relevance);
      diversityScores.push(1 - relevance);
      finalScores.push(bestScore);
    }
  }

  return { items: results, diversityScores, relevanceScores, finalScores };
}

/**
 * 计算余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 合并多个投影
 */
export function mergeProjections(
  projections: ContextProjection[],
  options: ProjectionMergeOptions,
): ContextProjection {
  if (projections.length === 0) {
    throw new Error('No projections to merge');
  }

  if (projections.length === 1 && !options.maxTokens) {
    return projections[0];
  }

  const { strategy, maxTokens } = options;

  // 按时间排序（降序，最新的在前），如果时间相同则按原始数组顺序（后面的更新）
  const projWithIndex = projections.map((p, i) => ({ proj: p, index: i }));
  const sorted = projWithIndex
    .sort((a, b) => {
      const timeDiff = b.proj.createdAt - a.proj.createdAt;
      if (timeDiff !== 0) return timeDiff;
      return b.index - a.index;
    })
    .map(item => item.proj);

  let mergedMessages: Array<{ role: string; content: unknown }> = [];

  switch (strategy) {
    case 'newest':
      // 使用最新的投影
      mergedMessages = sorted[0].content.messages;
      break;

    case 'union': {
      // 合并所有消息
      const seen = new Set<string>();
      for (const proj of sorted) {
        for (const msg of proj.content.messages) {
          const key = `${msg.role}:${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`;
          if (!seen.has(key)) {
            seen.add(key);
            mergedMessages.push(msg);
          }
        }
      }
      break;
    }

    case 'intersection': {
      // 保留所有投影共有的消息
      const firstSet = new Set(
        sorted[0].content.messages.map(m => `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`),
      );
      for (const proj of sorted.slice(1)) {
        const projSet = new Set(
          proj.content.messages.map(m => `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`),
        );
        for (const key of firstSet) {
          if (!projSet.has(key)) {
            firstSet.delete(key);
          }
        }
      }
      mergedMessages = sorted[0].content.messages.filter(m => {
        const key = `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`;
        return firstSet.has(key);
      });
      break;
    }

    case 'longest':
      // 使用最长的投影
      mergedMessages = sorted.reduce((longest, curr) =>
        curr.content.tokenCount > longest.content.tokenCount ? curr : longest,
      ).content.messages;
      break;
  }

  // 截断到 maxTokens（从尾部截断，保留最新消息）
  if (maxTokens) {
    let keptTokens = 0;
    let keptCount = 0;
    for (let i = mergedMessages.length - 1; i >= 0; i--) {
      const msg = mergedMessages[i];
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const msgTokens = Math.ceil(content.length / 4);
      if (keptTokens + msgTokens > maxTokens && keptCount > 0) break;
      if (keptCount === 0) {
        keptTokens = msgTokens;
        keptCount = 1;
      } else {
        keptTokens += msgTokens;
        keptCount++;
      }
    }
    mergedMessages = mergedMessages.slice(-keptCount);
  }

  const totalTokens = mergedMessages.reduce((sum, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return sum + Math.ceil(content.length / 4);
  }, 0);

  return {
    id: `merged_${Date.now()}`,
    type: 'full',
    source: {
      sessionId: sorted[0].source.sessionId,
      agentId: sorted[0].source.agentId,
      timestamp: Date.now(),
    },
    content: {
      messages: mergedMessages,
      tokenCount: totalTokens,
    },
    fingerprint: computeProjectionFingerprint({ messages: mergedMessages }),
    epoch: Math.max(...projections.map(p => p.epoch)) + 1,
    createdAt: Date.now(),
    tags: ['merged'],
  };
}

/**
 * 计算两个投影的差异
 */
export function computeProjectionDiff(
  before: ContextProjection,
  after: ContextProjection,
): ProjectionDiff {
  const beforeMap = new Map(
    before.content.messages.map(m => [
      `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`,
      m,
    ]),
  );

  const afterMap = new Map(
    after.content.messages.map(m => [
      `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`,
      m,
    ]),
  );

  const added: Array<{ role: string; content: unknown }> = [];
  const removed: Array<{ role: string; content: unknown }> = [];
  const modified: Array<{ before: unknown; after: unknown }> = [];

  for (const [key, msg] of afterMap) {
    if (!beforeMap.has(key)) {
      added.push(msg);
    }
  }

  for (const [key, msg] of beforeMap) {
    if (!afterMap.has(key)) {
      removed.push(msg);
    }
  }

  return { added, removed, modified };
}
