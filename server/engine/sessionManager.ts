/**
 * 会话管理器 — 参考 OpenClaw server-chat-state.ts 和 agent-list.ts
 *
 * 管理会话的完整生命周期：
 * - 会话创建、更新、删除
 * - 会话状态追踪（活跃、空闲、压缩中、已删除）
 * - 会话统计和诊断
 * - 会话索引（按 Key、ID、文件路径）
 * - 会话清理和过期管理
 */

import { logger } from '../logger.js';
import {
  unregisterActiveRun,
  getActiveRunCount,
  listActiveRunSessionIds,
} from './runManager.js';
import { publishEvent } from './events.js';

export type SessionStatus = 'active' | 'idle' | 'compacting' | 'streaming' | 'deleted';

export type SessionSource = 'chat' | 'api' | 'cron' | 'subagent' | 'tool';

export interface SessionStats {
  messageCount: number;
  toolCallCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  lastActivityAt: number;
  createdAt: number;
  totalDurationMs: number;
}

export interface SessionMetadata {
  name?: string;
  agentId?: string;
  provider?: string;
  modelId?: string;
  workspaceDir?: string;
  source?: SessionSource;
  tags?: Record<string, string>;
}

export interface SessionRecord {
  id: string;
  key: string;
  filePath?: string;
  status: SessionStatus;
  metadata: SessionMetadata;
  stats: SessionStats;
  isNew?: boolean;
}

export interface SessionSummary {
  id: string;
  key: string;
  name?: string;
  status: SessionStatus;
  agentId?: string;
  provider?: string;
  messageCount: number;
  lastActivityAt: number;
  createdAt: number;
}

export interface CreateSessionOptions {
  name?: string;
  agentId?: string;
  provider?: string;
  modelId?: string;
  workspaceDir?: string;
  source?: SessionSource;
}

export interface UpdateSessionOptions {
  name?: string;
  agentId?: string;
  provider?: string;
  modelId?: string;
  status?: SessionStatus;
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 1000;

interface SessionManagerState {
  sessions: Map<string, SessionRecord>;
  keyToId: Map<string, string>;
  fileToId: Map<string, string>;
  cleanupTimer?: NodeJS.Timeout;
  started: boolean;
}

const STATE_KEY = Symbol.for('cross-wms.sessionManager');

function getState(): SessionManagerState {
  const globalScope = globalThis as Record<symbol, SessionManagerState>;
  if (!globalScope[STATE_KEY]) {
    globalScope[STATE_KEY] = {
      sessions: new Map<string, SessionRecord>(),
      keyToId: new Map<string, string>(),
      fileToId: new Map<string, string>(),
      started: false,
    };
  }
  return globalScope[STATE_KEY];
}

export function createSession(
  sessionId: string,
  sessionKey: string,
  options?: CreateSessionOptions,
): SessionRecord {
  const state = getState();

  if (state.sessions.has(sessionId)) {
    logger.warn(`[SessionManager] 会话已存在，跳过创建: ${sessionId}`);
    return state.sessions.get(sessionId)!;
  }

  const record: SessionRecord = {
    id: sessionId,
    key: sessionKey,
    status: 'active',
    metadata: {
      name: options?.name,
      agentId: options?.agentId,
      provider: options?.provider,
      modelId: options?.modelId,
      workspaceDir: options?.workspaceDir,
      source: options?.source ?? 'chat',
    },
    stats: {
      messageCount: 0,
      toolCallCount: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      totalDurationMs: 0,
    },
    isNew: true,
  };

  state.sessions.set(sessionId, record);
  state.keyToId.set(sessionKey, sessionId);

  publishEvent('chat:session_created', {
    sessionId,
    sessionKey,
    options,
  }, {
    level: 'info',
    context: { sessionId, sessionKey, agentId: options?.agentId, provider: options?.provider },
  });

  logger.info(`[SessionManager] 创建会话: ${sessionId} (key=${sessionKey})`);

  return record;
}

export function getSession(sessionId: string): SessionRecord | undefined {
  return getState().sessions.get(sessionId);
}

export function getSessionByKey(sessionKey: string): SessionRecord | undefined {
  const state = getState();
  const sessionId = state.keyToId.get(sessionKey);
  if (!sessionId) return undefined;
  return state.sessions.get(sessionId);
}

export function getSessionByFile(filePath: string): SessionRecord | undefined {
  const state = getState();
  const sessionId = state.fileToId.get(filePath);
  if (!sessionId) return undefined;
  return state.sessions.get(sessionId);
}

export function updateSession(
  sessionId: string,
  options: UpdateSessionOptions,
): SessionRecord | undefined {
  const state = getState();
  const record = state.sessions.get(sessionId);
  if (!record) {
    logger.warn(`[SessionManager] 尝试更新不存在的会话: ${sessionId}`);
    return undefined;
  }

  const oldStatus = record.status;

  if (options.name !== undefined) {
    record.metadata.name = options.name;
  }
  if (options.agentId !== undefined) {
    record.metadata.agentId = options.agentId;
  }
  if (options.provider !== undefined) {
    record.metadata.provider = options.provider;
  }
  if (options.modelId !== undefined) {
    record.metadata.modelId = options.modelId;
  }
  if (options.status !== undefined) {
    record.status = options.status;
  }

  record.stats.lastActivityAt = Date.now();

  if (oldStatus !== record.status) {
    publishEvent('chat:session_updated', {
      sessionId,
      oldStatus,
      newStatus: record.status,
      options,
    }, {
      level: 'info',
      context: { sessionId, agentId: record.metadata.agentId, provider: record.metadata.provider },
    });
  }

  logger.debug(`[SessionManager] 更新会话: ${sessionId}`, options);

  return record;
}

export function deleteSession(sessionId: string): boolean {
  const state = getState();
  const record = state.sessions.get(sessionId);
  if (!record) {
    return false;
  }

  record.status = 'deleted';
  record.stats.lastActivityAt = Date.now();

  state.keyToId.delete(record.key);
  if (record.filePath) {
    state.fileToId.delete(record.filePath);
  }

  unregisterActiveRun(sessionId);

  publishEvent('chat:session_deleted', {
    sessionId,
    sessionKey: record.key,
    metadata: record.metadata,
  }, {
    level: 'info',
    context: { sessionId, agentId: record.metadata.agentId },
  });

  setTimeout(() => {
    state.sessions.delete(sessionId);
  }, IDLE_TIMEOUT_MS);

  logger.info(`[SessionManager] 删除会话: ${sessionId} (key=${record.key})`);

  return true;
}

export function touchSession(sessionId: string): void {
  const state = getState();
  const record = state.sessions.get(sessionId);
  if (!record) return;

  record.stats.lastActivityAt = Date.now();
  record.status = 'active';
}

export function markSessionStreaming(sessionId: string): void {
  const state = getState();
  const record = state.sessions.get(sessionId);
  if (!record) return;

  record.status = 'streaming';
  record.stats.lastActivityAt = Date.now();
}

export function markSessionCompacting(sessionId: string): void {
  const state = getState();
  const record = state.sessions.get(sessionId);
  if (!record) return;

  record.status = 'compacting';
  record.stats.lastActivityAt = Date.now();
}

export function updateSessionStats(
  sessionId: string,
  stats: Partial<SessionStats>,
): void {
  const state = getState();
  const record = state.sessions.get(sessionId);
  if (!record) return;

  if (stats.messageCount !== undefined) {
    record.stats.messageCount = stats.messageCount;
  }
  if (stats.toolCallCount !== undefined) {
    record.stats.toolCallCount = stats.toolCallCount;
  }
  if (stats.totalTokens !== undefined) {
    record.stats.totalTokens = stats.totalTokens;
  }
  if (stats.inputTokens !== undefined) {
    record.stats.inputTokens = stats.inputTokens;
  }
  if (stats.outputTokens !== undefined) {
    record.stats.outputTokens = stats.outputTokens;
  }
  if (stats.lastActivityAt !== undefined) {
    record.stats.lastActivityAt = stats.lastActivityAt;
  }
  if (stats.totalDurationMs !== undefined) {
    record.stats.totalDurationMs = stats.totalDurationMs;
  }

  record.stats.lastActivityAt = Date.now();
}

export function listSessions(): SessionSummary[] {
  const state = getState();
  const summaries: SessionSummary[] = [];

  for (const record of state.sessions.values()) {
    summaries.push({
      id: record.id,
      key: record.key,
      name: record.metadata.name,
      status: record.status,
      agentId: record.metadata.agentId,
      provider: record.metadata.provider,
      messageCount: record.stats.messageCount,
      lastActivityAt: record.stats.lastActivityAt,
      createdAt: record.stats.createdAt,
    });
  }

  summaries.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

  return summaries;
}

export function listActiveSessions(): SessionSummary[] {
  return listSessions().filter((s) => s.status !== 'deleted');
}

export function getSessionCount(): {
  total: number;
  active: number;
  idle: number;
  streaming: number;
  compacting: number;
} {
  const state = getState();
  let active = 0;
  let idle = 0;
  let streaming = 0;
  let compacting = 0;

  for (const record of state.sessions.values()) {
    switch (record.status) {
      case 'active':
        active++;
        break;
      case 'idle':
        idle++;
        break;
      case 'streaming':
        streaming++;
        break;
      case 'compacting':
        compacting++;
        break;
    }
  }

  return {
    total: state.sessions.size,
    active,
    idle,
    streaming,
    compacting,
  };
}

export function cleanupIdleSessions(): number {
  const state = getState();
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, record] of state.sessions) {
    if (record.status === 'deleted') continue;

    const idleTime = now - record.stats.lastActivityAt;
    if (idleTime > IDLE_TIMEOUT_MS) {
      record.status = 'idle';
      cleaned++;
      logger.debug(`[SessionManager] 标记会话为空闲: ${sessionId} (空闲 ${Math.floor(idleTime / 60000)} 分钟)`);
    }
  }

  return cleaned;
}

export function startSessionManager(): void {
  const state = getState();
  if (state.started) return;

  state.started = true;

  state.cleanupTimer = setInterval(() => {
    const cleaned = cleanupIdleSessions();
    if (cleaned > 0) {
      logger.debug(`[SessionManager] 清理了 ${cleaned} 个空闲会话`);
    }
  }, CLEANUP_INTERVAL_MS);

  logger.info('[SessionManager] 会话管理器已启动');
}

export function stopSessionManager(): void {
  const state = getState();
  if (!state.started) return;

  if (state.cleanupTimer) {
    clearInterval(state.cleanupTimer);
    state.cleanupTimer = undefined;
  }

  state.started = false;
  logger.info('[SessionManager] 会话管理器已关闭');
}

export function getSessionManagerDiagnostics(): {
  sessionCount: ReturnType<typeof getSessionCount>;
  activeRunCount: number;
  activeRunSessionIds: string[];
} {
  return {
    sessionCount: getSessionCount(),
    activeRunCount: getActiveRunCount(),
    activeRunSessionIds: listActiveRunSessionIds(),
  };
}