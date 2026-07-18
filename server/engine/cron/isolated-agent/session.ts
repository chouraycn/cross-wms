/**
 * 隔离 agent 的 session 管理
 *
 * 参考 openclaw/src/cron/isolated-agent/session.ts 的精简实现。
 * 负责隔离 cron 运行的会话创建和滚动。
 */
import type { CronJob } from "../types.js";
import type { IsolatedAgentSessionState } from "./types.js";

/** 隔离会话参数 */
export type IsolatedSessionParams = {
  job: CronJob;
  agentId?: string;
  sessionKey?: string;
  nowMs?: number;
  forceNew?: boolean;
};

/** 隔离会话 */
export type IsolatedSession = {
  sessionId: string;
  sessionKey: string;
  isNew: boolean;
  systemSent: boolean;
  createdAtMs: number;
  state: IsolatedAgentSessionState;
};

/**
 * 创建隔离会话。
 *
 * 精简版实现：为隔离 cron 运行创建新的会话标识。
 * 每次运行生成新的 sessionId，确保隔离性。
 * 当任务自带 sessionKey 时复用该 key，否则基于 jobId 和时间戳生成。
 */
export function createIsolatedSession(params: IsolatedSessionParams): IsolatedSession {
  const { job, sessionKey, nowMs, forceNew } = params;
  const ts = nowMs ?? Date.now();
  const key = sessionKey?.trim() || job.sessionKey || `isolated:${job.id}:${ts}`;
  // forceNew 为 false 时复用既有 sessionId 后缀，否则生成全新 sessionId 以保证隔离
  const sessionId =
    forceNew === false ? `${key}:${ts}` : `isolated-session:${job.id}:${ts}`;

  return {
    sessionId,
    sessionKey: key,
    isNew: true,
    systemSent: false,
    createdAtMs: ts,
    state: {
      sessionId,
      sessionKey: key,
      hasMessages: false,
    },
  };
}
