/**
 * 嵌入向量核心工具函数
 * 提供 cosine similarity、embedding 序列化/反序列化、内容哈希、L2 归一化等
 */

import crypto from 'crypto';
import { EMBEDDING_DIMENSIONS } from '../../types/semantic.js';

// ===================== 向量运算 =====================

/**
 * 计算两个向量的余弦相似度
 * @param a 向量 A（必须已 L2 归一化）
 * @param b 向量 B（必须已 L2 归一化）
 * @returns 余弦相似度 [-1, 1]，归一化后等同于点积
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: a.length=${a.length}, b.length=${b.length}`
    );
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * 计算两个向量的余弦相似度（通用版，无需预归一化）
 * 内部会计算各自 L2 范数，适合未归一化的向量
 * @param a 向量 A
 * @param b 向量 B
 * @returns 余弦相似度 [-1, 1]
 */
export function cosineSimilarityUnnormalized(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: a.length=${a.length}, b.length=${b.length}`
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dot / denominator;
}

/**
 * L2 归一化向量（in-place 修改并返回引用）
 * @param vec 待归一化向量
 * @returns 归一化后的同一向量引用
 */
export function l2Normalize(vec: Float32Array): Float32Array {
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq);
  if (norm === 0) {
    // 零向量直接返回（避免 NaN）
    return vec;
  }
  for (let i = 0; i < vec.length; i++) {
    vec[i] = vec[i] / norm;
  }
  return vec;
}

/**
 * 创建归一化后的向量副本（不修改原向量）
 * @param vec 原始向量
 * @returns 归一化后的新向量
 */
export function l2NormalizeCopy(vec: Float32Array): Float32Array {
  const copy = new Float32Array(vec);
  return l2Normalize(copy);
}

// ===================== Embedding 序列化 =====================

/**
 * 将 Float32Array 序列化为 Buffer（用于 SQLite BLOB 存储）
 * @param arr 浮点数组
 * @returns Node.js Buffer
 */
export function float32ArrayToBlob(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

/**
 * 将 Buffer（SQLite BLOB）反序列化为 Float32Array
 * @param blob 数据库读取的 Buffer
 * @returns Float32Array
 */
export function blobToFloat32Array(blob: Buffer): Float32Array {
  const buffer = ArrayBuffer.isView(blob)
    ? blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength)
    : blob;
  return new Float32Array(buffer);
}

// ===================== 内容哈希 =====================

/**
 * 生成内容哈希（SHA-256 前 16 字符，用于增量嵌入更新检测）
 * 当内容哈希未变时跳过重新嵌入，节省推理开销
 * @param content 技能描述/文档内容
 * @returns 16 字符的十六进制哈希字符串
 */
export function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}

// ===================== Mock 推理 =====================

/**
 * 生成随机嵌入向量（Mock 推理的降级方案）
 * 当 onnxruntime-node 不可用时使用，返回归一化的随机向量
 * @param dimensions 向量维度（默认 384）
 * @returns L2 归一化的随机 Float32Array
 */
export function generateMockEmbedding(dimensions: number = EMBEDDING_DIMENSIONS): Float32Array {
  const vec = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    // 使用 Box-Muller 变换生成标准正态分布随机数
    vec[i] = randomNormal();
  }
  return l2Normalize(vec);
}

/**
 * 生成确定性 Mock 嵌入（基于种子，用于测试）
 * 相同种子 + 相同内容 → 相同向量，确保测试可重复
 * @param seed 种子字符串
 * @param dimensions 向量维度
 * @returns L2 归一化的伪随机 Float32Array
 */
export function generateDeterministicMockEmbedding(
  seed: string,
  dimensions: number = EMBEDDING_DIMENSIONS
): Float32Array {
  const vec = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    // 用 seed + index 生成确定性伪随机数
    const hashInput = `${seed}:${i}`;
    const hash = crypto.createHash('sha256').update(hashInput, 'utf-8').digest();
    // 将前 4 字节转为 float（范围 -3 ~ 3，近似正态分布）
    const intVal = hash.readUInt32BE(0);
    const normalized = (intVal / 0xFFFFFFFF) * 6 - 3; // 映射到 [-3, 3]
    vec[i] = normalized;
  }
  return l2Normalize(vec);
}

// ===================== 批量搜索辅助 =====================

/**
 * 暴力搜索：在内存中逐一计算余弦相似度，返回 Top-K
 * 当 sqlite-vec 不可用时作为降级方案
 * @param queryVec 查询向量（已归一化）
 * @param candidates 候选向量映射 skillId → embedding
 * @param topK 返回前 K 个
 * @param threshold 最低相似度阈值
 * @returns 按 score 降序排列的结果
 */
export function bruteForceSearch(
  queryVec: Float32Array,
  candidates: Map<string, Float32Array>,
  topK: number = 10,
  threshold: number = 0.3
): Array<{ skillId: string; similarity: number }> {
  const results: Array<{ skillId: string; similarity: number }> = [];

  for (const [skillId, emb] of candidates) {
    const sim = cosineSimilarity(queryVec, emb);
    if (sim >= threshold) {
      results.push({ skillId, similarity: sim });
    }
  }

  // 按 similarity 降序排列，取 topK
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

/**
 * 合并语义搜索和关键词搜索结果（hybrid 模式）
 * 使用加权分数融合：finalScore = semanticWeight * semanticScore + keywordWeight * keywordScore
 * @param semanticResults 语义匹配结果
 * @param keywordResults 关键词匹配结果
 * @param semanticWeight 语义权重（默认 0.6）
 * @param keywordWeight 关键词权重（默认 0.4）
 * @returns 融合后的结果，按 finalScore 降序
 */
export function mergeHybridResults(
  semanticResults: Array<{ skillId: string; similarity: number }>,
  keywordResults: Array<{ skillId: string; score: number }>,
  semanticWeight: number = 0.6,
  keywordWeight: number = 0.4
): Array<{ skillId: string; finalScore: number; semanticScore: number; keywordScore: number }> {
  const scoreMap = new Map<
    string,
    { semanticScore: number; keywordScore: number; finalScore: number }
  >();

  // 归一化语义分数到 [0, 1]（cosine similarity 可能是 [-1, 1]，归一化后通常 [0, 1]）
  for (const r of semanticResults) {
    const normalizedSim = Math.max(0, r.similarity);
    scoreMap.set(r.skillId, {
      semanticScore: normalizedSim,
      keywordScore: 0,
      finalScore: 0,
    });
  }

  // 归一化关键词分数到 [0, 1]
  const maxKeywordScore = keywordResults.reduce(
    (max, r) => Math.max(max, r.score),
    1
  );

  for (const r of keywordResults) {
    const normalizedKw = r.score / maxKeywordScore;
    const existing = scoreMap.get(r.skillId);
    if (existing) {
      existing.keywordScore = normalizedKw;
    } else {
      scoreMap.set(r.skillId, {
        semanticScore: 0,
        keywordScore: normalizedKw,
        finalScore: 0,
      });
    }
  }

  // 计算加权最终分数
  const results: Array<{
    skillId: string;
    finalScore: number;
    semanticScore: number;
    keywordScore: number;
  }> = [];

  for (const [skillId, scores] of scoreMap) {
    const finalScore =
      semanticWeight * scores.semanticScore + keywordWeight * scores.keywordScore;
    results.push({
      skillId,
      finalScore,
      semanticScore: scores.semanticScore,
      keywordScore: scores.keywordScore,
    });
  }

  results.sort((a, b) => b.finalScore - a.finalScore);
  return results;
}

// ===================== 内部工具函数 =====================

/**
 * Box-Muller 变换生成标准正态分布随机数
 * @returns 服从 N(0,1) 的随机数
 */
function randomNormal(): number {
  let u = 0;
  let v = 0;
  // 确保 u 不为 0（避免 log(0)）
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
