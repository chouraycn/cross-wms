/**
 * 会话资源管理 — LLM 会话相关资源的清理钩子注册与执行。
 *
 * 每次 LLM 调用可能创建：
 * - 流式 reader（需要 cancel）
 * - AbortController（需要清理）
 * - 临时缓冲区
 * - 心跳定时器
 *
 * 此模块允许 Provider 注册清理回调，会话结束时统一执行。
 */
import { logger } from '../../logger.js';

/** 会话资源清理回调。 */
export type SessionResourceCleanup = (sessionId?: string) => void;

/** 清理结果。 */
export type CleanupResult = {
  success: number;
  failures: number;
  errors: unknown[];
};

/** 进程内清理钩子注册表。 */
const sessionCleanups = new Set<SessionResourceCleanup>();

/** 按 sessionId 索引的清理钩子。 */
const sessionScopedCleanups = new Map<string, Set<SessionResourceCleanup>>();

/** 注册一个全局清理钩子，返回反注册函数。 */
export function registerSessionResourceCleanup(cleanup: SessionResourceCleanup): () => void {
  sessionCleanups.add(cleanup);
  return () => {
    sessionCleanups.delete(cleanup);
  };
}

/** 注册一个针对特定 sessionId 的清理钩子，返回反注册函数。 */
export function registerScopedSessionResourceCleanup(
  sessionId: string,
  cleanup: SessionResourceCleanup,
): () => void {
  let set = sessionScopedCleanups.get(sessionId);
  if (!set) {
    set = new Set();
    sessionScopedCleanups.set(sessionId, set);
  }
  set.add(cleanup);
  return () => {
    set!.delete(cleanup);
    if (set!.size === 0) {
      sessionScopedCleanups.delete(sessionId);
    }
  };
}

/** 执行所有全局清理钩子（聚合错误）。 */
export function cleanupSessionResources(sessionId?: string): CleanupResult {
  const errors: unknown[] = [];
  let success = 0;
  for (const cleanup of sessionCleanups) {
    try {
      cleanup(sessionId);
      success++;
    } catch (error) {
      errors.push(error);
      logger.debug(`[LLM:Session] Cleanup hook failed: ${(error as Error)?.message ?? error}`);
    }
  }
  return { success, failures: errors.length, errors };
}

/** 执行指定 sessionId 的清理钩子（含全局 + 范围内）。 */
export function cleanupSession(sessionId: string): CleanupResult {
  const globalResult = cleanupSessionResources(sessionId);
  const scoped = sessionScopedCleanups.get(sessionId);
  if (!scoped) return globalResult;
  const errors: unknown[] = [...globalResult.errors];
  let success = globalResult.success;
  for (const cleanup of scoped) {
    try {
      cleanup(sessionId);
      success++;
    } catch (error) {
      errors.push(error);
      logger.debug(`[LLM:Session] Scoped cleanup hook failed for ${sessionId}: ${(error as Error)?.message ?? error}`);
    }
  }
  sessionScopedCleanups.delete(sessionId);
  return { success, failures: errors.length, errors };
}

/** 列出当前活跃的 sessionId。 */
export function listActiveSessions(): string[] {
  return Array.from(sessionScopedCleanups.keys());
}

/** 统计已注册的清理钩子数量。 */
export function countSessionCleanups(): { global: number; scoped: number } {
  let scoped = 0;
  for (const set of sessionScopedCleanups.values()) {
    scoped += set.size;
  }
  return { global: sessionCleanups.size, scoped };
}

/** 清空所有清理钩子（测试用）。 */
export function clearAllSessionCleanups(): void {
  sessionCleanups.clear();
  sessionScopedCleanups.clear();
}

/** 包装 AbortController，自动注册清理。 */
export function createTrackedAbortController(sessionId?: string): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const cleanup = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };
  if (sessionId) {
    const unregister = registerScopedSessionResourceCleanup(sessionId, cleanup);
    return { controller, cleanup: () => { cleanup(); unregister(); } };
  }
  const unregister = registerSessionResourceCleanup(cleanup);
  return { controller, cleanup: () => { cleanup(); unregister(); } };
}

/** 包装 ReadableStreamDefaultReader，自动注册清理。 */
export function trackReader<T>(
  reader: { cancel: () => Promise<void> },
  sessionId?: string,
): () => void {
  const cleanup = () => {
    void reader.cancel().catch(() => {});
  };
  if (sessionId) {
    return registerScopedSessionResourceCleanup(sessionId, cleanup);
  }
  return registerSessionResourceCleanup(cleanup);
}
