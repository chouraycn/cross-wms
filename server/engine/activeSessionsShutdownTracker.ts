/**
 * 活跃会话关闭追踪 — 参考 OpenClaw active-sessions-shutdown-tracker.ts
 *
 * 追踪已接收 session_start 但尚未配对 session_end 的会话。
 * 在服务器关闭/重启时排空此集合，确保下游 session_end 插件能正常完成。
 */

import { logger } from '../logger.js';

export interface ActiveSessionForShutdown {
  sessionKey: string;
  sessionId: string;
  storePath?: string;
  sessionFile?: string;
  agentId?: string;
}

const trackedSessions = new Map<string, ActiveSessionForShutdown>();

export function noteActiveSessionForShutdown(entry: ActiveSessionForShutdown): void {
  if (!entry.sessionId) {
    return;
  }

  trackedSessions.set(entry.sessionId, entry);
  logger.debug(`[ActiveSessionsShutdown] 追踪会话: ${entry.sessionId}`);
}

export function forgetActiveSessionForShutdown(sessionId: string | undefined): void {
  if (!sessionId) {
    return;
  }

  if (trackedSessions.delete(sessionId)) {
    logger.debug(`[ActiveSessionsShutdown] 忘记会话: ${sessionId}`);
  }
}

export function listActiveSessionsForShutdown(): ActiveSessionForShutdown[] {
  return Array.from(trackedSessions.values());
}

export function getActiveSessionCount(): number {
  return trackedSessions.size;
}

export function hasActiveSessionForShutdown(sessionId: string): boolean {
  return trackedSessions.has(sessionId);
}

export function getActiveSessionForShutdown(sessionId: string): ActiveSessionForShutdown | undefined {
  return trackedSessions.get(sessionId);
}

export function clearActiveSessionsForShutdownTracker(): void {
  const count = trackedSessions.size;
  trackedSessions.clear();

  if (count > 0) {
    logger.info(`[ActiveSessionsShutdown] 清除 ${count} 个追踪会话`);
  }
}

export async function drainActiveSessionsForShutdown(
  handler: (entry: ActiveSessionForShutdown) => Promise<void>,
  timeoutMs: number = 2_000,
): Promise<{ drained: number; failed: number }> {
  const sessions = listActiveSessionsForShutdown();
  let drained = 0;
  let failed = 0;

  for (const entry of sessions) {
    try {
      await Promise.race([
        handler(entry),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('排空超时')), timeoutMs),
        ),
      ]);
      drained++;
    } catch (err) {
      failed++;
      logger.warn(
        `[ActiveSessionsShutdown] 排空会话失败: ${entry.sessionId}`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  logger.info(
    `[ActiveSessionsShutdown] 排空完成: ${drained} 成功, ${failed} 失败`,
  );

  clearActiveSessionsForShutdownTracker();

  return { drained, failed };
}