/**
 * 语义嵌入与匹配相关类型定义
 * 覆盖嵌入向量存储、匹配模式、匹配结果、匹配引擎配置等
 */

/** 匹配模式 */
export type MatchMode = 'semantic' | 'keyword' | 'hybrid' | 'context';

/** 嵌入向量维度（all-MiniLM-L6-v2 输出 384 维） */
export const EMBEDDING_DIMENSIONS = 384;

/** 默认嵌入模型名称 */
export const DEFAULT_EMBEDDING_MODEL = 'all-MiniLM-L6-v2';

/** 技能嵌入向量记录 */
export interface SkillEmbedding {
  id: number;
  skillId: string;
  contentHash: string;
  embedding: Float32Array;
  modelName: string;
  dimensions: number;
  createdAt: string;
  updatedAt: string;
}

/** 技能嵌入向量行数据（SQLite 原始字段，embedding 为 BLOB） */
export interface SkillEmbeddingRow {
  id: number;
  skill_id: string;
  content_hash: string;
  embedding: Buffer;
  model_name: string;
  dimensions: number;
  created_at: string;
  updated_at: string;
}

/** 匹配结果项 */
export interface MatchResult {
  skillId: string;
  skillName: string;
  score: number;
  matchMode: MatchMode;
  reasons: string[];
}

/** 匹配查询参数 */
export interface MatchQuery {
  query: string;
  matchMode: MatchMode;
  topK: number;
  threshold: number;
  categoryFilter?: string[];
  excludeSkillIds?: string[];
}

/** 匹配引擎运行时配置 */
export interface MatchEngineRuntimeConfig {
  /** 语义匹配权重（0~1，hybrid 模式下与 keywordWeight 之和为 1） */
  semanticWeight: number;
  /** 关键词匹配权重（0~1） */
  keywordWeight: number;
  /** 默认匹配阈值（0~1，低于此分数的结果被过滤） */
  defaultThreshold: number;
  /** 默认返回 Top-K 数量 */
  defaultTopK: number;
  /** 缓存过期时间（毫秒） */
  cacheTtlMs: number;
  /** 是否启用反馈学习（根据用户反馈调整权重） */
  enableFeedbackLearning: boolean;
  /** 上下文窗口大小（context 模式下最近 N 条对话参与匹配） */
  contextWindowSize: number;
}

/** 默认匹配引擎配置 */
export const DEFAULT_MATCH_ENGINE_CONFIG: MatchEngineRuntimeConfig = {
  semanticWeight: 0.6,
  keywordWeight: 0.4,
  defaultThreshold: 0.3,
  defaultTopK: 10,
  cacheTtlMs: 300000, // 5 分钟
  enableFeedbackLearning: true,
  contextWindowSize: 5,
};

/** 向量搜索结果（内部使用） */
export interface VectorSearchResult {
  skillId: string;
  similarity: number;
}

// ===================== 类型转换工具函数 =====================

/** 将 SQLite 行数据转换为 SkillEmbedding（反序列化 BLOB → Float32Array） */
export function rowToSkillEmbedding(row: SkillEmbeddingRow): SkillEmbedding {
  return {
    id: row.id,
    skillId: row.skill_id,
    contentHash: row.content_hash,
    embedding: blobToFloat32Array(row.embedding),
    modelName: row.model_name,
    dimensions: row.dimensions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 将 SkillEmbedding 转换为 SQLite 行数据（序列化 Float32Array → BLOB） */
export function skillEmbeddingToRow(
  emb: Omit<SkillEmbedding, 'id'>
): Omit<SkillEmbeddingRow, 'id'> {
  return {
    skill_id: emb.skillId,
    content_hash: emb.contentHash,
    embedding: float32ArrayToBlob(emb.embedding),
    model_name: emb.modelName,
    dimensions: emb.dimensions,
    created_at: emb.createdAt,
    updated_at: emb.updatedAt,
  };
}

// ===================== 内部工具函数 =====================

/** 将 Buffer（BLOB）反序列化为 Float32Array */
function blobToFloat32Array(blob: Buffer): Float32Array {
  const buffer = ArrayBuffer.isView(blob)
    ? blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength)
    : blob;
  return new Float32Array(buffer);
}

/** 将 Float32Array 序列化为 Buffer（BLOB） */
function float32ArrayToBlob(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}
