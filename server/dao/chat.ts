import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db.js';
import type { Session, Folder, Message } from '../db.js';

// ===================== Chat Session DAO =====================

export function getSessions(): Session[] {
  const db = initDb();
  return db.prepare('SELECT * FROM sessions ORDER BY updatedAt DESC').all() as Session[];
}

/** 搜索会话（按标题模糊匹配） */
export function searchSessions(query: string): Session[] {
  const db = initDb();
  const q = `%${query}%`;
  return db.prepare('SELECT * FROM sessions WHERE title LIKE ? ORDER BY updatedAt DESC').all(q) as Session[];
}

export function createSession(id: string, title: string, model: string, agentId?: string, folderId?: string | null): Session {
  const now = new Date().toISOString();
  const db = initDb();
  db.prepare('INSERT INTO sessions (id, title, model, agentId, folderId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)').run(
    id, title, model, agentId || null, folderId || null, now, now
  );
  return { id, title, model, agentId, folderId: folderId || null, createdAt: now, updatedAt: now };
}

export function getSessionMessages(sessionId: string): Message[] {
  const db = initDb();
  return db.prepare('SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp ASC').all(sessionId) as Message[];
}

export function addMessage(msg: Omit<Message, 'id' | 'timestamp'> & { id?: string }): Message {
  const id = msg.id || uuidv4();
  const now = new Date().toISOString();
  const db = initDb();
  db.prepare('INSERT INTO messages (id, sessionId, role, content, model, timestamp, toolCalls, skillId, thinking, thinkingDuration, attachments) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
    id, msg.sessionId, msg.role, msg.content, msg.model || null, now, msg.toolCalls || null, msg.skillId || null, msg.thinking || null, msg.thinkingDuration ?? null, msg.attachments ? JSON.stringify(msg.attachments) : null
  );
  db.prepare('UPDATE sessions SET updatedAt = ? WHERE id = ?').run(now, msg.sessionId);
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
