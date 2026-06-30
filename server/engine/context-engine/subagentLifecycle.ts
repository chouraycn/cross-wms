import { logger } from '../../logger.js';
import type {
  SubagentSpawnPreparation,
  SubagentEndReason,
  AgentMessage,
} from './types.js';

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000;

export type SubagentContextMode = 'isolated' | 'fork';

export interface SubagentSessionInfo {
  childSessionKey: string;
  parentSessionKey: string;
  childSessionId?: string;
  parentSessionId?: string;
  childSessionFile?: string;
  parentSessionFile?: string;
  contextMode: SubagentContextMode;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  ttlMs: number;
  isActive: boolean;
  endReason?: SubagentEndReason;
  endedAt?: number;
  forkedMessageCount?: number;
  rollbackActions: Array<() => void | Promise<void>>;
}

export interface SubagentLifecycleCallbacks {
  onPrepare?: (info: SubagentSessionInfo) => void | Promise<void>;
  onEnd?: (info: SubagentSessionInfo, reason: SubagentEndReason) => void | Promise<void>;
  onRollback?: (info: SubagentSessionInfo, error?: Error) => void | Promise<void>;
}

export interface SubagentLifecycleManagerOptions {
  defaultTtlMs?: number;
  cleanupIntervalMs?: number;
  callbacks?: SubagentLifecycleCallbacks;
  forkContext?: (params: {
    parentSessionKey: string;
    childSessionKey: string;
    parentSessionId?: string;
    childSessionId?: string;
    parentSessionFile?: string;
    childSessionFile?: string;
  }) => Promise<{ messages: AgentMessage[]; rollback: () => void | Promise<void> }>;
  createIsolatedContext?: (params: {
    childSessionKey: string;
    childSessionId?: string;
    childSessionFile?: string;
  }) => Promise<{ rollback: () => void | Promise<void> }>;
  syncForkedContextBack?: (params: {
    parentSessionKey: string;
    childSessionKey: string;
    parentSessionId?: string;
    childSessionId?: string;
    parentSessionFile?: string;
    childSessionFile?: string;
  }) => Promise<void>;
}

export class SubagentLifecycleManager {
  private sessions: Map<string, SubagentSessionInfo> = new Map();
  private defaultTtlMs: number;
  private cleanupIntervalMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: SubagentLifecycleCallbacks;
  private forkContext?: SubagentLifecycleManagerOptions['forkContext'];
  private createIsolatedContext?: SubagentLifecycleManagerOptions['createIsolatedContext'];
  private syncForkedContextBack?: SubagentLifecycleManagerOptions['syncForkedContextBack'];

  constructor(options: SubagentLifecycleManagerOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.callbacks = options.callbacks ?? {};
    this.forkContext = options.forkContext;
    this.createIsolatedContext = options.createIsolatedContext;
    this.syncForkedContextBack = options.syncForkedContextBack;

    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupIntervalMs);

    logger.debug(
      `[SubagentLifecycleManager] TTL 清理定时器已启动，间隔: ${this.cleanupIntervalMs}ms`
    );
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.debug('[SubagentLifecycleManager] TTL 清理定时器已停止');
    }
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, session] of this.sessions) {
      if (session.isActive && now >= session.expiresAt) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length === 0) return;

    logger.debug(
      `[SubagentLifecycleManager] 发现 ${expiredKeys.length} 个过期会话，开始清理`
    );

    for (const key of expiredKeys) {
      this.onSubagentEnded({
        childSessionKey: key,
        reason: 'swept',
      }).catch((err) => {
        logger.error(
          `[SubagentLifecycleManager] 清理过期会话失败 (${key}):`,
          err instanceof Error ? err.message : String(err)
        );
      });
    }
  }

  async prepareSubagentSpawn(params: {
    parentSessionKey: string;
    childSessionKey: string;
    contextMode?: SubagentContextMode;
    parentSessionId?: string;
    parentSessionFile?: string;
    childSessionId?: string;
    childSessionFile?: string;
    ttlMs?: number;
  }): Promise<SubagentSpawnPreparation | undefined> {
    const {
      parentSessionKey,
      childSessionKey,
      contextMode = 'isolated',
      parentSessionId,
      parentSessionFile,
      childSessionId,
      childSessionFile,
      ttlMs = this.defaultTtlMs,
    } = params;

    if (this.sessions.has(childSessionKey)) {
      logger.warn(
        `[SubagentLifecycleManager] 子代理会话已存在: ${childSessionKey}，跳过准备`
      );
      return undefined;
    }

    const now = Date.now();
    const sessionInfo: SubagentSessionInfo = {
      childSessionKey,
      parentSessionKey,
      childSessionId,
      parentSessionId,
      childSessionFile,
      parentSessionFile,
      contextMode,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + ttlMs,
      ttlMs,
      isActive: true,
      rollbackActions: [],
    };

    try {
      if (contextMode === 'fork') {
        if (this.forkContext) {
          const forkResult = await this.forkContext({
            parentSessionKey,
            childSessionKey,
            parentSessionId,
            childSessionId,
            parentSessionFile,
            childSessionFile,
          });
          sessionInfo.forkedMessageCount = forkResult.messages.length;
          sessionInfo.rollbackActions.push(forkResult.rollback);
        }
      } else {
        if (this.createIsolatedContext) {
          const isolatedResult = await this.createIsolatedContext({
            childSessionKey,
            childSessionId,
            childSessionFile,
          });
          sessionInfo.rollbackActions.push(isolatedResult.rollback);
        }
      }

      this.sessions.set(childSessionKey, sessionInfo);

      if (this.callbacks.onPrepare) {
        try {
          await this.callbacks.onPrepare(sessionInfo);
        } catch (callbackErr) {
          logger.warn(
            `[SubagentLifecycleManager] onPrepare 回调执行失败:`,
            callbackErr instanceof Error ? callbackErr.message : String(callbackErr)
          );
        }
      }

      logger.debug(
        `[SubagentLifecycleManager] 子代理会话准备完成: ${childSessionKey} ` +
        `(mode=${contextMode}, ttl=${ttlMs}ms)`
      );

      return {
        rollback: async () => {
          await this.rollback(childSessionKey);
        },
      };
    } catch (err) {
      logger.error(
        `[SubagentLifecycleManager] 子代理会话准备失败: ${childSessionKey}`,
        err instanceof Error ? err.message : String(err)
      );

      await this.executeRollback(sessionInfo, err instanceof Error ? err : undefined);

      return undefined;
    }
  }

  private async executeRollback(
    sessionInfo: SubagentSessionInfo,
    error?: Error
  ): Promise<void> {
    const { childSessionKey } = sessionInfo;

    logger.debug(
      `[SubagentLifecycleManager] 执行回滚: ${childSessionKey}, ` +
      `回滚操作数: ${sessionInfo.rollbackActions.length}`
    );

    for (let i = sessionInfo.rollbackActions.length - 1; i >= 0; i--) {
      try {
        await sessionInfo.rollbackActions[i]();
      } catch (rollbackErr) {
        logger.error(
          `[SubagentLifecycleManager] 回滚操作失败 (${childSessionKey}, index=${i}):`,
          rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
        );
      }
    }

    this.sessions.delete(childSessionKey);

    if (this.callbacks.onRollback) {
      try {
        await this.callbacks.onRollback(sessionInfo, error);
      } catch (callbackErr) {
        logger.warn(
          `[SubagentLifecycleManager] onRollback 回调执行失败:`,
          callbackErr instanceof Error ? callbackErr.message : String(callbackErr)
        );
      }
    }
  }

  async rollback(childSessionKey: string): Promise<void> {
    const sessionInfo = this.sessions.get(childSessionKey);
    if (!sessionInfo) {
      logger.debug(
        `[SubagentLifecycleManager] 回滚时会话不存在: ${childSessionKey}`
      );
      return;
    }

    await this.executeRollback(sessionInfo);
  }

  async onSubagentEnded(params: {
    childSessionKey: string;
    reason: SubagentEndReason;
  }): Promise<void> {
    const { childSessionKey, reason } = params;

    const sessionInfo = this.sessions.get(childSessionKey);
    if (!sessionInfo) {
      logger.debug(
        `[SubagentLifecycleManager] 子代理结束时会话不存在: ${childSessionKey}`
      );
      return;
    }

    if (!sessionInfo.isActive) {
      logger.debug(
        `[SubagentLifecycleManager] 子代理会话已结束: ${childSessionKey}, ` +
        `原结束原因: ${sessionInfo.endReason}, 新原因: ${reason}`
      );
      return;
    }

    sessionInfo.isActive = false;
    sessionInfo.endReason = reason;
    sessionInfo.endedAt = Date.now();

    logger.debug(
      `[SubagentLifecycleManager] 子代理会话结束: ${childSessionKey}, 原因: ${reason}`
    );

    try {
      if (reason === 'completed' && sessionInfo.contextMode === 'fork') {
        if (this.syncForkedContextBack) {
          await this.syncForkedContextBack({
            parentSessionKey: sessionInfo.parentSessionKey,
            childSessionKey: sessionInfo.childSessionKey,
            parentSessionId: sessionInfo.parentSessionId,
            childSessionId: sessionInfo.childSessionId,
            parentSessionFile: sessionInfo.parentSessionFile,
            childSessionFile: sessionInfo.childSessionFile,
          });
        }
      }
    } catch (syncErr) {
      logger.error(
        `[SubagentLifecycleManager] fork 上下文同步失败 (${childSessionKey}):`,
        syncErr instanceof Error ? syncErr.message : String(syncErr)
      );
    }

    if (this.callbacks.onEnd) {
      try {
        await this.callbacks.onEnd(sessionInfo, reason);
      } catch (callbackErr) {
        logger.warn(
          `[SubagentLifecycleManager] onEnd 回调执行失败:`,
          callbackErr instanceof Error ? callbackErr.message : String(callbackErr)
        );
      }
    }

    if (reason === 'deleted' || reason === 'swept' || reason === 'released') {
      for (let i = sessionInfo.rollbackActions.length - 1; i >= 0; i--) {
        try {
          await sessionInfo.rollbackActions[i]();
        } catch (cleanupErr) {
          logger.error(
            `[SubagentLifecycleManager] 结束时清理失败 (${childSessionKey}, index=${i}):`,
            cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
          );
        }
      }
      this.sessions.delete(childSessionKey);
    }
  }

  getSession(childSessionKey: string): SubagentSessionInfo | undefined {
    return this.sessions.get(childSessionKey);
  }

  hasSession(childSessionKey: string): boolean {
    return this.sessions.has(childSessionKey);
  }

  isSessionActive(childSessionKey: string): boolean {
    const session = this.sessions.get(childSessionKey);
    return session?.isActive ?? false;
  }

  listSessions(): SubagentSessionInfo[] {
    return Array.from(this.sessions.values());
  }

  listActiveSessions(): SubagentSessionInfo[] {
    return Array.from(this.sessions.values()).filter((s) => s.isActive);
  }

  listSessionsByParent(parentSessionKey: string): SubagentSessionInfo[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.parentSessionKey === parentSessionKey
    );
  }

  refreshSession(childSessionKey: string, ttlMs?: number): boolean {
    const session = this.sessions.get(childSessionKey);
    if (!session || !session.isActive) return false;

    const effectiveTtl = ttlMs ?? session.ttlMs;
    session.lastActiveAt = Date.now();
    session.expiresAt = Date.now() + effectiveTtl;

    logger.debug(
      `[SubagentLifecycleManager] 会话已刷新: ${childSessionKey}, ` +
      `新过期时间: ${new Date(session.expiresAt).toISOString()}`
    );

    return true;
  }

  setCallbacks(callbacks: SubagentLifecycleCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  getActiveSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.isActive) count++;
    }
    return count;
  }

  getTotalSessionCount(): number {
    return this.sessions.size;
  }

  dispose(): void {
    this.stopCleanupTimer();
    this.sessions.clear();
    logger.debug('[SubagentLifecycleManager] 已销毁');
  }
}
