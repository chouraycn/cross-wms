/**
 * Event Ledger — 事件溯源账本模块
 *
 * 核心思想：所有状态变更都是追加事件，从不覆盖。
 * 支持事件回放、会话重建、崩溃恢复、审计追踪。
 *
 * 事件类型：
 * - session.created     会话创建
 * - session.updated     会话元数据更新
 * - session.archived    会话归档
 * - session.deleted     会话删除
 * - message.created     消息创建（用户/助手）
 * - message.updated     消息更新（编辑/重生成）
 * - message.deleted     消息删除
 * - turn.started        回合开始
 * - turn.completed      回合完成
 * - turn.failed         回合失败
 * - tool.call.started   工具调用开始
 * - tool.call.completed 工具调用完成
 * - tool.call.failed    工具调用失败
 * - model.stream.start  流式输出开始
 * - model.stream.end    流式输出结束
 * - system.error        系统错误
 *
 * 使用方式：
 *   const ledger = getEventLedger();
 *   await ledger.recordEvent(sessionId, 'message.created', { messageId, role, content });
 *   const events = await ledger.getSessionEvents(sessionId);
 *   const session = await ledger.reconstructSession(sessionId);
 *
 * v10.0: 合并入主库 chat.db，使用 DatabaseManager 统一管理
 * - 不再使用独立 event-ledger.db
 * - 通过 DatabaseManager.getMainDb() 获取主库连接
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { DatabaseManager } from '../storage/databaseManager.js';

// ==================== 类型定义 ====================

export type EventType =
  | 'session.created'
  | 'session.updated'
  | 'session.archived'
  | 'session.deleted'
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'turn.started'
  | 'turn.completed'
  | 'turn.failed'
  | 'tool.call.started'
  | 'tool.call.completed'
  | 'tool.call.failed'
  | 'model.stream.start'
  | 'model.stream.end'
  | 'memory.added'
  | 'memory.deleted'
  | 'system.error'
  | 'custom';

export interface LedgerEvent {
  id: string;
  seq: number;
  sessionId: string;
  type: EventType;
  payload: Record<string, unknown>;
  timestamp: number;
  runId?: string;
  actor?: string;
  version: number;
}

export interface LedgerSessionMeta {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  lastEventSeq: number;
  eventCount: number;
  status: 'active' | 'archived' | 'incomplete' | 'deleted';
  lastEventType?: EventType;
  cwd?: string;
  metadata: Record<string, unknown>;
}

export interface ReconstructedSession {
  sessionId: string;
  title: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: number;
    toolCalls?: unknown[];
    toolResults?: Array<{ toolCallId: string; content: string }>;
    thinking?: string;
    metadata: Record<string, unknown>;
  }>;
  metadata: Record<string, unknown>;
  status: string;
  eventCount: number;
  lastUpdated: number;
}

export interface EventQueryOptions {
  fromSeq?: number;
  toSeq?: number;
  eventTypes?: EventType[];
  limit?: number;
  reverse?: boolean;
}

// ==================== 常量 ====================

const LEDGER_VERSION = 1;
const DEFAULT_MAX_SESSIONS = 200;
const DEFAULT_MAX_EVENTS_PER_SESSION = 5000;
const DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 1024; // 1 MB

// ==================== EventLedger 类 ====================

export class EventLedger {
  private initialized = false;
  private sessionCache = new Map<string, LedgerSessionMeta>();
  private listeners = new Set<(event: LedgerEvent) => void>();

  private getDb() {
    return DatabaseManager.getMainDb();
  }

  // ==========================================================================
  // 初始化
  // ==========================================================================

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const db = this.getDb();
      this.createSchema();
      this.initialized = true;

      logger.info(`[EventLedger] 初始化完成（主库 chat.db）`);
    } catch (err) {
      logger.error('[EventLedger] 初始化失败:', err);
      throw err;
    }
  }

  private createSchema(): void {
    const db = this.getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_sessions (
        session_id       TEXT PRIMARY KEY,
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL,
        last_event_seq   INTEGER NOT NULL DEFAULT 0,
        event_count      INTEGER NOT NULL DEFAULT 0,
        status           TEXT NOT NULL DEFAULT 'active',
        last_event_type  TEXT,
        cwd              TEXT,
        metadata         TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS ledger_events (
        id          TEXT PRIMARY KEY,
        seq         INTEGER NOT NULL,
        session_id  TEXT NOT NULL,
        type        TEXT NOT NULL,
        payload     TEXT NOT NULL DEFAULT '{}',
        timestamp   INTEGER NOT NULL,
        run_id      TEXT,
        actor       TEXT,
        version     INTEGER NOT NULL DEFAULT ${LEDGER_VERSION},
        FOREIGN KEY (session_id) REFERENCES ledger_sessions(session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_events_session_seq ON ledger_events(session_id, seq);
      CREATE INDEX IF NOT EXISTS idx_events_type ON ledger_events(type);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON ledger_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON ledger_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON ledger_sessions(updated_at);
    `);
  }

  private ensureInit(): void {
    if (!this.initialized) {
      throw new Error('EventLedger not initialized');
    }
  }

  // ==========================================================================
  // 事件记录
  // ==========================================================================

  async recordEvent(
    sessionId: string,
    type: EventType,
    payload: Record<string, unknown> = {},
    options?: { runId?: string; actor?: string }
  ): Promise<LedgerEvent> {
    this.ensureInit();
    const db = this.getDb();

    const now = Date.now();
    const eventId = uuidv4();
    let payloadStr = JSON.stringify(payload);

    if (payloadStr.length > DEFAULT_MAX_PAYLOAD_BYTES) {
      logger.warn(
        `[EventLedger] 事件 payload 过大: ${type}, ${payloadStr.length} bytes > ${DEFAULT_MAX_PAYLOAD_BYTES}，已截断`
      );
      // 截断 payload 并追加截断标记
      const truncated = payloadStr.slice(0, DEFAULT_MAX_PAYLOAD_BYTES - 100);
      payloadStr = truncated + JSON.stringify({
        _truncated: true,
        _originalBytes: payloadStr.length,
        _reason: 'payload_exceeds_limit',
      });
    }

    const result = db.transaction(() => {
      const sessionRow = db
        .prepare('SELECT last_event_seq, event_count FROM ledger_sessions WHERE session_id = ?')
        .get(sessionId) as { last_event_seq: number; event_count: number } | undefined;

      let seq: number;
      let eventCount: number;

      if (sessionRow) {
        seq = sessionRow.last_event_seq + 1;
        eventCount = sessionRow.event_count + 1;
      } else {
        seq = 1;
        eventCount = 1;
        db.prepare(
          `INSERT INTO ledger_sessions
           (session_id, created_at, updated_at, last_event_seq, event_count, status, last_event_type)
           VALUES (?, ?, ?, ?, ?, 'active', ?)`
        ).run(sessionId, now, now, seq, eventCount, type);
      }

      if (!sessionRow) {
        // 新建会话的情况已经在上面处理了
      } else {
        db.prepare(
          `UPDATE ledger_sessions
           SET updated_at = ?, last_event_seq = ?, event_count = ?, last_event_type = ?
           WHERE session_id = ?`
        ).run(now, seq, eventCount, type, sessionId);
      }

      if (type === 'session.archived') {
        db.prepare("UPDATE ledger_sessions SET status = 'archived' WHERE session_id = ?").run(sessionId);
      } else if (type === 'session.deleted') {
        db.prepare("UPDATE ledger_sessions SET status = 'deleted' WHERE session_id = ?").run(sessionId);
      } else if (type === 'session.created') {
        // 已处理
      }

      db.prepare(
        `INSERT INTO ledger_events
         (id, seq, session_id, type, payload, timestamp, run_id, actor, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        eventId,
        seq,
        sessionId,
        type,
        payloadStr,
        now,
        options?.runId || null,
        options?.actor || null,
        LEDGER_VERSION
      );

      return { id: eventId, seq, eventCount };
    })();

    const event: LedgerEvent = {
      id: eventId,
      seq: result.seq,
      sessionId,
      type,
      payload,
      timestamp: now,
      runId: options?.runId,
      actor: options?.actor,
      version: LEDGER_VERSION,
    };

    // 更新缓存
    this.updateSessionCache(sessionId, type, now, result.seq, result.eventCount, payload);

    // 触发事件监听
    this.emitEvent(event);

    logger.debug(`[EventLedger] 记录事件: ${sessionId} #${result.seq} ${type}`);
    return event;
  }

  async recordEvents(
    sessionId: string,
    events: Array<{ type: EventType; payload: Record<string, unknown>; runId?: string }>
  ): Promise<LedgerEvent[]> {
    const results: LedgerEvent[] = [];
    for (const evt of events) {
      const result = await this.recordEvent(sessionId, evt.type, evt.payload, { runId: evt.runId });
      results.push(result);
    }
    return results;
  }

  // ==========================================================================
  // 事件查询
  // ==========================================================================

  async getSessionEvents(
    sessionId: string,
    options: EventQueryOptions = {}
  ): Promise<LedgerEvent[]> {
    this.ensureInit();
    const db = this.getDb();

    let sql = 'SELECT * FROM ledger_events WHERE session_id = ?';
    const params: unknown[] = [sessionId];

    if (options.fromSeq !== undefined) {
      sql += ' AND seq >= ?';
      params.push(options.fromSeq);
    }
    if (options.toSeq !== undefined) {
      sql += ' AND seq <= ?';
      params.push(options.toSeq);
    }
    if (options.eventTypes && options.eventTypes.length > 0) {
      const placeholders = options.eventTypes.map(() => '?').join(',');
      sql += ` AND type IN (${placeholders})`;
      params.push(...options.eventTypes);
    }

    sql += options.reverse ? ' ORDER BY seq DESC' : ' ORDER BY seq ASC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = db.prepare(sql).all(...params) as Array<{
      id: string;
      seq: number;
      session_id: string;
      type: string;
      payload: string;
      timestamp: number;
      run_id?: string;
      actor?: string;
      version: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      sessionId: row.session_id,
      type: row.type as EventType,
      payload: safeJsonParse(row.payload, {}),
      timestamp: row.timestamp,
      runId: row.run_id,
      actor: row.actor,
      version: row.version,
    }));
  }

  async getLatestEvent(sessionId: string): Promise<LedgerEvent | null> {
    const events = await this.getSessionEvents(sessionId, { limit: 1, reverse: true });
    return events[0] || null;
  }

  async getSessionMeta(sessionId: string): Promise<LedgerSessionMeta | null> {
    this.ensureInit();
    const db = this.getDb();

    const row = db
      .prepare('SELECT * FROM ledger_sessions WHERE session_id = ?')
      .get(sessionId) as
      | {
          session_id: string;
          created_at: number;
          updated_at: number;
          last_event_seq: number;
          event_count: number;
          status: string;
          last_event_type?: string;
          cwd?: string;
          metadata: string;
        }
      | undefined;

    if (!row) return null;

    return {
      sessionId: row.session_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastEventSeq: row.last_event_seq,
      eventCount: row.event_count,
      status: row.status as LedgerSessionMeta['status'],
      lastEventType: row.last_event_type as EventType | undefined,
      cwd: row.cwd,
      metadata: safeJsonParse(row.metadata, {}),
    };
  }

  async listSessions(options?: {
    status?: LedgerSessionMeta['status'];
    limit?: number;
    offset?: number;
    sortBy?: 'updated_at' | 'created_at';
  }): Promise<LedgerSessionMeta[]> {
    this.ensureInit();
    const db = this.getDb();

    let sql = 'SELECT * FROM ledger_sessions';
    const params: unknown[] = [];

    if (options?.status) {
      sql += ' WHERE status = ?';
      params.push(options.status);
    }

    const sortBy = options?.sortBy || 'updated_at';
    sql += ` ORDER BY ${sortBy} DESC`;

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = db.prepare(sql).all(...params) as Array<{
      session_id: string;
      created_at: number;
      updated_at: number;
      last_event_seq: number;
      event_count: number;
      status: string;
      last_event_type?: string;
      cwd?: string;
      metadata: string;
    }>;

    return rows.map((row) => ({
      sessionId: row.session_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastEventSeq: row.last_event_seq,
      eventCount: row.event_count,
      status: row.status as LedgerSessionMeta['status'],
      lastEventType: row.last_event_type as EventType | undefined,
      cwd: row.cwd,
      metadata: safeJsonParse(row.metadata, {}),
    }));
  }

  // ==========================================================================
  // 会话重建（事件回放）
  // ==========================================================================

  async reconstructSession(sessionId: string): Promise<ReconstructedSession | null> {
    this.ensureInit();

    const events = await this.getSessionEvents(sessionId);
    if (events.length === 0) return null;

    const session = this.replayEvents(events);
    return session;
  }

  private replayEvents(events: LedgerEvent[]): ReconstructedSession {
    let title = '新对话';
    const messages: ReconstructedSession['messages'] = [];
    const metadata: Record<string, unknown> = {};
    let status = 'active';
    let lastUpdated = 0;

    for (const event of events) {
      lastUpdated = event.timestamp;
      const p = event.payload;

      switch (event.type) {
        case 'session.created':
          if (p.title) title = String(p.title);
          if (p.metadata) Object.assign(metadata, p.metadata as Record<string, unknown>);
          break;

        case 'session.updated':
          if (p.title) title = String(p.title);
          if (p.metadata) Object.assign(metadata, p.metadata as Record<string, unknown>);
          break;

        case 'session.archived':
          status = 'archived';
          break;

        case 'session.deleted':
          status = 'deleted';
          break;

        case 'message.created': {
          const msgId = (p.messageId as string) || `msg-${event.seq}`;
          const existingIdx = messages.findIndex((m) => m.id === msgId);

          if (existingIdx >= 0) {
            if (p.content) messages[existingIdx].content = String(p.content);
            if (p.thinking) messages[existingIdx].thinking = String(p.thinking);
            Object.assign(messages[existingIdx].metadata, p.metadata || {});
          } else {
            messages.push({
              id: msgId,
              role: String(p.role || 'user'),
              content: String(p.content || ''),
              timestamp: event.timestamp,
              toolCalls: p.toolCalls ? (p.toolCalls as unknown[]) : undefined,
              thinking: p.thinning ? String(p.thinning) : undefined,
              metadata: (p.metadata as Record<string, unknown>) || {},
            });
          }
          break;
        }

        case 'message.updated': {
          const msgId = p.messageId as string;
          const msg = messages.find((m) => m.id === msgId);
          if (msg) {
            if (p.content) msg.content = String(p.content);
            if (p.thinning) msg.thinking = String(p.thinning);
            Object.assign(msg.metadata, p.metadata || {});
          }
          break;
        }

        case 'message.deleted': {
          const msgId = p.messageId as string;
          const idx = messages.findIndex((m) => m.id === msgId);
          if (idx >= 0) messages.splice(idx, 1);
          break;
        }

        default:
          break;
      }
    }

    return {
      sessionId: events[0].sessionId,
      title,
      messages,
      metadata,
      status,
      eventCount: events.length,
      lastUpdated,
    };
  }

  // ==========================================================================
  // 崩溃恢复
  // ==========================================================================

  async findIncompleteSessions(): Promise<LedgerSessionMeta[]> {
    this.ensureInit();
    const db = this.getDb();

    const rows = db
      .prepare(
        `SELECT * FROM ledger_sessions
         WHERE status = 'active'
           AND last_event_type IN ('turn.started', 'model.stream.start', 'tool.call.started')
         ORDER BY updated_at DESC`
      )
      .all() as Array<{
      session_id: string;
      created_at: number;
      updated_at: number;
      last_event_seq: number;
      event_count: number;
      status: string;
      last_event_type?: string;
      cwd?: string;
      metadata: string;
    }>;

    return rows.map((row) => ({
      sessionId: row.session_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastEventSeq: row.last_event_seq,
      eventCount: row.event_count,
      status: 'incomplete',
      lastEventType: row.last_event_type as EventType | undefined,
      cwd: row.cwd,
      metadata: safeJsonParse(row.metadata, {}),
    }));
  }

  async markSessionIncomplete(sessionId: string, reason?: string): Promise<void> {
    await this.recordEvent(sessionId, 'system.error', {
      error: 'session_incomplete',
      reason: reason || 'Session was interrupted',
    });
  }

  async recoverSession(sessionId: string): Promise<ReconstructedSession | null> {
    const session = await this.reconstructSession(sessionId);
    if (!session) return null;

    await this.recordEvent(sessionId, 'session.updated', {
      recovered: true,
      recoveredAt: Date.now(),
    });

    logger.info(`[EventLedger] 会话恢复: ${sessionId}`);
    return session;
  }

  // ==========================================================================
  // 维护与清理
  // ==========================================================================

  async pruneOldSessions(maxSessions: number = DEFAULT_MAX_SESSIONS): Promise<number> {
    this.ensureInit();
    const db = this.getDb();

    const rows = db
      .prepare(
        `SELECT session_id FROM ledger_sessions
         WHERE status != 'active'
         ORDER BY updated_at ASC
         LIMIT -1 OFFSET ?`
      )
      .all(maxSessions) as Array<{ session_id: string }>;

    if (rows.length === 0) return 0;

    const stmt = db.prepare('DELETE FROM ledger_sessions WHERE session_id = ?');
    const transaction = db.transaction((ids: string[]) => {
      for (const id of ids) stmt.run(id);
    });

    const sessionIds = rows.map((r) => r.session_id);
    transaction(sessionIds);

    logger.info(`[EventLedger] 清理旧会话: ${sessionIds.length} 个`);
    return sessionIds.length;
  }

  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    archivedSessions: number;
    totalEvents: number;
    dbSizeBytes: number;
  }> {
    this.ensureInit();
    const db = this.getDb();

    const sessionCount = (db.prepare('SELECT COUNT(*) as c FROM ledger_sessions').get() as { c: number }).c;
    const activeCount = (
      db.prepare("SELECT COUNT(*) as c FROM ledger_sessions WHERE status = 'active'").get() as { c: number }
    ).c;
    const archivedCount = (
      db.prepare("SELECT COUNT(*) as c FROM ledger_sessions WHERE status = 'archived'").get() as { c: number }
    ).c;
    const eventCount = (db.prepare('SELECT COUNT(*) as c FROM ledger_events').get() as { c: number }).c;

    // 主库的 dbSize 不再单独统计 event-ledger，返回 0
    return {
      totalSessions: sessionCount,
      activeSessions: activeCount,
      archivedSessions: archivedCount,
      totalEvents: eventCount,
      dbSizeBytes: 0,
    };
  }

  // ==========================================================================
  // 内部工具
  // ==========================================================================

  private updateSessionCache(
    sessionId: string,
    _type: EventType,
    _timestamp: number,
    _seq: number,
    _eventCount: number,
    _payload: Record<string, unknown>
  ): void {
    // 简化：不维护详细缓存，只做基本的 LRU
    if (this.sessionCache.size > 100) {
      const firstKey = this.sessionCache.keys().next().value;
      if (firstKey) this.sessionCache.delete(firstKey);
    }
  }

  // ==========================================================================
  // 事件监听
  // ==========================================================================

  onEvent(listener: (event: LedgerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitEvent(event: LedgerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error('[EventLedger] 事件监听器执行失败:', err);
      }
    }
  }

  close(): void {
    // 不再需要手动关闭数据库，由 DatabaseManager 统一管理
    this.initialized = false;
    this.listeners.clear();
    logger.info('[EventLedger] 已关闭（连接由 DatabaseManager 管理）');
  }
}

// ==================== 工具函数 ====================

function safeJsonParse(text: string, fallback: Record<string, unknown>): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

// ==================== 单例 ====================

let defaultLedger: EventLedger | null = null;

export function getEventLedger(): EventLedger {
  if (!defaultLedger) {
    defaultLedger = new EventLedger();
  }
  return defaultLedger;
}

export async function initEventLedger(): Promise<void> {
  await getEventLedger().init();
}
