/**
 * Vector Memory Store
 *
 * 基于 sqlite-vec 的向量记忆存储引擎。
 * 负责将对话记忆以向量形式存入 SQLite，支持语义搜索。
 *
 * v9.0: 改为使用 SQLiteEngine 封装独立数据库（long_term_memory.db）
 * - 使用 FLOAT32[384] 向量维度（ONNX all-MiniLM-L6-v2）
 * - 保留原有 API 兼容性
 *
 * v9.1: 使用真实 ONNX 语义嵌入替代 mock embedding
 * - 调用 onnxEmbedding.embedText 生成真实语义向量
 * - 记忆搜索具备真正的语义相关性
 */

import path from 'path';
import { SQLiteEngine } from '../storage/SQLiteEngine.js';
import { logger } from '../logger.js';
import { embedText, ONNX_EMBEDDING_DIMENSIONS } from './onnxEmbedding.js';
import { AppPaths } from '../config/appPaths.js';

// ===================== 常量定义 =====================

const MEMORY_DIR = AppPaths.memoryDir;
const DB_PATH = path.join(MEMORY_DIR, 'long_term_memory.db');

/** 向量维度（all-MiniLM-L6-v2: 384 维） */
const VECTOR_DIMENSIONS = ONNX_EMBEDDING_DIMENSIONS;

/** 最大返回记忆数 */
const DEFAULT_TOP_K = 5;

// ===================== 初始化 =====================

let engine: SQLiteEngine | null = null;

function ensureEngine(): SQLiteEngine {
  if (!engine) {
    engine = new SQLiteEngine(DB_PATH);
    engine.connect().catch((err) => {
      logger.error('[VecMemory] 数据库连接失败:', err);
    });
  }
  return engine;
}

// 延迟建表
setTimeout(() => {
  try {
    const db = ensureEngine();
    db.migrate('1.0.0', `
      CREATE TABLE IF NOT EXISTS memory_entries (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        text        TEXT    NOT NULL,
        metadata    TEXT,               -- JSON object
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // v9.1: 重建向量索引表（维度从 1536 改为 384）
    db.migrate('1.1.0', `
      DROP TABLE IF EXISTS memory_vec_index;
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec_index USING vec0(
        embedding FLOAT32[${VECTOR_DIMENSIONS}] distance_metric=cosine
      );
    `);
  } catch (err) {
    logger.error('[VecMemory] 初始化 schema 失败:', err);
  }
}, 0);

// ===================== 类型定义 =====================

export interface VecSearchResult {
  id: number;
  text: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

// ===================== 核心函数 =====================

/**
 * 插入记忆
 *
 * 流程：
 * 1. 生成文本的向量表示（mock embedding）
 * 2. 插入 memory_entries 表
 * 3. 插入 memory_vec_index 向量索引
 *
 * @param text 记忆文本
 * @param metadata 元数据（如 sessionId、role 等）
 * @returns 记忆 ID
 */
export async function insertMemory(
  text: string,
  metadata: Record<string, unknown> = {}
): Promise<number> {
  try {
    const db = ensureEngine();

    // 1. 插入记忆记录
    const metaJson = JSON.stringify(metadata);
    const result = db.run(
      `INSERT INTO memory_entries (text, metadata, created_at)
       VALUES (?, ?, datetime('now'))`,
      [text, metaJson]
    );
    const id = Number(result.lastInsertRowid);

    // 2. 生成真实语义向量（ONNX all-MiniLM-L6-v2, 384维）
    const embedding = await embedText(text);
    const embeddingBuf = Buffer.from(
      embedding.buffer,
      embedding.byteOffset,
      embedding.byteLength
    );

    // 3. 插入向量索引
    db.run(
      `INSERT INTO memory_vec_index (rowid, embedding) VALUES (?, ?)`,
      [id, embeddingBuf]
    );

    logger.debug(`[VecMemory] 插入记忆: id=${id}, text="${text.slice(0, 50)}..."`);
    return id;
  } catch (err) {
    logger.error('[VecMemory] 插入记忆失败:', err);
    throw new Error(`插入记忆失败: ${(err as Error).message}`);
  }
}

/**
 * 批量回填已有记忆的 embedding（升级迁移用）
 * 使用真实 ONNX 语义向量重新生成
 */
export async function backfillEmbeddings(): Promise<{ total: number; success: number; failed: number }> {
  try {
    const db = ensureEngine();

    // v9.1: 由于维度变更（1536→384），先清空旧的向量索引，全量重新生成
    db.run(`DELETE FROM memory_vec_index`);

    // 查询所有记忆
    const rows = db.all<{ id: number; text: string }>(`
      SELECT id, text FROM memory_entries ORDER BY id
    `);

    let success = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const embedding = await embedText(row.text);
        const embeddingBuf = Buffer.from(
          embedding.buffer,
          embedding.byteOffset,
          embedding.byteLength
        );

        db.run(
          `INSERT INTO memory_vec_index (rowid, embedding) VALUES (?, ?)`,
          [row.id, embeddingBuf]
        );
        success++;
      } catch {
        failed++;
      }
    }

    logger.info(`[VecMemory] 回填完成: total=${rows.length}, success=${success}, failed=${failed}`);
    return { total: rows.length, success, failed };
  } catch (err) {
    logger.error('[VecMemory] 回填失败:', err);
    return { total: 0, success: 0, failed: 0 };
  }
}

/**
 * 搜索记忆
 *
 * 流程：
 * 1. 生成查询文本的向量表示
 * 2. 使用 sqlite-vec 进行向量相似度搜索
 *
 * @param query 查询文本
 * @param topK 返回数量
 * @param filters 过滤条件（如 sessionId）
 * @returns 匹配的记忆列表
 */
export async function searchMemory(
  query: string,
  topK: number = DEFAULT_TOP_K,
  filters: Record<string, unknown> = {}
): Promise<VecSearchResult[]> {
  try {
    const db = ensureEngine();

    // 生成查询的真实语义向量
    const queryEmbedding = await embedText(query);
    const embeddingBuf = Buffer.from(
      queryEmbedding.buffer,
      queryEmbedding.byteOffset,
      queryEmbedding.byteLength
    );

    // 向量搜索
    const rows = db.all<{
      id: number;
      text: string;
      metadata: string;
      distance: number;
    }>(`
      SELECT e.id, e.text, e.metadata, v.distance
      FROM memory_vec_index v
      JOIN memory_entries e ON e.id = v.rowid
      WHERE v.embedding MATCH ?
      ORDER BY v.distance
      LIMIT ?
    `, [embeddingBuf, topK]);

    // 应用过滤条件并反序列化
    const results: VecSearchResult[] = [];
    for (const row of rows) {
      const metadata = JSON.parse(row.metadata || '{}') as Record<string, unknown>;

      // 应用过滤条件
      let match = true;
      for (const [key, value] of Object.entries(filters)) {
        if (metadata[key] !== value) {
          match = false;
          break;
        }
      }

      if (match) {
        results.push({
          id: row.id,
          text: row.text,
          metadata,
          similarity: 1 - row.distance, // 距离转相似度
        });
      }
    }

    logger.debug(`[VecMemory] 搜索记忆: query="${query.slice(0, 50)}...", results=${results.length}`);
    return results;
  } catch (err) {
    logger.error('[VecMemory] 搜索记忆失败:', err);
    throw new Error(`搜索记忆失败: ${(err as Error).message}`);
  }
}

/**
 * 删除记忆
 *
 * @param id 记忆 ID
 * @returns 是否删除成功
 */
export function deleteMemory(id: number): boolean {
  try {
    const db = ensureEngine();

    // 删除向量索引
    db.run(`DELETE FROM memory_vec_index WHERE rowid = ?`, [id]);

    // 删除记忆记录
    const result = db.run(`DELETE FROM memory_entries WHERE id = ?`, [id]);

    logger.debug(`[VecMemory] 删除记忆: id=${id}`);
    return result.changes > 0;
  } catch (err) {
    logger.error('[VecMemory] 删除记忆失败:', err);
    return false;
  }
}

/**
 * 获取记忆详情
 *
 * @param id 记忆 ID
 * @returns 记忆详情
 */
export function getMemory(id: number): {
  id: number;
  text: string;
  metadata: Record<string, unknown>;
  createdAt: string;
} | null {
  try {
    const db = ensureEngine();
    const row = db.get<{
      id: number;
      text: string;
      metadata: string;
      created_at: string;
    }>(`SELECT * FROM memory_entries WHERE id = ?`, [id]);

    if (!row) return null;

    return {
      id: row.id,
      text: row.text,
      metadata: JSON.parse(row.metadata || '{}') as Record<string, unknown>,
      createdAt: row.created_at,
    };
  } catch (err) {
    logger.error('[VecMemory] 获取记忆失败:', err);
    return null;
  }
}

/**
 * 获取最近插入的记忆
 *
 * @param limit 数量限制
 * @param filters 过滤条件
 * @returns 记忆列表
 */
export function getRecentMemories(
  limit: number = 10,
  filters: Record<string, unknown> = {}
): Array<{
  id: number;
  text: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}> {
  try {
    const db = ensureEngine();

    // 如果有过滤条件，需要全量加载后过滤
    if (Object.keys(filters).length > 0) {
      const rows = db.all<{
        id: number;
        text: string;
        metadata: string;
        created_at: string;
      }>(`
        SELECT * FROM memory_entries
        ORDER BY created_at DESC
      `);

      const results: Array<{
        id: number;
        text: string;
        metadata: Record<string, unknown>;
        createdAt: string;
      }> = [];

      for (const row of rows) {
        const metadata = JSON.parse(row.metadata || '{}') as Record<string, unknown>;

        let match = true;
        for (const [key, value] of Object.entries(filters)) {
          if (metadata[key] !== value) {
            match = false;
            break;
          }
        }

        if (match) {
          results.push({
            id: row.id,
            text: row.text,
            metadata,
            createdAt: row.created_at,
          });
          if (results.length >= limit) break;
        }
      }

      return results;
    }

    // 无过滤条件，直接查询
    const rows = db.all<{
      id: number;
      text: string;
      metadata: string;
      created_at: string;
    }>(`
      SELECT * FROM memory_entries
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);

    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      metadata: JSON.parse(row.metadata || '{}') as Record<string, unknown>,
      createdAt: row.created_at,
    }));
  } catch (err) {
    logger.error('[VecMemory] 获取最近记忆失败:', err);
    return [];
  }
}

/**
 * 清空所有记忆
 *
 * @returns 是否清空成功
 */
export function clearAllMemories(): boolean {
  try {
    const db = ensureEngine();
    db.run(`DELETE FROM memory_vec_index`);
    db.run(`DELETE FROM memory_entries`);
    logger.info('[VecMemory] 清空所有记忆');
    return true;
  } catch (err) {
    logger.error('[VecMemory] 清空记忆失败:', err);
    return false;
  }
}

/**
 * 获取记忆统计
 *
 * @returns 统计信息
 */
export function getMemoryStats(): {
  totalMemories: number;
  avgTextLength: number;
} {
  try {
    const db = ensureEngine();
    const row = db.get<{
      total: number;
      avg_length: number;
    }>(`
      SELECT
        COUNT(*) as total,
        COALESCE(AVG(LENGTH(text)), 0) as avg_length
      FROM memory_entries
    `);

    return {
      totalMemories: row?.total ?? 0,
      avgTextLength: Math.round((row?.avg_length ?? 0) * 100) / 100,
    };
  } catch (err) {
    logger.error('[VecMemory] 获取统计失败:', err);
    return { totalMemories: 0, avgTextLength: 0 };
  }
}

// ===================== 兼容旧 API =====================

/**
 * 写入记忆（兼容旧 API）
 * 支持两种调用方式：
 *   writeMemory(text, metadata) 或 writeMemory({ userId, sessionId, category, content, keywords })
 */
export async function writeMemory(
  textOrObj: string | Record<string, unknown>,
  metadata?: Record<string, unknown>
): Promise<number> {
  if (typeof textOrObj === 'string') {
    return insertMemory(textOrObj, metadata || {});
  }
  // 对象形式：{ userId, sessionId, category, content, keywords }
  const obj = textOrObj;
  const text = (obj.content as string) || '';
  const meta: Record<string, unknown> = {};
  if (obj.userId) meta.userId = obj.userId;
  if (obj.sessionId) meta.sessionId = obj.sessionId;
  if (obj.category) meta.category = obj.category;
  if (obj.keywords) meta.keywords = obj.keywords;
  return insertMemory(text, meta);
}

/**
 * 搜索记忆（兼容旧 API）
 * 支持多种调用方式：
 *   searchMemory(query, topK, filters)
 *   searchMemory(query, category, topK, threshold, sessionId)
 */
export async function searchMemoryCompat(
  query: string,
  arg2?: string | number,
  arg3?: number | Record<string, unknown>,
  arg4?: number,
  arg5?: string
): Promise<VecSearchResult[]> {
  let topK = DEFAULT_TOP_K;
  let filters: Record<string, unknown> = {};

  if (typeof arg2 === 'number') {
    topK = arg2;
    if (arg3 && typeof arg3 === 'object') {
      filters = arg3;
    }
  } else if (typeof arg2 === 'string') {
    // 旧 API: searchMemory(query, category, topK, threshold, sessionId)
    if (arg2 && arg2 !== 'default') filters.category = arg2;
    if (typeof arg3 === 'number') topK = arg3;
    if (typeof arg5 === 'string') filters.sessionId = arg5;
  }

  return searchMemory(query, topK, filters);
}

// searchMemory 已在上方通过 export async function 导出

/**
 * 提取关键词（兼容旧 API）
 */
export function extractKeywords(_text: string, _maxCount?: number): string[] {
  // 简单分词实现
  return _text.split(/\s+/).filter((w) => w.length > 2);
}
