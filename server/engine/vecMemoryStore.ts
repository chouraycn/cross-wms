/**
 * VecMemoryStore — 基于 sqlite-vec 的语义记忆存储
 *
 * 使用 sqlite-vec 扩展在 SQLite 中实现向量相似性搜索，
 * 替代原有的 LIKE 关键词匹配。
 *
 * 核心特性：
 * - vec0 虚拟表存储 384 维 float32 向量
 * - KNN 余弦相似性搜索（sqlite-vec 内建）
 * - 对话摘要 + 用户偏好 + 关键洞察 三类记忆
 * - 与 longTermMemory.db 共存，渐进式迁移
 *
 * 表结构：
 *   memory_vec_entries — 原始记忆文本（content/keywords/category/sessionId）
 *   memory_vec_index   — vec0 虚拟表，存储 embedding float[384]
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { embedText, embedBatch, initOnnxEmbedding, getOnnxStatus } from './onnxEmbedding.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

export type MemoryCategory = 'insight' | 'preference' | 'summary' | 'conversation';

export interface VecMemoryEntry {
  id?: number;
  userId: string;
  sessionId: string;
  category: MemoryCategory;
  content: string;
  keywords: string;
  createdAt: string;
}

export interface VecSearchResult {
  entry: VecMemoryEntry;
  similarity: number;
}

export interface VecMemoryStats {
  totalEntries: number;
  totalVectors: number;
  onnxStatus: string;
  onnxError: string;
}

// ===================== 常量 =====================

const DB_DIR = path.join(homedir(), '.cdf-know-clow', 'memory');
const DB_PATH = path.join(DB_DIR, 'long_term_memory.db');
const EMBEDDING_DIM = 384;
const MAX_INJECTION_TOKENS = 500;
const DEFAULT_TOP_K = 5;
const DEFAULT_THRESHOLD = 0.35;

// ===================== 单例 =====================

let dbInstance: Database.Database | null = null;
let vecLoaded = false;

/**
 * 获取数据库实例（单例），加载 sqlite-vec 扩展
 */
function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // 加载 sqlite-vec 扩展
  try {
    sqliteVec.load(db);
    vecLoaded = true;
    logger.debug('[VecMemory] sqlite-vec 扩展加载成功');
  } catch (e) {
    logger.warn('[VecMemory] sqlite-vec 扩展加载失败，降级为关键词搜索:', e);
    vecLoaded = false;
  }

  dbInstance = db;
  initSchema(db);
  return db;
}

/**
 * 初始化表结构
 */
function initSchema(db: Database.Database): void {
  // 原始记忆表（与 LongTermMemory 兼容）
  db.exec(`
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

  // 向量索引表（vec0 虚拟表）— 仅当 sqlite-vec 可用时创建
  if (vecLoaded) {
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec_index USING vec0(
          embedding float[${EMBEDDING_DIM}],
          +entry_id INTEGER
        );
      `);
      logger.debug('[VecMemory] vec0 虚拟表已创建');
    } catch (e) {
      logger.warn('[VecMemory] vec0 虚拟表创建失败:', e);
      vecLoaded = false;
    }
  }
}

// ===================== 写入 =====================

/**
 * 写入记忆条目并生成 embedding
 *
 * @param entry 记忆条目
 * @returns 新条目 ID（-1 表示失败）
 */
export async function writeMemory(entry: Omit<VecMemoryEntry, 'id' | 'createdAt'>): Promise<number> {
  const db = getDb();

  // 写入文本表
  const stmt = db.prepare(
    'INSERT INTO memory_entries (userId, sessionId, category, content, keywords) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(entry.userId, entry.sessionId, entry.category, entry.content, entry.keywords);
  const entryId = Number(result.lastInsertRowid);

  // 生成 embedding 并写入向量索引表
  if (vecLoaded) {
    try {
      // 确保 ONNX 引擎已初始化
      const status = getOnnxStatus();
      if (status.status !== 'ready') {
        await initOnnxEmbedding();
      }

      const embedding = await embedText(entry.content);

      // 插入向量到 vec0 虚拟表
      db.prepare(
        'INSERT INTO memory_vec_index (embedding, entry_id) VALUES (?, ?)'
      ).run(Buffer.from(embedding.buffer), entryId);

    } catch (e) {
      logger.warn(`[VecMemory] embedding 生成失败 (entryId=${entryId}):`, e);
      // 不影响文本写入，向量缺失时降级为关键词搜索
    }
  }

  return entryId;
}

// ===================== 语义搜索 =====================

/**
 * 语义搜索记忆条目
 *
 * 流程：
 * 1. 生成查询文本的 embedding
 * 2. 在 vec0 虚拟表中执行 KNN 搜索
 * 3. JOIN 原始记忆表获取完整内容
 * 4. 如果 sqlite-vec 不可用，降级为关键词 LIKE 搜索
 *
 * @param query 查询文本
 * @param userId 用户 ID
 * @param topK 返回数量
 * @param threshold 最低相似度阈值（0~1）
 * @param sessionId 会话 ID（可选，传入时只检索当前会话的记忆）
 * @returns 搜索结果列表
 */
export async function searchMemory(
  query: string,
  userId: string = 'default',
  topK: number = DEFAULT_TOP_K,
  threshold: number = DEFAULT_THRESHOLD,
  sessionId?: string,
): Promise<VecSearchResult[]> {
  const db = getDb();

  // ============ 向量语义搜索路径 ============
  if (vecLoaded) {
    try {
      const status = getOnnxStatus();
      if (status.status !== 'ready') {
        await initOnnxEmbedding();
      }

      const queryEmbedding = await embedText(query);

      // KNN 搜索：vec0 的 MATCH + k 语法
      const vecResults = db.prepare(`
        SELECT
          v.entry_id as entryId,
          v.distance as distance
        FROM memory_vec_index v
        WHERE v.embedding MATCH ?
        ORDER BY v.distance
        LIMIT ?
      `).all(Buffer.from(queryEmbedding.buffer), topK * 2) as Array<{ entryId: number; distance: number }>;

      if (vecResults.length === 0) {
        return [];
      }

      // 获取完整记忆条目（支持 sessionId 过滤）
      const entryIds = vecResults.map(r => r.entryId);
      const placeholders = entryIds.map(() => '?').join(',');
      const sql = sessionId
        ? `SELECT * FROM memory_entries WHERE id IN (${placeholders}) AND userId = ? AND sessionId = ?`
        : `SELECT * FROM memory_entries WHERE id IN (${placeholders}) AND userId = ?`;
      const params = sessionId
        ? [...entryIds, userId, sessionId]
        : [...entryIds, userId];
      const entries = db.prepare(sql).all(...params) as VecMemoryEntry[];

      // 构建 entryId → entry 映射
      const entryMap = new Map(entries.map(e => [e.id!, e]));

      // 合并结果：distance → similarity（1 - distance for cosine, vec0 cosine distance = 1 - cosine_similarity）
      const results: VecSearchResult[] = [];
      for (const vr of vecResults) {
        const entry = entryMap.get(vr.entryId);
        if (entry) {
          // sqlite-vec cosine distance: 0 = 完全相同, 2 = 完全相反
          // similarity = 1 - distance / 2（归一化到 0~1）
          const similarity = Math.max(0, 1 - vr.distance / 2);
          if (similarity >= threshold) {
            results.push({ entry, similarity });
          }
        }
      }

      // 按相似度降序
      results.sort((a, b) => b.similarity - a.similarity);

      return results.slice(0, topK);
    } catch (e) {
      logger.warn('[VecMemory] 向量搜索失败，降级为关键词搜索:', e);
    }
  }

  // ============ 降级：关键词 LIKE 搜索 ============
  return searchByKeyword(db, query, userId, topK, sessionId);
}

// ===================== 关键词提取 =====================

/** 中文停用词表 */
const CN_STOP_WORDS = new Set([
  '的', '了', '是', '在', '和', '有', '我', '你', '他', '她', '它',
  '这', '那', '也', '都', '就', '只', '还', '又', '或', '但', '而',
  '与', '及', '以', '为', '对', '向', '从', '到', '于', '把', '被',
  '让', '使', '给', '跟', '要', '会', '能', '可', '应', '该', '需',
  '没', '不', '未', '无', '非', '已', '曾', '正', '将', '已', '如',
  '什么', '怎么', '为什么', '哪里', '哪个', '哪些', '怎样', '多少',
  '可以', '需要', '应该', '已经', '正在', '将会', '一个', '一些',
  '这个', '那个', '这些', '那些', '我们', '你们', '他们', '它们',
  '自己', '其他', '别的', '所有', '每个', '任何', '某些',
  '时候', '时间', '现在', '之前', '之后', '期间',
]);

/** 英文停用词表 */
const EN_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we',
  'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its',
  'our', 'their', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'also', 'can',
]);

/**
 * 从文本中提取关键词（中英文混合支持）
 *
 * 策略：
 * 1. 提取中文词组（2-6 字连续中文）和英文单词
 * 2. 过滤停用词
 * 3. 过滤过短/过长的词
 * 4. 去重并限制数量
 *
 * @param text 源文本
 * @param maxKeywords 最大关键词数量（默认 10）
 * @returns 空格分隔的关键词字符串
 */
export function extractKeywords(text: string, maxKeywords: number = 10): string {
  if (!text || text.trim().length === 0) return '';

  const normalized = text.toLowerCase().trim();
  const keywords: string[] = [];
  const seen = new Set<string>();

  // 提取中文词组（连续 2-6 个中文字符）
  const cnMatches = normalized.match(/[\u4e00-\u9fff]{2,6}/g) || [];
  for (const word of cnMatches) {
    if (CN_STOP_WORDS.has(word)) continue;
    if (word.length < 2 || word.length > 6) continue;
    if (!seen.has(word)) {
      seen.add(word);
      keywords.push(word);
    }
  }

  // 提取英文单词（字母+数字组合，含连字符）
  const enMatches = normalized.match(/[a-z][a-z0-9_-]{1,30}/g) || [];
  for (const word of enMatches) {
    if (EN_STOP_WORDS.has(word)) continue;
    if (word.length < 2 || word.length > 30) continue;
    if (!seen.has(word)) {
      seen.add(word);
      keywords.push(word);
    }
  }

  // 提取数字（版本号、数值等）
  const numMatches = normalized.match(/\b\d+(?:\.\d+){0,2}\b/g) || [];
  for (const num of numMatches) {
    if (!seen.has(num)) {
      seen.add(num);
      keywords.push(num);
    }
  }

  return keywords.slice(0, maxKeywords).join(' ');
}

/**
 * 关键词 LIKE 搜索（降级方案）
 *
 * 改进：支持中文分词匹配 + 多关键词 OR 查询 + 按匹配数排序
 */
function searchByKeyword(
  db: Database.Database,
  query: string,
  userId: string,
  limit: number,
  sessionId?: string,
): VecSearchResult[] {
  // 使用 extractKeywords 提取查询关键词（比简单 split 更准确）
  const queryKeywords = extractKeywords(query, 8);
  if (queryKeywords.length === 0) return [];

  const keywords = queryKeywords.split(/\s+/).filter(k => k.length > 1);
  if (keywords.length === 0) return [];

  // 构建 LIKE 查询条件：每个关键词同时匹配 keywords 和 content 字段
  const conditions = keywords.map(() => `(keywords LIKE ? OR content LIKE ?)`).join(' OR ');

  // v2.8.7: 支持 sessionId 过滤
  const whereClause = sessionId
    ? `userId = ? AND sessionId = ? AND (${conditions})`
    : `userId = ? AND (${conditions})`;
  const whereParams = sessionId
    ? [userId, sessionId]
    : [userId];

  const stmt = db.prepare(
    `SELECT *, (
      CASE ${keywords.map(() => 'WHEN keywords LIKE ? OR content LIKE ? THEN 1 ELSE 0 END').join(' + ')}
    ) AS matchCount
    FROM memory_entries
    WHERE ${whereClause}
    ORDER BY matchCount DESC, createdAt DESC
    LIMIT ?`
  );

  // 构建完整参数列表：先 matchCount CASE 的参数，再 WHERE 参数，最后 LIMIT
  const caseParams = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);
  const allParams = [...caseParams, ...whereParams, ...keywords.flatMap(k => [`%${k}%`, `%${k}%`]), limit];

  const entries = stmt.all(...allParams) as (VecMemoryEntry & { matchCount: number })[];

  // 根据匹配数计算相似度（0.3~0.8 区间）
  return entries.map(entry => {
    const maxMatches = keywords.length;
    const ratio = maxMatches > 0 ? entry.matchCount / (maxMatches * 2) : 0;
    const similarity = Math.max(0.3, Math.min(0.8, 0.3 + ratio * 0.5));
    return { entry, similarity };
  });
}

// ===================== 混合搜索 =====================

/**
 * 混合搜索：向量语义 + 关键词匹配加权融合
 *
 * @param query 查询文本
 * @param userId 用户 ID
 * @param topK 返回数量
 * @param semanticWeight 语义权重（0~1，默认 0.7）
 * @param keywordWeight 关键词权重（0~1，默认 0.3）
 * @returns 融合排序后的搜索结果
 */
export async function hybridSearch(
  query: string,
  userId: string = 'default',
  topK: number = DEFAULT_TOP_K,
  semanticWeight: number = 0.7,
  keywordWeight: number = 0.3,
): Promise<VecSearchResult[]> {
  // 并行执行两种搜索
  const [semanticResults, keywordResults] = await Promise.all([
    searchMemory(query, userId, topK * 2, 0.0), // 降低阈值以获取更多候选
    Promise.resolve(searchByKeyword(getDb(), query, userId, topK * 2)),
  ]);

  // 构建融合分数映射
  const scoreMap = new Map<number, { entry: VecMemoryEntry; score: number }>();

  for (const { entry, similarity } of semanticResults) {
    const id = entry.id!;
    scoreMap.set(id, { entry, score: similarity * semanticWeight });
  }

  for (const { entry, similarity } of keywordResults) {
    const id = entry.id!;
    const existing = scoreMap.get(id);
    if (existing) {
      existing.score += similarity * keywordWeight;
    } else {
      scoreMap.set(id, { entry, score: similarity * keywordWeight });
    }
  }

  // 排序并截取
  const results = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ entry, score }) => ({ entry, similarity: score }));

  return results;
}

// ===================== 管理操作 =====================

/**
 * 获取记忆存储统计信息
 */
export function getMemoryStats(): VecMemoryStats {
  const db = getDb();

  let totalEntries = 0;
  let totalVectors = 0;

  try {
    totalEntries = (db.prepare('SELECT COUNT(*) as count FROM memory_entries').get() as { count: number }).count;
  } catch { /* ignore */ }

  if (vecLoaded) {
    try {
      totalVectors = (db.prepare('SELECT COUNT(*) as count FROM memory_vec_index').get() as { count: number }).count;
    } catch { /* ignore */ }
  }

  const { status, error } = getOnnxStatus();

  return { totalEntries, totalVectors, onnxStatus: status, onnxError: error };
}

/**
 * 为已有记忆条目补全 embedding（批量回填）
 *
 * 用于从旧版 LIKE 搜索升级到向量搜索时的数据迁移
 */
export async function backfillEmbeddings(): Promise<{ total: number; success: number; failed: number }> {
  const db = getDb();
  if (!vecLoaded) return { total: 0, success: 0, failed: 0 };

  // 查找没有对应向量的记忆条目
  const entriesWithoutVec = db.prepare(`
    SELECT m.* FROM memory_entries m
    WHERE NOT EXISTS (
      SELECT 1 FROM memory_vec_index v WHERE v.entry_id = m.id
    )
    ORDER BY m.createdAt DESC
    LIMIT 100
  `).all() as VecMemoryEntry[];

  let success = 0;
  let failed = 0;

  // P1: 分批批量推理，每批 16 条
  const BATCH_SIZE = 16;
  for (let start = 0; start < entriesWithoutVec.length; start += BATCH_SIZE) {
    const batch = entriesWithoutVec.slice(start, start + BATCH_SIZE);
    try {
      const status = getOnnxStatus();
      if (status.status !== 'ready') {
        await initOnnxEmbedding();
      }

      const embeddings = await embedBatch(batch.map(e => e.content));

      for (let i = 0; i < batch.length; i++) {
        try {
          db.prepare(
            'INSERT INTO memory_vec_index (embedding, entry_id) VALUES (?, ?)'
          ).run(Buffer.from(embeddings[i].buffer), batch[i].id!);
          success++;
        } catch {
          failed++;
        }
      }
    } catch {
      // 整批失败，逐条重试
      for (const entry of batch) {
        try {
          const embedding = await embedText(entry.content);
          db.prepare(
            'INSERT INTO memory_vec_index (embedding, entry_id) VALUES (?, ?)'
          ).run(Buffer.from(embedding.buffer), entry.id!);
          success++;
        } catch {
          failed++;
        }
      }
    }
  }

  return { total: entriesWithoutVec.length, success, failed };
}

/**
 * 清理旧记忆（保留最近 maxEntries 条）
 */
export function pruneMemory(maxEntries: number = 1000): number {
  const db = getDb();

  // 先删除向量索引中的对应记录
  if (vecLoaded) {
    try {
      db.prepare(`
        DELETE FROM memory_vec_index
        WHERE entry_id NOT IN (
          SELECT id FROM memory_entries ORDER BY createdAt DESC LIMIT ?
        )
      `).run(maxEntries);
    } catch { /* ignore */ }
  }

  // 删除原始记忆
  const result = db.prepare(`
    DELETE FROM memory_entries WHERE id NOT IN (
      SELECT id FROM memory_entries ORDER BY createdAt DESC LIMIT ?
    )
  `).run(maxEntries);

  return result.changes;
}

/**
 * 删除指定会话的所有记忆
 */
export function deleteSessionMemory(sessionId: string): number {
  const db = getDb();

  if (vecLoaded) {
    try {
      db.prepare(`
        DELETE FROM memory_vec_index
        WHERE entry_id IN (
          SELECT id FROM memory_entries WHERE sessionId = ?
        )
      `).run(sessionId);
    } catch { /* ignore */ }
  }

  const result = db.prepare('DELETE FROM memory_entries WHERE sessionId = ?').run(sessionId);
  return result.changes;
}
