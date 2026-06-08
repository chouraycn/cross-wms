/**
 * Matching Data Access Object — 匹配引擎数据访问层
 *
 * 覆盖以下数据表：
 * - skill_embeddings: 技能嵌入向量 CRUD
 * - match_feedback: 匹配反馈记录 CRUD
 * - match_engine_config: 匹配引擎配置读写
 *
 * 所有方法使用 better-sqlite3 同步 API，通过 initDb() 获取数据库连接。
 */

import { initDb } from '../db.js';
import type {
  SkillEmbeddingRow,
  SkillEmbedding,
} from '../../src/types/semantic.js';
import { rowToSkillEmbedding, skillEmbeddingToRow } from '../../src/types/semantic.js';
// Types inlined after marketplace.ts was removed (remote marketplace feature deleted)

interface MatchFeedbackRow {
  id: number;
  query: string;
  skill_id: string;
  match_mode: string;
  match_score: number;
  is_relevant: number;
  user_feedback: number | null;
  created_at: string;
}

interface MatchFeedback {
  id: number;
  query: string;
  skillId: string;
  matchMode: string;
  matchScore: number;
  isRelevant: boolean;
  userFeedback: number | null;
  createdAt: string;
}

interface MatchEngineConfigRow {
  key: string;
  value: string;
  updated_at: string;
}

interface MatchEngineConfig {
  key: string;
  value: string;
  updatedAt: string;
}

function rowToMatchFeedback(row: MatchFeedbackRow): MatchFeedback {
  return {
    id: row.id,
    query: row.query,
    skillId: row.skill_id,
    matchMode: row.match_mode,
    matchScore: row.match_score,
    isRelevant: row.is_relevant === 1,
    userFeedback: row.user_feedback,
    createdAt: row.created_at,
  };
}

function matchFeedbackToRow(fb: Omit<MatchFeedback, 'id'>): {
  query: string;
  skill_id: string;
  match_mode: string;
  match_score: number;
  is_relevant: number;
  user_feedback: number | null;
  created_at: string;
} {
  return {
    query: fb.query,
    skill_id: fb.skillId,
    match_mode: fb.matchMode,
    match_score: fb.matchScore,
    is_relevant: fb.isRelevant ? 1 : 0,
    user_feedback: fb.userFeedback,
    created_at: fb.createdAt,
  };
}

// ===================== Skill Embeddings DAO =====================

/**
 * 根据 skillId + modelName 查询单条嵌入记录
 */
export function getSkillEmbedding(
  skillId: string,
  modelName: string = 'all-MiniLM-L6-v2'
): SkillEmbedding | undefined {
  const db = initDb();
  const row = db.prepare(
    'SELECT * FROM skill_embeddings WHERE skill_id = ? AND model_name = ?'
  ).get(skillId, modelName) as SkillEmbeddingRow | undefined;
  return row ? rowToSkillEmbedding(row) : undefined;
}

/**
 * 查询所有嵌入记录
 */
export function getAllSkillEmbeddings(modelName?: string): SkillEmbedding[] {
  const db = initDb();
  let rows: SkillEmbeddingRow[];
  if (modelName) {
    rows = db.prepare(
      'SELECT * FROM skill_embeddings WHERE model_name = ?'
    ).all(modelName) as SkillEmbeddingRow[];
  } else {
    rows = db.prepare(
      'SELECT * FROM skill_embeddings'
    ).all() as SkillEmbeddingRow[];
  }
  return rows.map(rowToSkillEmbedding);
}

/**
 * 插入或替换一条嵌入记录
 */
export function upsertSkillEmbedding(
  emb: Omit<SkillEmbedding, 'id'>
): void {
  const db = initDb();
  const row = skillEmbeddingToRow(emb);

  // 检查是否已存在
  const existing = db.prepare(
    'SELECT id FROM skill_embeddings WHERE skill_id = ? AND model_name = ?'
  ).get(emb.skillId, emb.modelName) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE skill_embeddings SET content_hash = ?, embedding = ?, dimensions = ?, updated_at = ?
       WHERE skill_id = ? AND model_name = ?`
    ).run(
      row.content_hash,
      row.embedding,
      row.dimensions,
      row.updated_at,
      emb.skillId,
      emb.modelName
    );
  } else {
    db.prepare(
      `INSERT INTO skill_embeddings (skill_id, content_hash, embedding, model_name, dimensions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      row.skill_id,
      row.content_hash,
      row.embedding,
      row.model_name,
      row.dimensions,
      row.created_at,
      row.updated_at
    );
  }
}

/**
 * 根据 skillId 删除嵌入记录
 */
export function deleteSkillEmbedding(skillId: string): boolean {
  const db = initDb();
  const result = db.prepare(
    'DELETE FROM skill_embeddings WHERE skill_id = ?'
  ).run(skillId);
  return result.changes > 0;
}

/**
 * 根据 skillId 列表批量查询嵌入记录
 */
export function getSkillEmbeddingsByIds(
  skillIds: string[],
  modelName: string = 'all-MiniLM-L6-v2'
): SkillEmbedding[] {
  if (skillIds.length === 0) return [];
  const db = initDb();
  const placeholders = skillIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT * FROM skill_embeddings WHERE skill_id IN (${placeholders}) AND model_name = ?`
  ).all(...skillIds, modelName) as SkillEmbeddingRow[];
  return rows.map(rowToSkillEmbedding);
}

// ===================== Match Feedback DAO =====================

/**
 * 创建匹配反馈记录
 */
export function createMatchFeedback(
  feedback: Omit<MatchFeedback, 'id'>
): number {
  const db = initDb();
  const row = matchFeedbackToRow(feedback);
  const stmt = db.prepare(
    `INSERT INTO match_feedback (query, skill_id, match_mode, match_score, is_relevant, user_feedback, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    row.query,
    row.skill_id,
    row.match_mode,
    row.match_score,
    row.is_relevant,
    row.user_feedback,
    row.created_at
  );
  return Number(info.lastInsertRowid);
}

/**
 * 查询匹配反馈记录
 * 支持按 skillId / matchMode 过滤，按时间倒序
 */
export function getMatchFeedback(filters?: {
  skillId?: string;
  matchMode?: string;
  limit?: number;
}): MatchFeedback[] {
  const db = initDb();
  let sql = 'SELECT * FROM match_feedback WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.skillId) {
    sql += ' AND skill_id = ?';
    params.push(filters.skillId);
  }
  if (filters?.matchMode) {
    sql += ' AND match_mode = ?';
    params.push(filters.matchMode);
  }

  sql += ' ORDER BY created_at DESC';

  if (filters?.limit && filters.limit > 0) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  const rows = db.prepare(sql).all(...params) as MatchFeedbackRow[];
  return rows.map(rowToMatchFeedback);
}

/**
 * 根据 ID 查询单条反馈
 */
export function getMatchFeedbackById(id: number): MatchFeedback | undefined {
  const db = initDb();
  const row = db.prepare(
    'SELECT * FROM match_feedback WHERE id = ?'
  ).get(id) as MatchFeedbackRow | undefined;
  return row ? rowToMatchFeedback(row) : undefined;
}

/**
 * 更新匹配反馈的用户评分
 */
export function updateMatchFeedback(
  id: number,
  updates: { userFeedback?: number; isRelevant?: boolean }
): boolean {
  const db = initDb();
  const existing = db.prepare(
    'SELECT * FROM match_feedback WHERE id = ?'
  ).get(id) as MatchFeedbackRow | undefined;

  if (!existing) return false;

  const merged = {
    ...rowToMatchFeedback(existing),
    ...updates,
  };

  db.prepare(
    `UPDATE match_feedback SET user_feedback = ?, is_relevant = ? WHERE id = ?`
  ).run(
    merged.userFeedback ?? null,
    merged.isRelevant ? 1 : 0,
    id
  );

  return true;
}

/**
 * 获取技能的平均反馈分数（用于反馈学习调整权重）
 */
export function getAverageFeedbackScore(skillId: string): number {
  const db = initDb();
  const row = db.prepare(
    `SELECT AVG(CASE WHEN user_feedback IS NOT NULL THEN user_feedback ELSE CASE WHEN is_relevant = 1 THEN 1 ELSE 0 END END) as avg_score
     FROM match_feedback WHERE skill_id = ?`
  ).get(skillId) as { avg_score: number | null };

  return row?.avg_score ?? 0;
}

/**
 * 删除指定 ID 的反馈记录
 */
export function deleteMatchFeedback(id: number): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM match_feedback WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===================== Match Engine Config DAO =====================

/**
 * 获取匹配引擎完整配置
 */
export function getMatchEngineConfig(): MatchEngineConfig[] {
  const db = initDb();
  const rows = db.prepare(
    'SELECT * FROM match_engine_config ORDER BY key ASC'
  ).all() as MatchEngineConfigRow[];
  return rows.map(row => ({
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at,
  }));
}

/**
 * 获取单个配置项
 */
export function getMatchEngineConfigValue(key: string): string | null {
  const db = initDb();
  const row = db.prepare(
    'SELECT value FROM match_engine_config WHERE key = ?'
  ).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/**
 * 设置单个配置项（INSERT OR REPLACE）
 */
export function setMatchEngineConfigValue(key: string, value: string): void {
  const db = initDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO match_engine_config (key, value, updated_at) VALUES (?, ?, ?)`
  ).run(key, value, now);
}

/**
 * 批量更新配置项
 */
export function batchUpdateMatchEngineConfig(
  configs: Array<{ key: string; value: string }>
): void {
  const db = initDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO match_engine_config (key, value, updated_at) VALUES (?, ?, ?)`
  );
  const transaction = db.transaction(() => {
    for (const config of configs) {
      stmt.run(config.key, config.value, now);
    }
  });
  transaction();
}

/**
 * 重置为默认配置
 */
export function resetMatchEngineConfig(): void {
  const db = initDb();
  db.prepare('DELETE FROM match_engine_config').run();

  const now = new Date().toISOString();
  const defaults: Array<{ key: string; value: string }> = [
    { key: 'semantic_weight', value: '0.6' },
    { key: 'keyword_weight', value: '0.4' },
    { key: 'default_threshold', value: '0.3' },
    { key: 'default_top_k', value: '10' },
    { key: 'cache_ttl_ms', value: '300000' },
    { key: 'enable_feedback_learning', value: '1' },
    { key: 'context_window_size', value: '5' },
  ];
  const stmt = db.prepare(
    'INSERT INTO match_engine_config (key, value, updated_at) VALUES (?, ?, ?)'
  );
  const transaction = db.transaction(() => {
    for (const { key, value } of defaults) {
      stmt.run(key, value, now);
    }
  });
  transaction();
}
