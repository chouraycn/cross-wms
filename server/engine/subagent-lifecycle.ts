/**
 * @deprecated v9.1 — 本文件为休眠原型，已被 `agentOrchestrator.spawnSubAgent` + `agentRegistry`
 * 的运行时实例表取代。请勿在新代码中引用，后续版本将移除。
 *
 * Subagent Lifecycle - 子代理生命周期管理
 *
 * 管理子代理的上下文创建、复用和清理
 * 参考 OpenClaw 的 Subagent Lifecycle 架构
 */

import { logger } from '../logger.js';

// v9.1: 废弃警告（仅打印一次）
logger.warn('[deprecated] subagent-lifecycle 已废弃，请改用 AgentOrchestrator.spawnSubAgent + AgentRegistry 运行时实例表');


/** 子代理模式 */
export type SubagentMode = 'fork' | 'isolated';

/** 子代理状态 */
export type SubagentStatus = 'active' | 'completed' | 'failed' | 'expired';

/** 子代理信息 */
export interface SubagentInfo {
  id: string;
  name: string;
  mode: SubagentMode;
  status: SubagentStatus;
  parentSessionId: string;
  sessionId: string;
  createdAt: number;
  lastActiveAt: number;
  completedAt?: number;
  expiresAt?: number;
  ttlMs?: number;
  toolCount: number;
  messageCount: number;
  result?: unknown;
  error?: Error;
  metadata?: Record<string, unknown>;
}

/** 子代理创建选项 */
export interface SubagentCreateOptions {
  name?: string;
  mode: SubagentMode;
  parentSessionId: string;
  ttlMs?: number;
  initialMessages?: Array<{ role: string; content: unknown }>;
  metadata?: Record<string, unknown>;
}

/** 子代理生命周期事件 */
export type SubagentLifecycleEvent =
  | { type: 'created'; subagent: SubagentInfo }
  | { type: 'activated'; subagent: SubagentInfo }
  | { type: 'completed'; subagent: SubagentInfo; result?: unknown }
  | { type: 'failed'; subagent: SubagentInfo; error: Error }
  | { type: 'expired'; subagent: SubagentInfo }
  | { type: 'disposed'; subagent: SubagentInfo };

/** 子代理生命周期监听器 */
export type SubagentLifecycleListener = (event: SubagentLifecycleEvent) => void;

/**
 * 生成子代理 ID
 */
function generateSubagentId(): string {
  return `subagent_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 子代理生命周期管理器
 */
export class SubagentLifecycleManager {
  private subagents: Map<string, SubagentInfo> = new Map();
  private parentToChildren: Map<string, Set<string>> = new Map();
  private listeners: Set<SubagentLifecycleListener> = new Set();
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 30 * 60 * 1000) {
    this.defaultTtlMs = defaultTtlMs;
    this.startCleanupLoop();
  }

  /**
   * 创建子代理
   */
  createSubagent(options: SubagentCreateOptions): SubagentInfo {
    const id = generateSubagentId();
    const now = Date.now();
    const ttlMs = options.ttlMs ?? this.defaultTtlMs;

    const subagent: SubagentInfo = {
      id,
      name: options.name ?? `Subagent ${id.slice(-8)}`,
      mode: options.mode,
      status: 'active',
      parentSessionId: options.parentSessionId,
      sessionId: `${options.parentSessionId}_${id}`,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + ttlMs,
      ttlMs,
      toolCount: 0,
      messageCount: options.initialMessages?.length ?? 0,
      metadata: options.metadata,
    };

    this.subagents.set(id, subagent);

    // 维护父子关系
    let children = this.parentToChildren.get(options.parentSessionId);
    if (!children) {
      children = new Set();
      this.parentToChildren.set(options.parentSessionId, children);
    }
    children.add(id);

    this.emit({ type: 'created', subagent });
    logger.info(
      `[SubagentLifecycle] Created subagent ${id} ` +
      `(${options.mode}) for parent ${options.parentSessionId}`,
    );

    return subagent;
  }

  /**
   * 获取子代理信息
   */
  getSubagent(subagentId: string): SubagentInfo | null {
    const subagent = this.subagents.get(subagentId);
    if (!subagent) return null;

    // 检查是否过期
    if (this.isExpired(subagent)) {
      this.handleExpiration(subagent);
      return null;
    }

    return subagent;
  }

  /**
   * 更新子代理活跃时间
   */
  touch(subagentId: string): boolean {
    const subagent = this.subagents.get(subagentId);
    if (!subagent) return false;

    subagent.lastActiveAt = Date.now();
    if (subagent.ttlMs) {
      subagent.expiresAt = subagent.lastActiveAt + subagent.ttlMs;
    }

    this.emit({ type: 'activated', subagent });
    return true;
  }

  /**
   * 更新子代理消息计数
   */
  incrementMessageCount(subagentId: string, count: number = 1): boolean {
    const subagent = this.subagents.get(subagentId);
    if (!subagent) return false;

    subagent.messageCount += count;
    this.touch(subagentId);
    return true;
  }

  /**
   * 标记子代理完成
   */
  complete(subagentId: string, result?: unknown): boolean {
    const subagent = this.subagents.get(subagentId);
    if (!subagent) return false;

    const now = Date.now();
    subagent.status = 'completed';
    subagent.lastActiveAt = now;
    subagent.completedAt = now;
    subagent.result = result;

    this.emit({ type: 'completed', subagent, result });
    logger.debug(`[SubagentLifecycle] Subagent ${subagentId} completed`);

    return true;
  }

  /**
   * 标记子代理失败
   */
  fail(subagentId: string, error: Error): boolean {
    const subagent = this.subagents.get(subagentId);
    if (!subagent) return false;

    const now = Date.now();
    subagent.status = 'failed';
    subagent.lastActiveAt = now;
    subagent.completedAt = now;
    subagent.error = error;

    this.emit({ type: 'failed', subagent, error });
    logger.warn(
      `[SubagentLifecycle] Subagent ${subagentId} failed: ${error.message}`,
    );

    return true;
  }

  /**
   * 销毁子代理
   */
  dispose(subagentId: string): boolean {
    const subagent = this.subagents.get(subagentId);
    if (!subagent) return false;

    // 从父映射中移除
    const children = this.parentToChildren.get(subagent.parentSessionId);
    if (children) {
      children.delete(subagentId);
      if (children.size === 0) {
        this.parentToChildren.delete(subagent.parentSessionId);
      }
    }

    this.subagents.delete(subagentId);
    this.emit({ type: 'disposed', subagent });
    logger.debug(`[SubagentLifecycle] Subagent ${subagentId} disposed`);

    return true;
  }

  /**
   * 获取父会话的所有子代理
   */
  getChildSubagents(parentSessionId: string): SubagentInfo[] {
    const childIds = this.parentToChildren.get(parentSessionId);
    if (!childIds) return [];

    const results: SubagentInfo[] = [];
    for (const id of childIds) {
      const subagent = this.subagents.get(id);
      if (subagent && !this.isExpired(subagent)) {
        results.push(subagent);
      }
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 获取活跃子代理数量
   */
  getActiveCount(): number {
    let count = 0;
    for (const subagent of this.subagents.values()) {
      if (subagent.status === 'active' && !this.isExpired(subagent)) {
        count++;
      }
    }
    return count;
  }

  /**
   * 添加生命周期监听器
   */
  addListener(listener: SubagentLifecycleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private listenerMap: Map<SubagentLifecycleListener, Map<SubagentLifecycleEvent['type'], SubagentLifecycleListener>> = new Map();

  /**
   * 监听事件（on 别名）
   */
  on(eventType: SubagentLifecycleEvent['type'], listener: SubagentLifecycleListener): () => void {
    const wrapped: SubagentLifecycleListener = (event) => {
      if (event.type === eventType) {
        listener(event);
      }
    };

    if (!this.listenerMap.has(listener)) {
      this.listenerMap.set(listener, new Map());
    }
    this.listenerMap.get(listener)!.set(eventType, wrapped);
    this.listeners.add(wrapped);

    return () => this.off(eventType, listener);
  }

  /**
   * 移除事件监听器
   */
  off(eventType: SubagentLifecycleEvent['type'], listener: SubagentLifecycleListener): void {
    const typeMap = this.listenerMap.get(listener);
    if (typeMap) {
      const wrapped = typeMap.get(eventType);
      if (wrapped) {
        this.listeners.delete(wrapped);
        typeMap.delete(eventType);
        if (typeMap.size === 0) {
          this.listenerMap.delete(listener);
        }
      }
    }
  }

  /**
   * 清理过期子代理
   */
  cleanupExpired(): number {
    let count = 0;

    for (const [_id, subagent] of this.subagents) {
      if (this.isExpired(subagent)) {
        this.handleExpiration(subagent);
        count++;
      }
    }

    return count;
  }

  /**
   * 检查子代理是否过期
   */
  private isExpired(subagent: SubagentInfo): boolean {
    if (subagent.status !== 'active') return false;
    if (!subagent.expiresAt) return false;
    return subagent.expiresAt < Date.now();
  }

  /**
   * 处理过期
   */
  private handleExpiration(subagent: SubagentInfo): void {
    subagent.status = 'expired';
    this.emit({ type: 'expired', subagent });
    logger.debug(`[SubagentLifecycle] Subagent ${subagent.id} expired`);
    this.dispose(subagent.id);
  }

  /**
   * 发射事件
   */
  private emit(event: SubagentLifecycleEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error(
          '[SubagentLifecycle] Listener error:',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  /**
   * 启动清理循环
   */
  private startCleanupLoop(): void {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpired();
    }, 60 * 1000); // 每分钟清理一次

    // 防止 Node.js 进程无法退出
    if (typeof this.cleanupIntervalId.unref === 'function') {
      this.cleanupIntervalId.unref();
    }
  }

  /**
   * 停止清理循环
   */
  stopCleanupLoop(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalSubagents: number;
    activeCount: number;
    completedCount: number;
    failedCount: number;
    expiredCount: number;
    parentSessionCount: number;
  } {
    let activeCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let expiredCount = 0;

    for (const subagent of this.subagents.values()) {
      switch (subagent.status) {
        case 'active':
          if (this.isExpired(subagent)) {
            expiredCount++;
          } else {
            activeCount++;
          }
          break;
        case 'completed':
          completedCount++;
          break;
        case 'failed':
          failedCount++;
          break;
        case 'expired':
          expiredCount++;
          break;
      }
    }

    return {
      totalSubagents: this.subagents.size,
      activeCount,
      completedCount,
      failedCount,
      expiredCount,
      parentSessionCount: this.parentToChildren.size,
    };
  }

  /**
   * 清空所有子代理
   */
  clear(): void {
    this.subagents.clear();
    this.parentToChildren.clear();
    this.listeners.clear();
    logger.debug('[SubagentLifecycle] All subagents cleared');
  }
}

/** 全局子代理管理器实例 */
let globalSubagentManager: SubagentLifecycleManager | null = null;

/**
 * 获取全局子代理管理器
 */
export function getGlobalSubagentLifecycleManager(): SubagentLifecycleManager {
  if (!globalSubagentManager) {
    globalSubagentManager = new SubagentLifecycleManager();
  }
  return globalSubagentManager;
}

/**
 * 设置全局子代理管理器
 */
export function setGlobalSubagentLifecycleManager(manager: SubagentLifecycleManager): void {
  globalSubagentManager = manager;
}

/**
 * 创建子代理管理器
 */
export function createSubagentLifecycleManager(defaultTtlMs?: number): SubagentLifecycleManager {
  return new SubagentLifecycleManager(defaultTtlMs);
}
