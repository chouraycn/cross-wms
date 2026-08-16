/**
 * Event Ledger API — 事件账本 API 服务
 */

import { request } from './api';

// ==================== 类型定义 ====================

export interface LedgerEvent {
  id: string;
  seq: number;
  sessionId: string;
  type: string;
  payload: Record<string, any>;
  timestamp: number;
  runId?: string;
  actor?: string;
  version: number;
}

export interface SessionMeta {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  lastEventSeq: number;
  eventCount: number;
  status: 'active' | 'archived' | 'incomplete' | 'deleted';
  lastEventType?: string;
  metadata: Record<string, any>;
}

export interface ReconstructedSession {
  sessionId: string;
  title: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: number;
    toolCalls?: any[];
    toolResults?: Array<{ toolCallId: string; content: string }>;
    thinking?: string;
    metadata: Record<string, any>;
  }>;
  metadata: Record<string, any>;
  status: string;
  eventCount: number;
  lastUpdated: number;
}

export interface LedgerStats {
  totalSessions: number;
  activeSessions: number;
  archivedSessions: number;
  totalEvents: number;
  dbSizeBytes: number;
  dbSizeHuman: string;
}

// ==================== Step 时间线类型（P1a） ====================

export interface StepTimelineStep {
  stepIndex: number;
  toolName: string;
  callId?: string;
  args?: string;
  result?: string;
  error?: string;
  durationMs?: number;
  status: 'started' | 'success' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
}

export interface StepTimelineDelivery {
  deliveryId?: string;
  channel?: string;
  status?: string;
  externalId?: string;
  error?: string;
  timestamp: number;
}

export interface StepTimelineCompaction {
  summary?: string;
  reason?: string;
  tokensBefore?: number;
  tokensAfter?: number;
}

export interface StepTimelineTurn {
  turnIndex: number;
  status: 'active' | 'completed' | 'failed';
  startedAt?: number;
  endedAt?: number;
  model?: string;
  executionMode?: string;
  systemPromptVersion?: string;
  toolSchemaCount?: number;
  userMessage?: string;
  assistantContent?: string;
  thinkingDuration?: number;
  usage?: { totalTokens?: number };
  steps: StepTimelineStep[];
  deliveries: StepTimelineDelivery[];
  compactions: StepTimelineCompaction[];
  runId?: string;
}

// ==================== API 函数 ====================

export const eventLedgerApi = {
  async getEvents(
    sessionId: string,
    options?: {
      fromSeq?: number;
      toSeq?: number;
      limit?: number;
      reverse?: boolean;
      types?: string;
    }
  ): Promise<{ ok: boolean; data?: LedgerEvent[]; count?: number; error?: string }> {
    try {
      const params = new URLSearchParams();
      if (options?.fromSeq) params.set('fromSeq', String(options.fromSeq));
      if (options?.toSeq) params.set('toSeq', String(options.toSeq));
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.reverse) params.set('reverse', 'true');
      if (options?.types) params.set('types', options.types);

      const query = params.toString();
      const data = await request<LedgerEvent[]>('GET', `/api/event-ledger/sessions/${sessionId}/events${query ? `?${query}` : ''}`);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async reconstructSession(sessionId: string): Promise<{ ok: boolean; data?: ReconstructedSession; error?: string }> {
    try {
      const data = await request<ReconstructedSession>('GET', `/api/event-ledger/sessions/${sessionId}/reconstruct`);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  /** P1a：会话 step 时间线（回合 → step → 工具调用 → 渠道投递 → 压缩） */
  async getTimeline(sessionId: string): Promise<{ ok: boolean; data?: StepTimelineTurn[]; count?: number; error?: string }> {
    try {
      const data = await request<StepTimelineTurn[]>('GET', `/api/event-ledger/sessions/${sessionId}/timeline`);
      return { ok: true, data, count: data.length };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async getSessionMeta(sessionId: string): Promise<{ ok: boolean; data?: SessionMeta; error?: string }> {
    try {
      const data = await request<SessionMeta>('GET', `/api/event-ledger/sessions/${sessionId}/meta`);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async listSessions(options?: {
    status?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
  }): Promise<{ ok: boolean; data?: SessionMeta[]; count?: number; error?: string }> {
    try {
      const params = new URLSearchParams();
      if (options?.status) params.set('status', options.status);
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.offset) params.set('offset', String(options.offset));
      if (options?.sortBy) params.set('sortBy', options.sortBy);

      const query = params.toString();
      const data = await request<SessionMeta[]>('GET', `/api/event-ledger/sessions${query ? `?${query}` : ''}`);
      return { ok: true, data, count: data.length };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async getIncompleteSessions(): Promise<{ ok: boolean; data?: SessionMeta[]; count?: number; error?: string }> {
    try {
      const data = await request<SessionMeta[]>('GET', '/api/event-ledger/sessions/incomplete');
      return { ok: true, data, count: data.length };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async recoverSession(sessionId: string): Promise<{ ok: boolean; data?: ReconstructedSession; message?: string; error?: string }> {
    try {
      const data = await request<ReconstructedSession>('POST', `/api/event-ledger/sessions/${sessionId}/recover`, {});
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async getStats(): Promise<{ ok: boolean; data?: LedgerStats; error?: string }> {
    try {
      const data = await request<LedgerStats>('GET', '/api/event-ledger/stats');
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async recordEvent(
    sessionId: string,
    type: string,
    payload?: Record<string, any>,
    runId?: string,
    actor?: string
  ): Promise<{ ok: boolean; data?: LedgerEvent; error?: string }> {
    try {
      const data = await request<LedgerEvent>('POST', `/api/event-ledger/sessions/${sessionId}/events`, { type, payload, runId, actor });
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async pruneSessions(maxSessions: number = 200): Promise<{ ok: boolean; data?: { prunedCount: number }; error?: string }> {
    try {
      const data = await request<{ prunedCount: number }>('POST', '/api/event-ledger/prune', { maxSessions });
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
