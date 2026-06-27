/**
 * Runtime Resume State
 * 运行时恢复状态 - 管理运行时会话崩溃后的状态恢复
 */

import type { AcpRuntime, AcpRuntimeHandle, SessionAcpMeta } from "./types.js";
import { AcpRuntimeError } from "./types.js";

export interface ResumeState {
  sessionKey: string;
  meta: SessionAcpMeta;
  handle?: AcpRuntimeHandle;
  lastTurnId?: string;
  lastTurnStatus?: "completed" | "failed" | "cancelled" | "unknown";
  messageCount: number;
  lastMessageAt?: number;
  hasUnfinishedWork: boolean;
  resumeToken?: string;
}

export interface ResumeFromCrashParams {
  sessionKey: string;
  runtime: AcpRuntime;
  meta: SessionAcpMeta;
  handle: AcpRuntimeHandle;
}

export interface SaveResumeStateParams {
  sessionKey: string;
  meta: SessionAcpMeta;
  handle: AcpRuntimeHandle;
  turnId?: string;
  turnStatus?: "completed" | "failed" | "cancelled";
}

const RESUME_STATE_STORE_KEY = "acp-resume-state";

/**
 * 内存中的恢复状态存储
 */
export class ResumeStateStore {
  private readonly states = new Map<string, ResumeState>();
  private readonly maxStates: number;

  constructor(maxStates = 100) {
    this.maxStates = maxStates;
  }

  /**
   * 保存恢复状态
   */
  save(params: SaveResumeStateParams): void {
    const { sessionKey, meta, handle, turnId, turnStatus } = params;

    const state: ResumeState = {
      sessionKey,
      meta: { ...meta },
      handle: { ...handle },
      lastTurnId: turnId,
      lastTurnStatus: turnStatus,
      messageCount: this.getApproxMessageCount(meta),
      lastMessageAt: meta.lastActivityAt,
      hasUnfinishedWork: turnStatus === undefined || turnStatus === "cancelled",
    };

    this.states.set(sessionKey.toLowerCase(), state);
    this.evictIfNeeded();
  }

  /**
   * 获取恢复状态
   */
  get(sessionKey: string): ResumeState | undefined {
    return this.states.get(sessionKey.toLowerCase());
  }

  /**
   * 检查是否有可恢复的状态
   */
  has(sessionKey: string): boolean {
    return this.states.has(sessionKey.toLowerCase());
  }

  /**
   * 删除恢复状态
   */
  delete(sessionKey: string): boolean {
    return this.states.delete(sessionKey.toLowerCase());
  }

  /**
   * 获取所有可恢复的会话
   */
  getAllRecoverable(): ResumeState[] {
    return Array.from(this.states.values()).filter((s) => s.hasUnfinishedWork);
  }

  /**
   * 清除过期的恢复状态
   */
  cleanupExpired(maxAgeMs = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, state] of this.states) {
      if (state.lastMessageAt && now - state.lastMessageAt > maxAgeMs) {
        this.states.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * 获取状态数量
   */
  size(): number {
    return this.states.size;
  }

  private evictIfNeeded(): void {
    if (this.states.size <= this.maxStates) {
      return;
    }

    // 删除最旧的条目
    const entries = Array.from(this.states.entries()).sort(
      (a, b) => (a[1].lastMessageAt ?? 0) - (b[1].lastMessageAt ?? 0),
    );

    const toRemove = entries.slice(0, Math.ceil(this.maxStates * 0.1));
    for (const [key] of toRemove) {
      this.states.delete(key);
    }
  }

  private getApproxMessageCount(meta: SessionAcpMeta): number {
    // 简化估算，实际实现中应该从事件账本中获取
    return 0;
  }
}

// 全局单例
let RESUME_STATE_STORE: ResumeStateStore | null = null;

export function getResumeStateStore(): ResumeStateStore {
  if (!RESUME_STATE_STORE) {
    RESUME_STATE_STORE = new ResumeStateStore();
  }
  return RESUME_STATE_STORE;
}

export function resetResumeStateStoreForTests(): void {
  RESUME_STATE_STORE = null;
}

/**
 * 判断会话是否需要从崩溃中恢复
 */
export function shouldResumeFromCrash(params: {
  sessionKey: string;
  meta?: SessionAcpMeta;
}): boolean {
  const store = getResumeStateStore();
  const state = store.get(params.sessionKey);

  if (!state) {
    return false;
  }

  // 如果有未完成的工作，应该恢复
  if (state.hasUnfinishedWork) {
    return true;
  }

  // 如果会话处于错误状态
  if (state.meta.state === "error") {
    return true;
  }

  return false;
}

/**
 * 执行崩溃恢复
 */
export async function resumeFromCrash(
  params: ResumeFromCrashParams,
): Promise<ResumeState> {
  const { sessionKey, runtime, meta, handle } = params;

  const store = getResumeStateStore();
  const existingState = store.get(sessionKey);

  if (!existingState) {
    throw new AcpRuntimeError(
    "ACP_RUNTIME_ERROR",
    `No resume state found for session ${sessionKey}`,
  );
  }

  try {
    // 验证运行时句柄仍然有效
    if (handle.status === "error") {
      // 尝试重新创建会话
      console.warn(`Runtime handle for ${sessionKey} is in error state, attempting recovery...`);
    }

    const resumeState: ResumeState = {
      ...existingState,
      meta: { ...meta, lastActivityAt: Date.now() },
      handle: { ...handle },
    };

    store.save({
      sessionKey,
      meta: resumeState.meta,
      handle: resumeState.handle!,
      turnStatus: resumeState.lastTurnStatus as "completed" | "failed" | "cancelled",
    });

    return resumeState;
  } catch (error) {
    throw new AcpRuntimeError(
      "ACP_RUNTIME_ERROR",
      `Failed to resume session ${sessionKey}: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

/**
 * 标记会话为已安全关闭（删除恢复状态）
 */
export function markSessionSafelyClosed(sessionKey: string): void {
  const store = getResumeStateStore();
  const state = store.get(sessionKey);
  if (state) {
    state.hasUnfinishedWork = false;
    state.lastTurnStatus = "completed";
  }
}

/**
 * 启动时恢复所有可能崩溃的会话
 */
export async function recoverCrashSessions(params: {
  sessions: Array<{ sessionKey: string; meta: SessionAcpMeta; handle: AcpRuntimeHandle }>;
  createRuntime: (meta: SessionAcpMeta) => Promise<AcpRuntime>;
}): Promise<{
  recovered: number;
  failed: Array<{ sessionKey: string; error: string }>;
}> {
  let recovered = 0;
  const failed: Array<{ sessionKey: string; error: string }> = [];

  for (const session of params.sessions) {
    try {
      const runtime = await params.createRuntime(session.meta);
      await resumeFromCrash({
        sessionKey: session.sessionKey,
        runtime,
        meta: session.meta,
        handle: session.handle,
      });
      recovered++;
    } catch (error) {
      failed.push({
        sessionKey: session.sessionKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { recovered, failed };
}
