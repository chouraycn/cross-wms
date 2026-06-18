/**
 * v6.0: 会话生命周期管理器
 *
 * 职责：
 * 1. 每日自动创建新 Session（基于日期）
 * 2. 60 分钟无交互后自动归档
 * 3. 归档会话可搜索、可恢复
 * 4. 子任务自动创建子 Session
 */

import { initDb, type Session, type SessionStatus } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { writeMemory } from '../engine/vecMemoryStore.js';

// ===================== 常量 =====================

/** 空闲归档阈值（毫秒）：60 分钟 */
const IDLE_ARCHIVE_THRESHOLD_MS = 60 * 60 * 1000;

/** 空闲检测间隔（毫秒）：5 分钟 */
const IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** 每日重置检测间隔（毫秒）：30 秒 */
const DAILY_RESET_CHECK_INTERVAL_MS = 30 * 1000;

/** 归档时自动生成摘要的最大消息数 */
const SUMMARY_MAX_MESSAGES = 10;

// ===================== DAO 扩展 =====================

/** 获取所有活跃会话 */
export function getActiveSessions(): Session[] {
  const db = initDb();
  return db.prepare(`
    SELECT s.*, COUNT(m.id) as messageCount
    FROM sessions s
    LEFT JOIN messages m ON s.id = m.sessionId
    WHERE s.status = 'active' OR s.status IS NULL
    GROUP BY s.id
    ORDER BY s.updatedAt DESC
  `).all() as Session[];
}

/** 获取所有归档会话 */
export function getArchivedSessions(): Session[] {
  const db = initDb();
  return db.prepare(`
    SELECT s.*, COUNT(m.id) as messageCount
    FROM sessions s
    LEFT JOIN messages m ON s.id = m.sessionId
    WHERE s.status = 'archived'
    GROUP BY s.id
    ORDER BY s.archivedAt DESC
  `).all() as Session[];
}

/** 搜索归档会话（标题 + 摘要 + 标签） */
export function searchArchivedSessions(query: string): Session[] {
  const db = initDb();
  const q = `%${query}%`;
  return db.prepare(`
    SELECT s.*, COUNT(m.id) as messageCount
    FROM sessions s
    LEFT JOIN messages m ON s.id = m.sessionId
    WHERE s.status = 'archived'
      AND (s.title LIKE ? OR s.summary LIKE ? OR s.tags LIKE ?)
    GROUP BY s.id
    ORDER BY s.archivedAt DESC
  `).all(q, q, q) as Session[];
}

/** 归档会话 */
export function archiveSession(sessionId: string, summary?: string): boolean {
  const db = initDb();
  const now = new Date().toISOString();

  // 如果未提供摘要，从消息中自动生成
  if (!summary) {
    summary = generateSessionSummary(sessionId);
  }

  const info = db.prepare(`
    UPDATE sessions SET
      status = 'archived',
      archivedAt = ?,
      summary = COALESCE(?, summary),
      updatedAt = ?
    WHERE id = ? AND (status = 'active' OR status IS NULL OR status = 'daily_reset')
  `).run(now, summary, now, sessionId);

  // v8.6: 归档时自动将会话摘要写入向量记忆（异步，不阻塞归档）
  if (info.changes > 0 && summary) {
    writeMemory({
      userId: 'default',
      sessionId,
      category: 'conversation',
      content: `[会话摘要] ${summary}`,
      keywords: summary.substring(0, 80).toLowerCase(),
    }).catch(e => console.warn('[SessionLifecycle] 会话摘要 embedding 失败:', e));
  }

  return info.changes > 0;
}

/** 恢复归档会话 */
export function restoreSession(sessionId: string): boolean {
  const db = initDb();
  const now = new Date().toISOString();

  const info = db.prepare(`
    UPDATE sessions SET
      status = 'active',
      archivedAt = NULL,
      lastActiveAt = ?,
      sessionDate = DATE(?),
      updatedAt = ?
    WHERE id = ? AND status = 'archived'
  `).run(now, now, now, sessionId);

  return info.changes > 0;
}

/** 更新会话最后活跃时间（每次发送/接收消息时调用） */
export function touchSession(sessionId: string): void {
  const db = initDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE sessions SET lastActiveAt = ?, updatedAt = ?, sessionDate = DATE(?)
    WHERE id = ?
  `).run(now, now, now, sessionId);
}

/** 获取子会话列表 */
export function getSubSessions(parentSessionId: string): Session[] {
  const db = initDb();
  return db.prepare(`
    SELECT s.*, COUNT(m.id) as messageCount
    FROM sessions s
    LEFT JOIN messages m ON s.id = m.sessionId
    WHERE s.parentSessionId = ?
    GROUP BY s.id
    ORDER BY s.createdAt ASC
  `).all(parentSessionId) as Session[];
}

/** 创建子会话（子任务自动触发） */
export function createSubSession(
  parentSessionId: string,
  title: string,
  model: string,
  tags?: string[]
): Session {
  const now = new Date().toISOString();
  const id = uuidv4();
  const db = initDb();

  // 继承父会话的 folderId 和 agentId
  const parent = db.prepare('SELECT * FROM sessions WHERE id = ?').get(parentSessionId) as Session | undefined;

  db.prepare(`
    INSERT INTO sessions (id, title, model, agentId, folderId, createdAt, updatedAt, status, lastActiveAt, sessionDate, parentSessionId, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, DATE(?), ?, ?)
  `).run(
    id, title, model,
    parent?.agentId || null,
    parent?.folderId || null,
    now, now,
    now, now,
    parentSessionId,
    JSON.stringify(tags || [])
  );

  return {
    id, title, model,
    agentId: parent?.agentId,
    folderId: parent?.folderId || null,
    createdAt: now, updatedAt: now,
    status: 'active',
    lastActiveAt: now,
    sessionDate: now.split('T')[0],
    parentSessionId,
    tags: JSON.stringify(tags || []),
  };
}

/** 获取今日活跃会话（按 sessionDate 筛选） */
export function getTodaySessions(): Session[] {
  const db = initDb();
  const today = new Date().toISOString().split('T')[0];
  return db.prepare(`
    SELECT s.*, COUNT(m.id) as messageCount
    FROM sessions s
    LEFT JOIN messages m ON s.id = m.sessionId
    WHERE s.sessionDate = ? AND (s.status = 'active' OR s.status IS NULL)
    GROUP BY s.id
    ORDER BY s.updatedAt DESC
  `).all(today) as Session[];
}

/** 永久删除归档会话 */
export function deleteArchivedSession(sessionId: string): boolean {
  const db = initDb();
  const info = db.prepare("DELETE FROM sessions WHERE id = ? AND status = 'archived'").run(sessionId);
  return info.changes > 0;
}

// ===================== 内部工具 =====================

/** 从会话消息中生成简要摘要 */
function generateSessionSummary(sessionId: string): string {
  try {
    const db = initDb();
    const messages = db.prepare(
      'SELECT role, content FROM messages WHERE sessionId = ? ORDER BY timestamp ASC LIMIT ?'
    ).all(sessionId, SUMMARY_MAX_MESSAGES * 2) as Array<{ role: string; content: string }>;

    if (messages.length === 0) return '';

    // 取第一条用户消息作为摘要基础
    const firstUserMsg = messages.find(m => m.role === 'user');
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');

    let summary = '';
    if (firstUserMsg) {
      summary = firstUserMsg.content.slice(0, 100);
    }
    if (lastAssistantMsg && messages.length > 2) {
      summary += ` → ${lastAssistantMsg.content.slice(0, 80)}`;
    }
    return summary.slice(0, 200);
  } catch {
    return '';
  }
}

// ===================== 生命周期管理器 =====================

export class SessionLifecycleManager {
  private idleCheckTimer: NodeJS.Timeout | null = null;
  private dailyResetTimer: NodeJS.Timeout | null = null;
  private lastKnownDate: string = '';
  private isRunning = false;

  /** 启动生命周期守护 */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastKnownDate = new Date().toISOString().split('T')[0];

    // 空闲归档检测
    this.idleCheckTimer = setInterval(() => {
      this.checkIdleSessions();
    }, IDLE_CHECK_INTERVAL_MS);

    // 每日重置检测
    this.dailyResetTimer = setInterval(() => {
      this.checkDailyReset();
    }, DAILY_RESET_CHECK_INTERVAL_MS);

    // 不阻止进程退出
    if (this.idleCheckTimer && typeof this.idleCheckTimer.unref === 'function') {
      this.idleCheckTimer.unref();
    }
    if (this.dailyResetTimer && typeof this.dailyResetTimer.unref === 'function') {
      this.dailyResetTimer.unref();
    }

    console.log(`[SessionLifecycle] 守护已启动 (idleThreshold=${IDLE_ARCHIVE_THRESHOLD_MS / 60000}min, checkInterval=${IDLE_CHECK_INTERVAL_MS / 60000}min)`);
  }

  /** 停止守护 */
  stop(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    if (this.dailyResetTimer) {
      clearInterval(this.dailyResetTimer);
      this.dailyResetTimer = null;
    }
    this.isRunning = false;
    console.log('[SessionLifecycle] 守护已停止');
  }

  /** 检测空闲会话并自动归档 */
  private checkIdleSessions(): void {
    try {
      const db = initDb();
      const threshold = new Date(Date.now() - IDLE_ARCHIVE_THRESHOLD_MS).toISOString();

      // 查找超过 60 分钟无交互的活跃会话
      const idleSessions = db.prepare(`
        SELECT id, title, lastActiveAt FROM sessions
        WHERE (status = 'active' OR status IS NULL)
          AND lastActiveAt IS NOT NULL
          AND lastActiveAt < ?
      `).all(threshold) as Array<{ id: string; title: string; lastActiveAt: string }>;

      if (idleSessions.length === 0) return;

      console.log(`[SessionLifecycle] 发现 ${idleSessions.length} 个空闲会话，自动归档...`);

      for (const session of idleSessions) {
        const success = archiveSession(session.id);
        if (success) {
          console.log(`[SessionLifecycle] 已归档空闲会话: "${session.title}" (idle since ${session.lastActiveAt})`);
        }
      }
    } catch (e) {
      console.error('[SessionLifecycle] 空闲检测异常:', e);
    }
  }

  /** 检测日期变更 → 触发每日重置 */
  private checkDailyReset(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today === this.lastKnownDate) return;

    console.log(`[SessionLifecycle] 检测到日期变更: ${this.lastKnownDate} → ${today}，执行每日重置...`);
    this.lastKnownDate = today;

    try {
      const db = initDb();

      // 将昨日及更早的活跃会话标记为 daily_reset（可恢复的中间态）
      const result = db.prepare(`
        UPDATE sessions SET
          status = 'daily_reset',
          updatedAt = ?
        WHERE (status = 'active' OR status IS NULL)
          AND sessionDate < ?
      `).run(new Date().toISOString(), today);

      console.log(`[SessionLifecycle] ✅ 每日重置完成: ${result.changes} 个会话标记为 daily_reset`);

      // 自动为今日创建新会话（仅当今日无活跃会话时）
      const todaySessions = getTodaySessions();
      if (todaySessions.length === 0) {
        const now = new Date().toISOString();
        const newId = uuidv4();
        db.prepare(`
          INSERT INTO sessions (id, title, model, createdAt, updatedAt, status, lastActiveAt, sessionDate)
          VALUES (?, ?, 'auto', ?, ?, 'active', ?, DATE(?))
        `).run(newId, `对话 ${today}`, now, now, now, now);
        console.log(`[SessionLifecycle] 已为 ${today} 创建新会话: ${newId}`);
      }
    } catch (e) {
      console.error('[SessionLifecycle] 每日重置异常:', e);
    }
  }

  /** 获取管理器状态（调试用） */
  getStatus(): { isRunning: boolean; lastKnownDate: string; idleThresholdMin: number } {
    return {
      isRunning: this.isRunning,
      lastKnownDate: this.lastKnownDate,
      idleThresholdMin: IDLE_ARCHIVE_THRESHOLD_MS / 60000,
    };
  }
}

/** 全局单例 */
export const sessionLifecycleManager = new SessionLifecycleManager();
