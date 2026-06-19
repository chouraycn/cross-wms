import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db.js';
import type { Session, Folder, Message } from '../db.js';
import Database from 'better-sqlite3';
import { logger } from '../logger.js';

// ===================== Chat Session DAO =====================

// v2.8.2: 预编译 prepared statements — 避免每次 addMessage 调用都重新解析 SQL
const stmtCache: {
  insertMessage?: Database.Statement;
  updateSessionMeta?: Database.Statement;
  selectSessionTitle?: Database.Statement;
  countSessionMessages?: Database.Statement;
  updateSessionTitle?: Database.Statement;
} = {};

function getStmts(db: Database.Database): typeof stmtCache {
  if (!stmtCache.insertMessage) {
    stmtCache.insertMessage = db.prepare(
      'INSERT INTO messages (id, sessionId, role, content, model, timestamp, toolCalls, skillId, thinking, thinkingDuration, attachments) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    );
    stmtCache.updateSessionMeta = db.prepare(
      'UPDATE sessions SET updatedAt = ?, lastActiveAt = ?, sessionDate = DATE(?) WHERE id = ?'
    );
    stmtCache.selectSessionTitle = db.prepare('SELECT title FROM sessions WHERE id = ?');
    stmtCache.countSessionMessages = db.prepare('SELECT COUNT(*) as count FROM messages WHERE sessionId = ?');
    stmtCache.updateSessionTitle = db.prepare('UPDATE sessions SET title = ? WHERE id = ?');
  }
  return stmtCache;
}

// v2.8.2: 延迟会话元数据更新 — 批量合并同一 tick 内的多个更新
interface PendingSessionUpdate {
  sessionId: string;
  now: string;
  role: string;
  content: string;
}
let pendingUpdates: PendingSessionUpdate[] = [];
let deferredScheduled = false;

/**
 * 延迟执行会话元数据更新 + 首条消息标题生成
 * 多个 addMessage 调用在同一 tick 内触发时，合并为单次 setImmediate + 单个事务
 */
function scheduleSessionUpdate(sessionId: string, now: string, role: string, content: string): void {
  pendingUpdates.push({ sessionId, now, role, content });
  if (!deferredScheduled) {
    deferredScheduled = true;
    setImmediate(flushSessionUpdates);
  }
}

function flushSessionUpdates(): void {
  const batch = pendingUpdates;
  pendingUpdates = [];
  deferredScheduled = false;
  if (batch.length === 0) return;

  try {
    const db = initDb();
    const stmts = getStmts(db);
    const tx = db.transaction(() => {
      for (const upd of batch) {
        // 1. 更新会话元数据（updatedAt, lastActiveAt, sessionDate）
        stmts.updateSessionMeta!.run(upd.now, upd.now, upd.now, upd.sessionId);

        // 2. 首条用户消息自动生成标题
        if (upd.role === 'user') {
          const session = stmts.selectSessionTitle!.get(upd.sessionId) as { title: string } | undefined;
          if (session && (session.title === '新对话' || !session.title)) {
            const msgCount = stmts.countSessionMessages!.get(upd.sessionId) as { count: number };
            if (msgCount.count <= 1) {
              const autoTitle = upd.content.slice(0, 30).replace(/\n/g, ' ').trim() || '新对话';
              stmts.updateSessionTitle!.run(autoTitle, upd.sessionId);
            }
          }
        }
      }
    });
    tx();
  } catch (e) {
    logger.error('[DAO] flushSessionUpdates 失败:', e);
  }
}

export function getSessions(): Session[] {
  const db = initDb();
  return db.prepare(`
    SELECT s.*, COUNT(m.id) as messageCount
    FROM sessions s
    LEFT JOIN messages m ON s.id = m.sessionId
    GROUP BY s.id
    ORDER BY s.updatedAt DESC
  `).all() as Session[];
}

/** 搜索会话（按标题模糊匹配） */
export function searchSessions(query: string): Session[] {
  const db = initDb();
  const q = `%${query}%`;
  return db.prepare(`
    SELECT s.*, COUNT(m.id) as messageCount
    FROM sessions s
    LEFT JOIN messages m ON s.id = m.sessionId
    WHERE s.title LIKE ?
    GROUP BY s.id
    ORDER BY s.updatedAt DESC
  `).all(q) as Session[];
}

export function createSession(id: string, title: string, model: string, agentId?: string, folderId?: string | null, parentSessionId?: string | null, tags?: string[]): Session {
  const now = new Date().toISOString();
  const db = initDb();
  db.prepare(`
    INSERT INTO sessions (id, title, model, agentId, folderId, createdAt, updatedAt, status, lastActiveAt, sessionDate, parentSessionId, tags)
    VALUES (?,?,?,?,?,?,?, 'active', ?, DATE(?), ?, ?)
  `).run(
    id, title, model, agentId || null, folderId || null, now, now,
    now, now,
    parentSessionId || null,
    JSON.stringify(tags || [])
  );
  return { id, title, model, agentId, folderId: folderId || null, createdAt: now, updatedAt: now, status: 'active', lastActiveAt: now, sessionDate: now.split('T')[0], parentSessionId: parentSessionId || null, tags: JSON.stringify(tags || []) };
}

export function getSessionMessages(sessionId: string): Message[] {
  const db = initDb();
  return db.prepare('SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp ASC').all(sessionId) as Message[];
}

export function addMessage(msg: Omit<Message, 'id' | 'timestamp'> & { id?: string }): Message {
  const id = msg.id || uuidv4();
  const now = new Date().toISOString();
  const db = initDb();
  const stmts = getStmts(db);

  // v2.8.2: 仅 INSERT 同步执行（WAL 模式下追加写入，~0.1ms）
  // 返回值需要 id + timestamp，所以 INSERT 不能延迟
  stmts.insertMessage!.run(
    id, msg.sessionId, msg.role, msg.content, msg.model || null, now,
    msg.toolCalls || null, msg.skillId || null, msg.thinking || null,
    msg.thinkingDuration ?? null, msg.attachments ? JSON.stringify(msg.attachments) : null
  );

  // v2.8.2: 延迟会话元数据更新 + 标题生成 — 不阻塞 SSE 响应
  // 原来: 3-5 次同步 SQL（INSERT + UPDATE + SELECT + SELECT + UPDATE）
  // 现在: 1 次同步 INSERT + 延迟的批量事务（setImmediate 合并同一 tick 的多个更新）
  scheduleSessionUpdate(msg.sessionId, now, msg.role, msg.content);

  return { ...msg, id, timestamp: now };
}

export function deleteSession(id: string): void {
  const db = initDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

// ===================== Folder DAO =====================

export function getFolders(): Folder[] {
  const db = initDb();
  return db.prepare('SELECT * FROM folders ORDER BY sortOrder ASC, createdAt ASC').all() as Folder[];
}

export function createFolder(name: string, parentId?: string | null): Folder {
  const id = uuidv4();
  const now = new Date().toISOString();
  const db = initDb();
  // 计算当前最大 sortOrder
  const max = db.prepare('SELECT MAX(sortOrder) as maxSort FROM folders WHERE parentId IS ?').get(parentId || null) as { maxSort: number | null };
  const sortOrder = (max?.maxSort ?? -1) + 1;
  db.prepare('INSERT INTO folders (id, name, parentId, sortOrder, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(
    id, name, parentId || null, sortOrder, now, now
  );
  return { id, name, parentId: parentId || null, sortOrder, createdAt: now, updatedAt: now };
}

export function updateFolder(id: string, name: string): Folder | undefined {
  const now = new Date().toISOString();
  const db = initDb();
  db.prepare('UPDATE folders SET name = ?, updatedAt = ? WHERE id = ?').run(name, now, id);
  return db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Folder | undefined;
}

export function deleteFolder(id: string): void {
  const db = initDb();
  // 关联的会话 folderId 会被 SET NULL（外键约束）
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
}

export function moveSessionToFolder(sessionId: string, folderId: string | null): void {
  const now = new Date().toISOString();
  const db = initDb();
  db.prepare('UPDATE sessions SET folderId = ?, updatedAt = ? WHERE id = ?').run(folderId || null, now, sessionId);
}

// ===================== Skill Usage Statistics DAO =====================

/** 获取单个技能的使用统计 */
export function getSkillUsageStats(skillId: string): { totalUses: number; lastUsedAt: string | null } {
  const db = initDb();
  const result = db.prepare(`SELECT COUNT(*) as count, MAX(timestamp) as lastUsed FROM messages WHERE skillId = ?`).get(skillId) as { count: number; lastUsed: string | null };
  return {
    totalUses: result.count,
    lastUsedAt: result.lastUsed,
  };
}

/** 批量获取多个技能的使用统计 */
export function getBatchSkillUsageStats(skillIds: string[]): Map<string, { totalUses: number; lastUsedAt: string | null }> {
  const db = initDb();
  const statsMap = new Map<string, { totalUses: number; lastUsedAt: string | null }>();

  // 初始化所有技能 ID 为 0
  for (const id of skillIds) {
    statsMap.set(id, { totalUses: 0, lastUsedAt: null });
  }

  if (skillIds.length === 0) {
    return statsMap;
  }

  // 批量查询
  const placeholders = skillIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT skillId, COUNT(*) as count, MAX(timestamp) as lastUsed FROM messages WHERE skillId IN (${placeholders}) GROUP BY skillId`).all(...skillIds) as Array<{ skillId: string; count: number; lastUsed: string | null }>;

  // 更新统计结果
  for (const row of rows) {
    if (row.skillId) {
      statsMap.set(row.skillId, {
        totalUses: row.count,
        lastUsedAt: row.lastUsed,
      });
    }
  }

  return statsMap;
}
