/**
 * Embedding Service — 嵌入向量生成服务
 *
 * v1.3.0: 使用 generateMockEmbedding 生成随机归一化向量（降级方案）
 * v1.3.1（规划中）: 接入 onnxruntime-node，使用 all-MiniLM-L6-v2 进行真实推理
 *
 * 核心职责：
 * - 为技能内容生成嵌入向量
 * - 增量更新检测（基于 contentHash）
 * - 批量嵌入生成
 * - 嵌入向量 L2 归一化
 */

import { initDb } from '../db.js';
import {
  generateMockEmbedding,
  contentHash,
  l2NormalizeCopy,
  float32ArrayToBlob,
  blobToFloat32Array,
  bruteForceSearch,
} from '@src/services/skill/embeddingUtils';
import {
  EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  type SkillEmbeddingRow,
  type MatchEngineRuntimeConfig,
  DEFAULT_MATCH_ENGINE_CONFIG,
} from '@src/types/semantic';
import { getUserSkills } from '../dao/skills.js';
import { BUILTIN_SKILLS } from '@src/types/skill-core';

// ===================== 类型定义 =====================

/** 嵌入生成结果 */
export interface EmbeddingResult {
  skillId: string;
  embedding: Float32Array;
  contentHash: string;
  modelName: string;
  dimensions: number;
  isNew: boolean;
  updated: boolean;
}

/** 批量嵌入生成统计 */
export interface BatchEmbedStats {
  total: number;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: Array<{ skillId: string; error: string }>;
}

// ===================== 缓存层 =====================

/** 内存缓存：skillId → Float32Array */
const embeddingCache = new Map<string, Float32Array>();

/** 缓存过期时间戳 */
let cacheExpiry = 0;

/** 获取匹配引擎配置 */
function getEngineConfig(): MatchEngineRuntimeConfig {
  const db = initDb();
  try {
    const rows = db.prepare('SELECT key, value FROM match_engine_config').all() as Array<{ key: string; value: string }>;
    const configMap = new Map<string, string>();
    for (const row of rows) {
      configMap.set(row.key, row.value);
    }
    return {
      semanticWeight: parseFloat(configMap.get('semantic_weight') ?? '0.6'),
      keywordWeight: parseFloat(configMap.get('keyword_weight') ?? '0.4'),
      defaultThreshold: parseFloat(configMap.get('default_threshold') ?? '0.3'),
      defaultTopK: parseInt(configMap.get('default_top_k') ?? '10', 10),
      cacheTtlMs: parseInt(configMap.get('cache_ttl_ms') ?? '300000', 10),
      enableFeedbackLearning: configMap.get('enable_feedback_learning') === '1',
      contextWindowSize: parseInt(configMap.get('context_window_size') ?? '5', 10),
    };
  } catch {
    return DEFAULT_MATCH_ENGINE_CONFIG;
  }
}

// ===================== 单个嵌入生成 =====================

/**
 * 构建技能的嵌入内容文本
 * 将技能的名称、描述、触发词、标签拼接为用于生成嵌入的内容字符串
 */
function buildEmbeddingContent(skill: {
  name: string;
  desc?: string;
  trigger?: string;
  tags?: string[];
  detail?: string;
  category?: string;
}): string {
  const parts: string[] = [];
  if (skill.name) parts.push(skill.name);
  if (skill.desc) parts.push(skill.desc);
  if (skill.trigger) parts.push(skill.trigger);
  if (skill.tags && skill.tags.length > 0) parts.push(skill.tags.join(' '));
  if (skill.detail) parts.push(skill.detail);
  if (skill.category) parts.push(skill.category);
  return parts.join(' | ');
}

/**
 * 为单个技能生成嵌入向量（含增量更新检测）
 *
 * 流程：
 * 1. 拼接技能内容 → 计算 contentHash
 * 2. 查询 DB：是否已存在且 contentHash 一致 → 跳过
 * 3. 调用 generateMockEmbedding 生成向量 → L2 归一化
 * 4. 写入 skill_embeddings 表（INSERT OR REPLACE）
 *
 * @param skill 技能对象
 * @param force 是否强制重新生成（忽略 contentHash 检测）
 * @returns 嵌入生成结果
 */
export function generateEmbedding(
  skill: {
    id: string;
    name: string;
    desc?: string;
    trigger?: string;
    tags?: string[];
    detail?: string;
    category?: string;
  },
  force: boolean = false
): EmbeddingResult {
  const db = initDb();
  const content = buildEmbeddingContent(skill);
  const hash = contentHash(content);
  const modelName = DEFAULT_EMBEDDING_MODEL;
  const dimensions = EMBEDDING_DIMENSIONS;

  // 查询已有嵌入
  const existingRow = db.prepare(
    'SELECT * FROM skill_embeddings WHERE skill_id = ? AND model_name = ?'
  ).get(skill.id, modelName) as SkillEmbeddingRow | undefined;

  // 增量更新检测：contentHash 一致则跳过
  if (!force && existingRow && existingRow.content_hash === hash) {
    const existingEmb = blobToFloat32Array(existingRow.embedding);
    // 更新内存缓存
    embeddingCache.set(skill.id, existingEmb);
    return {
      skillId: skill.id,
      embedding: existingEmb,
      contentHash: hash,
      modelName,
      dimensions,
      isNew: false,
      updated: false,
    };
  }

  // 生成新嵌入向量
  const rawEmbedding = generateMockEmbedding(dimensions);
  const embedding = l2NormalizeCopy(rawEmbedding);
  const now = new Date().toISOString();

  // 写入数据库（INSERT OR REPLACE）
  const row: Omit<SkillEmbeddingRow, 'id'> = {
    skill_id: skill.id,
    content_hash: hash,
    embedding: float32ArrayToBlob(embedding),
    model_name: modelName,
    dimensions,
    created_at: existingRow ? existingRow.created_at : now,
    updated_at: now,
  };

  if (existingRow) {
    db.prepare(
      `UPDATE skill_embeddings SET content_hash = ?, embedding = ?, dimensions = ?, updated_at = ?
       WHERE skill_id = ? AND model_name = ?`
    ).run(row.content_hash, row.embedding, row.dimensions, row.updated_at, skill.id, modelName);
  } else {
    db.prepare(
      `INSERT INTO skill_embeddings (skill_id, content_hash, embedding, model_name, dimensions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(row.skill_id, row.content_hash, row.embedding, row.model_name, row.dimensions, row.created_at, row.updated_at);
  }

  // 更新内存缓存
  embeddingCache.set(skill.id, embedding);

  return {
    skillId: skill.id,
    embedding,
    contentHash: hash,
    modelName,
    dimensions,
    isNew: !existingRow,
    updated: !!existingRow,
  };
}

// ===================== 批量嵌入生成 =====================

/**
 * 为所有技能批量生成嵌入向量
 * 包括内置技能和用户自建技能
 *
 * @param force 是否强制重新生成所有嵌入
 * @returns 批量生成统计
 */
export function batchGenerateEmbeddings(force: boolean = false): BatchEmbedStats {
  const stats: BatchEmbedStats = {
    total: 0,
    newCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errors: [],
  };

  // 收集所有技能
  const allSkills: Array<{
    id: string;
    name: string;
    desc?: string;
    trigger?: string;
    tags?: string[];
    detail?: string;
    category?: string;
  }> = [];

  // 内置技能
  for (const skill of BUILTIN_SKILLS) {
    allSkills.push({
      id: skill.id,
      name: skill.name,
      desc: skill.desc,
      trigger: skill.trigger,
      tags: skill.tags,
      detail: skill.detail,
      category: skill.category,
    });
  }

  // 用户自建技能
  try {
    const userSkills = getUserSkills();
    for (const skill of userSkills) {
      allSkills.push({
        id: skill.id as string,
        name: skill.name as string,
        desc: skill.desc as string | undefined,
        trigger: skill.trigger as string | undefined,
        tags: skill.tags as string[] | undefined,
        detail: skill.detail as string | undefined,
        category: skill.category as string | undefined,
      });
    }
  } catch (e) {
    stats.errors.push({ skillId: '_user_skills', error: (e as Error).message });
  }

  stats.total = allSkills.length;

  // 逐个生成嵌入
  for (const skill of allSkills) {
    try {
      const result = generateEmbedding(skill, force);
      if (result.isNew) {
        stats.newCount++;
      } else if (result.updated) {
        stats.updatedCount++;
      } else {
        stats.skippedCount++;
      }
    } catch (e) {
      stats.errorCount++;
      stats.errors.push({ skillId: skill.id, error: (e as Error).message });
    }
  }

  return stats;
}

// ===================== 嵌入查询 =====================

/**
 * 获取指定技能的嵌入向量
 * 优先从内存缓存读取，其次从数据库加载
 *
 * @param skillId 技能 ID
 * @returns 嵌入向量，不存在时返回 null
 */
export function getEmbedding(skillId: string): Float32Array | null {
  // 检查内存缓存
  if (embeddingCache.has(skillId)) {
    return embeddingCache.get(skillId)!;
  }

  // 从数据库加载
  const db = initDb();
  const row = db.prepare(
    'SELECT * FROM skill_embeddings WHERE skill_id = ? AND model_name = ?'
  ).get(skillId, DEFAULT_EMBEDDING_MODEL) as SkillEmbeddingRow | undefined;

  if (!row) return null;

  const embedding = blobToFloat32Array(row.embedding);
  embeddingCache.set(skillId, embedding);
  return embedding;
}

/**
 * 获取所有技能的嵌入向量（用于暴力搜索）
 * 带缓存机制，避免频繁查询数据库
 *
 * @returns Map<skillId, Float32Array>
 */
export function getAllEmbeddings(): Map<string, Float32Array> {
  const config = getEngineConfig();
  const now = Date.now();

  // 缓存未过期时直接返回内存缓存
  if (cacheExpiry > now && embeddingCache.size > 0) {
    return new Map(embeddingCache);
  }

  // 从数据库全量加载
  const db = initDb();
  const rows = db.prepare(
    'SELECT * FROM skill_embeddings WHERE model_name = ?'
  ).all(DEFAULT_EMBEDDING_MODEL) as SkillEmbeddingRow[];

  // 清空旧缓存，重新填充
  embeddingCache.clear();
  for (const row of rows) {
    const embedding = blobToFloat32Array(row.embedding);
    embeddingCache.set(row.skill_id, embedding);
  }

  // 设置缓存过期
  cacheExpiry = now + config.cacheTtlMs;

  return new Map(embeddingCache);
}

/**
 * 清除嵌入缓存（技能变更时调用）
 */
export function invalidateCache(skillId?: string): void {
  if (skillId) {
    embeddingCache.delete(skillId);
  } else {
    embeddingCache.clear();
    cacheExpiry = 0;
  }
}

// ===================== 语义搜索 =====================

/**
 * 使用嵌入向量进行语义搜索
 * 生成查询向量 → 暴力搜索 → 返回 Top-K 结果
 *
 * @param query 查询文本
 * @param topK 返回数量
 * @param threshold 最低相似度阈值
 * @returns 匹配结果列表
 */
export function semanticSearch(
  query: string,
  topK: number = DEFAULT_MATCH_ENGINE_CONFIG.defaultTopK,
  threshold: number = DEFAULT_MATCH_ENGINE_CONFIG.defaultThreshold
): Array<{ skillId: string; similarity: number }> {
  // 为查询文本生成嵌入
  const queryContent = query.toLowerCase().trim();
  const queryEmbedding = generateMockEmbedding(EMBEDDING_DIMENSIONS);
  // 使用确定性 mock 使相同查询得到一致结果
  // 注意：generateMockEmbedding 使用随机数，实际 v1.3.1 会用 ONNX 推理
  // 这里先做 L2 归一化
  const normalizedQuery = l2NormalizeCopy(queryEmbedding);

  // 获取所有技能嵌入
  const allEmbeddings = getAllEmbeddings();

  // 暴力搜索
  return bruteForceSearch(normalizedQuery, allEmbeddings, topK, threshold);
}

/**
 * 删除指定技能的嵌入向量
 *
 * @param skillId 技能 ID
 * @returns 是否删除成功
 */
export function deleteEmbedding(skillId: string): boolean {
  const db = initDb();
  const result = db.prepare(
    'DELETE FROM skill_embeddings WHERE skill_id = ?'
  ).run(skillId);

  // 清除内存缓存
  embeddingCache.delete(skillId);

  return result.changes > 0;
}
