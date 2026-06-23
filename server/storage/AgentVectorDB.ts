// ============================================================================
// storage/AgentVectorDB.ts — Agent 向量索引库管理器
//
// 双层架构的第二层（专用向量索引层），每个 Agent 拥有独立的
// SQLite 数据库文件，存储 Chunk 原文 + Embedding 向量 + 文件引用。
//
// 文件路径：~/.cdf-know-clow/memory/{agentId}.sqlite
// ============================================================================

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import Database from 'better-sqlite3';

/** CDF Know Clow 记忆根目录 */
const MEMORY_ROOT = path.join(os.homedir(), '.cdf-know-clow', 'memory');

/**
 * Agent 向量索引库实例。
 *
 * 每个实例对应磁盘上一个独立的 SQLite 文件，
 * 内部包含 chunks 表（id, content, file_ref, chunk_index, created_at）、
 * chunks_fts 全文索引 和 chunks_vec 向量索引。
 * 支持向量相似度搜索与全文检索（FTS5）。
 */
export class AgentVectorDB {
  /** 记忆文件基础目录 */
  static baseDir: string = MEMORY_ROOT;

  /** 已打开的 Agent 数据库连接映射 */
  private static instances: Map<string, AgentVectorDB> = new Map();

  /** Agent ID → 数据库文件路径 */
  static getDbPath(agentId: string): string {
    return path.join(AgentVectorDB.baseDir, `${agentId}.sqlite`);
  }

  /** 打开（或创建）指定 Agent 的向量索引库 */
  static createOrOpen(agentId: string): AgentVectorDB {
    // 确保目录存在
    if (!fs.existsSync(AgentVectorDB.baseDir)) {
      fs.mkdirSync(AgentVectorDB.baseDir, { recursive: true });
    }

    // 如果已有打开的实例，直接返回
    const existing = AgentVectorDB.instances.get(agentId);
    if (existing) {
      return existing;
    }

    const instance = new AgentVectorDB(agentId);

    // 自动建表
    const db = instance.db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        file_ref TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content,
        chunk_id UNINDEXED
      )
    `);
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
        embedding FLOAT32[1536] distance_metric=cosine
      )
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_file_ref ON chunks(file_ref)
    `);

    AgentVectorDB.instances.set(agentId, instance);
    return instance;
  }

  /** 关闭并释放指定 Agent 的数据库连接（如果已打开） */
  static close(agentId: string): void {
    const instance = AgentVectorDB.instances.get(agentId);
    if (instance) {
      instance.db.close();
      AgentVectorDB.instances.delete(agentId);
    }
  }

  private agentId: string;
  private db: Database.Database;

  constructor(agentId: string) {
    this.agentId = agentId;
    const dbPath = AgentVectorDB.getDbPath(agentId);
    this.db = new Database(dbPath);
    // 启用 WAL 模式
    this.db.pragma('journal_mode = WAL');
  }

  // ==========================================================================
  // CRUD
  // ==========================================================================

  /**
   * 插入一个 Chunk。
   * 同时写入 chunks 表、chunks_fts 全文索引和 chunks_vec 向量索引。
   * embedding 为 Float32Array，通过 Buffer 写入 BLOB 列。
   */
  insertChunk(chunk: {
    id: string;
    content: string;
    embedding: Float32Array;
    fileRef: string;
  }): void {
    const { id, content, embedding, fileRef } = chunk;

    // 插入 chunks 表
    this.db
      .prepare(
        `INSERT OR REPLACE INTO chunks (id, content, file_ref, chunk_index)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, content, fileRef, 0);

    // 插入 chunks_fts 全文索引
    this.db
      .prepare(`INSERT INTO chunks_fts (content, chunk_id) VALUES (?, ?)`)
      .run(content, id);

    // 插入 chunks_vec 向量索引（使用 rowid 关联）
    // 获取 chunks 表对应此 id 的内部 rowid
    const row = this.db
      .prepare(`SELECT rowid FROM chunks WHERE id = ?`)
      .get(id) as { rowid: number } | undefined;
    if (row) {
      const embeddingBuf = Buffer.from(
        embedding.buffer,
        embedding.byteOffset,
        embedding.byteLength,
      );
      this.db
        .prepare(`INSERT INTO chunks_vec (rowid, embedding) VALUES (?, ?)`)
        .run(row.rowid, embeddingBuf);
    }
  }

  /**
   * 向量相似度搜索（KNN）。
   * 使用 sqlite-vec 的 vec0 虚拟表进行余弦相似度检索。
   * @returns 按距离升序排列的结果
   */
  searchChunks(
    embedding: Float32Array,
    limit: number,
  ): { id: string; content: string; distance: number; fileRef: string }[] {
    const embeddingBuf = Buffer.from(
      embedding.buffer,
      embedding.byteOffset,
      embedding.byteLength,
    );

    const rows = this.db
      .prepare(
        `SELECT c.id, c.content, c.file_ref, v.distance
         FROM chunks_vec v
         JOIN chunks c ON c.rowid = v.rowid
         WHERE v.embedding MATCH ?
         ORDER BY v.distance
         LIMIT ?`,
      )
      .all(embeddingBuf, limit) as {
      id: string;
      content: string;
      file_ref: string;
      distance: number;
    }[];

    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      fileRef: r.file_ref,
      distance: r.distance,
    }));
  }

  /**
   * 全文检索（FTS5）。
   * @returns 按相关性排列的结果
   */
  fullTextSearch(
    query: string,
    limit: number,
  ): { id: string; content: string; fileRef: string }[] {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.content, c.file_ref
         FROM chunks_fts f
         JOIN chunks c ON c.id = f.chunk_id
         WHERE chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(query, limit) as { id: string; content: string; file_ref: string }[];

    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      fileRef: r.file_ref,
    }));
  }

  /**
   * 删除指定 fileRef 的所有 Chunk。
   * 同步清理 chunks 表、chunks_fts 全文索引和 chunks_vec 向量索引。
   */
  deleteChunksByFileRef(fileRef: string): void {
    // 先删除向量索引中的条目
    this.db
      .prepare(
        `DELETE FROM chunks_vec WHERE rowid IN (SELECT rowid FROM chunks WHERE file_ref = ?)`,
      )
      .run(fileRef);

    // 再删除全文索引中的条目
    this.db
      .prepare(
        `DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE file_ref = ?)`,
      )
      .run(fileRef);

    // 最后删除 chunks 表数据
    this.db.prepare(`DELETE FROM chunks WHERE file_ref = ?`).run(fileRef);
  }

  /** 关闭当前数据库连接 */
  close(): void {
    this.db.close();
  }
}