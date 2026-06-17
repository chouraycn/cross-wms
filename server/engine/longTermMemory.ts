/**
 * LongTermMemory — 跨会话长期记忆
 *
 * v6.0: P1-1 简化版 — 使用 SQLite + 关键词匹配（不做向量检索）
 * - 存储：历史会话摘要、用户偏好、关键洞察
 * - 检索：关键词匹配，top-3 相关记忆注入 Reasoning
 * - 写入：Reflecting 结束后写入关键洞察
 *
 * 后续版本可引入 sqlite-vss 做向量检索
 */

import Database from 'better-sqlite3';
import path from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';

// ===================== 类型定义 =====================

export type MemoryCategory = 'insight' | 'preference' | 'summary';

export interface MemoryEntry {
  id?: number;
  userId: string;
  sessionId: string;
  category: MemoryCategory;
  content: string;
  keywords: string;
  createdAt: string;
}

export interface MemorySearchResult {
  entries: MemoryEntry[];
  totalTokens: number;
}

// ===================== 常量 =====================

const DB_DIR = path.join(homedir(), '.cdf-know-clow', 'memory');
const DB_PATH = path.join(DB_DIR, 'long_term_memory.db');
const MAX_INJECTION_TOKENS = 500;
const MAX_RETRIEVAL_COUNT = 3;

// ===================== LongTermMemory 类 =====================

/**
 * 跨会话长期记忆管理器。
 *
 * 使用 SQLite 存储历史摘要、用户偏好、关键洞察，
 * 通过关键词匹配检索最相关的记忆并注入 Reasoning 阶段。
 *
 * 特性：
 * - 自动创建数据库和索引
 * - 关键词匹配检索（任一关键词命中即可）
 * - 总量限制（保留最近 1000 条，超出自动清理）
 * - 中文 token 估算（约 1.5 字/token）
 */
export class LongTermMemory {
  private db: Database.Database;

  constructor() {
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true });
    }
    this.db = new Database(DB_PATH);
    this.initSchema();
  }

  /** 初始化数据库表和索引 */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL DEFAULT 'default',
        sessionId TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        keywords TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_keywords ON memory_entries(keywords);
      CREATE INDEX IF NOT EXISTS idx_category ON memory_entries(category);
      CREATE INDEX IF NOT EXISTS idx_created ON memory_entries(createdAt DESC);
    `);
  }

  /**
   * 写入记忆条目。
   *
   * @param entry - 记忆条目（不含 id 和 createdAt，由数据库自动生成）
   * @returns 新条目的 rowid
   */
  write(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): number {
    const stmt = this.db.prepare(
      'INSERT INTO memory_entries (userId, sessionId, category, content, keywords) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(entry.userId, entry.sessionId, entry.category, entry.content, entry.keywords);
    return Number(result.lastInsertRowid);
  }

  /**
   * 关键词检索记忆。
   * 使用 LIKE 模糊匹配，任一关键词命中即可（OR 逻辑）。
   * 结果按创建时间倒序，最多返回 limit 条。
   *
   * @param query - 搜索查询文本（会被拆分为关键词）
   * @param userId - 用户 ID（默认 'default'）
   * @param limit - 最大返回条数（默认 3）
   * @returns 检索结果列表和估算 token 数
   */
  search(query: string, userId: string = 'default', limit: number = MAX_RETRIEVAL_COUNT): MemorySearchResult {
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 1);
    if (keywords.length === 0) return { entries: [], totalTokens: 0 };

    // 构建 LIKE 条件（任一关键词匹配即可）
    const conditions = keywords.map(() => `keywords LIKE ?`).join(' OR ');
    const params: (string | number)[] = [userId, ...keywords.map(k => `%${k}%`), limit];

    const stmt = this.db.prepare(
      `SELECT * FROM memory_entries WHERE userId = ? AND (${conditions}) ORDER BY createdAt DESC LIMIT ?`
    );
    const entries = stmt.all(...params) as MemoryEntry[];

    // 估算 token 数（中文约 1.5 字/token）
    const totalTokens = Math.ceil(entries.reduce((sum, e) => sum + e.content.length, 0) / 1.5);

    return { entries, totalTokens };
  }

  /**
   * 清理旧记忆（保留最近 maxEntries 条）。
   *
   * @param maxEntries - 最大保留条数（默认 1000）
   * @returns 删除的条数
   */
  prune(maxEntries: number = 1000): number {
    const result = this.db.prepare(
      `DELETE FROM memory_entries WHERE id NOT IN (
        SELECT id FROM memory_entries ORDER BY createdAt DESC LIMIT ?
      )`
    ).run(maxEntries);
    return result.changes;
  }

  /** 关闭数据库连接 */
  close(): void {
    this.db.close();
  }
}