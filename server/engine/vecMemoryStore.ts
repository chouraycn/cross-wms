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

/** 混合搜索默认配置 */
const DEFAULT_HYBRID_SEARCH = {
  enabled: true,
  vectorWeight: 0.7,
  textWeight: 0.3,
  candidateMultiplier: 3,
};

/** 文本分块默认配置 */
const DEFAULT_CHUNKING = {
  maxChars: 1000,
  overlapChars: 200,
};

/** MMR 去重默认配置 */
const DEFAULT_MMR = {
  enabled: true,
  lambda: 0.5,
};

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
setTimeout(async () => {
  try {
    const db = ensureEngine();
    await db.connect();
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
    // v9.2: 添加 FTS 全文搜索索引表（支持混合搜索）
    db.migrate('1.2.0', `
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        text,
        content='memory_entries',
        content_rowid='id',
        tokenize='unicode61'
      );
      CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_entries BEGIN
        INSERT INTO memory_fts(rowid, text) VALUES (new.id, new.text);
      END;
      CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_entries BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, text) VALUES('delete', old.id, old.text);
      END;
      CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory_entries BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, text) VALUES('delete', old.id, old.text);
        INSERT INTO memory_fts(rowid, text) VALUES (new.id, new.text);
      END;
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

export interface HybridSearchOptions {
  topK?: number;
  vectorWeight?: number;
  textWeight?: number;
  candidateMultiplier?: number;
  useMMR?: boolean;
  mmrLambda?: number;
  filters?: Record<string, unknown>;
}

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

// ===================== 工具函数 =====================

/**
 * 智能文本分块 —— 按句子/段落边界切分，保留重叠
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { maxChars = DEFAULT_CHUNKING.maxChars, overlapChars = DEFAULT_CHUNKING.overlapChars } =
    options;

  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  const sentenceEndings = ['。', '！', '？', '.', '!', '?', '\n'];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    if (end < text.length) {
      let bestCut = -1;
      const searchStart = Math.max(start + maxChars * 0.5, start);
      const searchEnd = end;

      for (const ending of sentenceEndings) {
        const idx = text.lastIndexOf(ending, searchEnd);
        if (idx >= searchStart && idx > bestCut) {
          bestCut = idx + ending.length;
        }
      }

      if (bestCut > start) {
        end = bestCut;
      }
    }

    chunks.push(text.slice(start, end).trim());

    if (end >= text.length) {
      break;
    }

    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * MMR (Maximal Marginal Relevance) 最大边界相关性去重
 * 平衡相关性和多样性，避免返回内容高度相似的结果
 */
function mmrReRank(
  results: Array<VecSearchResult & { embedding?: Float32Array }>,
  lambda: number = DEFAULT_MMR.lambda,
  topK: number = DEFAULT_TOP_K
): VecSearchResult[] {
  if (results.length <= topK) return results;

  const selected: VecSearchResult[] = [];
  const remaining = [...results];

  const getEmbedding = (r: typeof results[0]): Float32Array | null => {
    return r.embedding || null;
  };

  const cosineSimilarity = (a: Float32Array, b: Float32Array): number => {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  };

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = candidate.similarity;

      let maxDiversity = 0;
      if (selected.length > 0 && candidate.embedding) {
        const candEmb = getEmbedding(candidate);
        if (candEmb) {
          for (const sel of selected) {
            const selEmb = (sel as any).embedding;
            if (selEmb) {
              const sim = cosineSimilarity(candEmb, selEmb);
              maxDiversity = Math.max(maxDiversity, sim);
            }
          }
        }
      }

      const mmrScore = lambda * relevance - (1 - lambda) * maxDiversity;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected;
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
 * 混合搜索 —— 向量语义搜索 + FTS 全文搜索双路召回
 *
 * 参考 OpenClaw memory-search 架构：
 * 1. 向量搜索召回语义相关结果
 * 2. FTS 全文搜索召回关键词匹配结果
 * 3. 加权融合并使用 MMR 去重
 *
 * @param query 查询文本
 * @param options 混合搜索选项
 * @returns 融合排序后的记忆列表
 */
export async function hybridSearchMemory(
  query: string,
  options: HybridSearchOptions = {}
): Promise<VecSearchResult[]> {
  const {
    topK = DEFAULT_TOP_K,
    vectorWeight = DEFAULT_HYBRID_SEARCH.vectorWeight,
    textWeight = DEFAULT_HYBRID_SEARCH.textWeight,
    candidateMultiplier = DEFAULT_HYBRID_SEARCH.candidateMultiplier,
    useMMR = DEFAULT_MMR.enabled,
    mmrLambda = DEFAULT_MMR.lambda,
    filters = {},
  } = options;

  try {
    const db = ensureEngine();
    const candidateCount = topK * candidateMultiplier;

    const [vectorResults, ftsResults] = await Promise.allSettled([
      searchMemory(query, candidateCount, filters),
      ftsSearchMemory(query, candidateCount, filters),
    ]);

    const merged = new Map<number, { vectorScore: number; textScore: number; result: VecSearchResult }>();

    if (vectorResults.status === "fulfilled") {
      for (let i = 0; i < vectorResults.value.length; i++) {
        const r = vectorResults.value[i];
        const normalizedScore = 1 - i / vectorResults.value.length;
        merged.set(r.id, {
          vectorScore: Math.max(r.similarity, normalizedScore * 0.5),
          textScore: 0,
          result: r,
        });
      }
    }

    if (ftsResults.status === "fulfilled") {
      for (let i = 0; i < ftsResults.value.length; i++) {
        const r = ftsResults.value[i];
        const normalizedScore = 1 - i / ftsResults.value.length;
        const existing = merged.get(r.id);
        if (existing) {
          existing.textScore = Math.max(r.similarity, normalizedScore);
        } else {
          merged.set(r.id, {
            vectorScore: 0,
            textScore: Math.max(r.similarity, normalizedScore),
            result: r,
          });
        }
      }
    }

    let scoredResults: VecSearchResult[] = [];
    for (const entry of merged.values()) {
      const combinedScore = entry.vectorScore * vectorWeight + entry.textScore * textWeight;
      scoredResults.push({
        ...entry.result,
        similarity: combinedScore,
      });
    }

    scoredResults.sort((a, b) => b.similarity - a.similarity);

    if (useMMR && scoredResults.length > topK) {
      scoredResults = mmrReRank(scoredResults, mmrLambda, topK);
    }

    const finalResults = scoredResults.slice(0, topK);

    logger.debug(
      `[VecMemory] 混合搜索: query="${query.slice(0, 50)}..., ` +
      `vector=${vectorResults.status === "fulfilled" ? vectorResults.value.length : "fail"}, ` +
      `fts=${ftsResults.status === "fulfilled" ? ftsResults.value.length : "fail"}, ` +
      `merged=${merged.size}, final=${finalResults.length}`
    );

    return finalResults;
  } catch (err) {
    logger.warn('[VecMemory] 混合搜索失败，降级到纯向量搜索:', err);
    return searchMemory(query, topK, filters);
  }
}

/**
 * FTS 全文搜索记忆
 *
 * @param query 查询文本
 * @param topK 返回数量
 * @param filters 过滤条件
 * @returns 匹配的记忆列表
 */
function ftsSearchMemory(
  query: string,
  topK: number = DEFAULT_TOP_K,
  filters: Record<string, unknown> = {}
): Promise<VecSearchResult[]> {
  return new Promise((resolve) => {
    try {
      const db = ensureEngine();

      const ftsQuery = query
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((w) => `"${w.replace(/"/g, '""')}"`)
        .join(" OR ");

      if (!ftsQuery) {
        resolve([]);
        return;
      }

      const rows = db.all<{
        id: number;
        text: string;
        metadata: string;
        rank: number;
      }>(`
        SELECT e.id, e.text, e.metadata, f.rank
        FROM memory_fts f
        JOIN memory_entries e ON e.id = f.rowid
        WHERE memory_fts MATCH ?
        ORDER BY f.rank
        LIMIT ?
      `, [ftsQuery, topK]);

      const results: VecSearchResult[] = [];
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
            similarity: Math.max(0, 1 - row.rank / 10),
          });
        }
      }

      resolve(results);
    } catch (err) {
      logger.warn('[VecMemory] FTS 搜索失败:', err);
      resolve([]);
    }
  });
}

/**
 * 批量插入带分块的记忆
 * 大文本自动分块后分别存储，保持上下文关联
 *
 * @param text 原始文本
 * @param metadata 元数据
 * @param chunkOptions 分块选项
 * @returns 所有插入的记忆 ID
 */
export async function insertMemoryWithChunks(
  text: string,
  metadata: Record<string, unknown> = {},
  chunkOptions: ChunkOptions = {}
): Promise<number[]> {
  const chunks = chunkText(text, chunkOptions);

  if (chunks.length === 1) {
    const id = await insertMemory(text, metadata);
    return [id];
  }

  const ids: number[] = [];
  const parentId = metadata.parentId || `chunk-group-${Date.now()}`;

  for (let i = 0; i < chunks.length; i++) {
    const chunkMetadata = {
      ...metadata,
      parentId,
      chunkIndex: i,
      totalChunks: chunks.length,
      isChunk: true,
    };
    const id = await insertMemory(chunks[i], chunkMetadata);
    ids.push(id);
  }

  logger.debug(`[VecMemory] 分块插入: 原文 ${text.length} 字, 分成 ${chunks.length} 块`);
  return ids;
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
