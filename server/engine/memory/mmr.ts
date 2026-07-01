/**
 * MMR (Maximal Marginal Relevance) 最大边缘相关性去重算法
 *
 * 用于平衡搜索结果的相关性和多样性，避免返回高度相似的结果。
 * 算法原理：
 *   MMR = λ * Sim(q, d) - (1-λ) * max[Sim(d, d_i)] for d_i in S
 *   其中 q 是查询，d 是候选文档，S 是已选结果集
 */

/**
 * 记忆条目接口
 */
export interface MemoryEntry {
  id: number | string;
  text: string;
  metadata?: Record<string, unknown>;
  similarity?: number;
  embedding?: number[] | Float32Array;
  createdAt?: number | string;
  lastAccessedAt?: number | string;
  category?: string;
}

/**
 * MMR 配置选项
 */
export interface MMROptions {
  /** 查询向量 */
  queryVector: number[];
  /** 候选记忆条目 */
  candidates: MemoryEntry[];
  /** 平衡相关性和多样性的参数，范围 0.5-0.8
   *  - 接近 1: 更重视相关性
   *  - 接近 0: 更重视多样性
   */
  lambda: number;
  /** 返回结果数量 */
  k: number;
  /** 候选条目的 embedding 向量映射 */
  embeddings: Map<string | number, number[] | Float32Array>;
}

/**
 * 计算两个向量的余弦相似度
 */
function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dotProduct / denom : 0;
}

/**
 * MMR 选择算法
 *
 * 迭代地选择最大化边缘相关性的候选：
 * 1. 计算候选与查询的相关性
 * 2. 计算候选与已选结果的最大相似度
 * 3. 选择 MMR 分数最高的候选
 * 4. 重复直到达到 k 个结果
 *
 * @param options MMR 配置选项
 * @returns 选中的记忆条目数组
 */
export function mmrSelect(options: MMROptions): MemoryEntry[] {
  const { queryVector, candidates, lambda, k, embeddings } = options;

  // 边界情况处理
  if (candidates.length === 0 || k <= 0) {
    return [];
  }

  if (candidates.length <= k) {
    // 候选数不足，直接返回所有候选
    return candidates;
  }

  // 已选结果集
  const selected: MemoryEntry[] = [];
  // 已选结果的 embedding 集合
  const selectedEmbeddings: (number[] | Float32Array)[] = [];
  // 剩余候选集
  const remaining = [...candidates];

  // 第一次选择：选择与查询最相关的候选
  let bestFirstIdx = -1;
  let bestFirstScore = -Infinity;

  for (let i = 0; i < remaining.length; i++) {
    const candidate = remaining[i];
    const embedding = embeddings.get(candidate.id);

    if (embedding) {
      const relevance = cosineSimilarity(queryVector, embedding);
      if (relevance > bestFirstScore) {
        bestFirstScore = relevance;
        bestFirstIdx = i;
      }
    } else if (candidate.similarity !== undefined && bestFirstIdx === -1) {
      // 如果没有 embedding 但有预计算的相似度
      bestFirstScore = candidate.similarity;
      bestFirstIdx = i;
    }
  }

  if (bestFirstIdx === -1) {
    // 无法找到合适的候选，返回前 k 个
    return candidates.slice(0, k);
  }

  // 将第一个选中的结果加入已选集
  selected.push(remaining[bestFirstIdx]);
  const firstEmbedding = embeddings.get(remaining[bestFirstIdx].id);
  if (firstEmbedding) {
    selectedEmbeddings.push(firstEmbedding);
  }
  remaining.splice(bestFirstIdx, 1);

  // 迭代选择剩余 k-1 个结果
  while (selected.length < k && remaining.length > 0) {
    let bestIdx = -1;
    let bestMMRScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const candidateEmbedding = embeddings.get(candidate.id);

      // 计算与查询的相关性
      let relevance = 0;
      if (candidateEmbedding) {
        relevance = cosineSimilarity(queryVector, candidateEmbedding);
      } else if (candidate.similarity !== undefined) {
        relevance = candidate.similarity;
      }

      // 计算与已选结果的最大相似度（多样性惩罚）
      let maxSimilarity = 0;
      if (candidateEmbedding && selectedEmbeddings.length > 0) {
        for (const selEmbedding of selectedEmbeddings) {
          const sim = cosineSimilarity(candidateEmbedding, selEmbedding);
          maxSimilarity = Math.max(maxSimilarity, sim);
        }
      }

      // 计算 MMR 分数
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

      if (mmrScore > bestMMRScore) {
        bestMMRScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      // 无法找到更好的候选，终止循环
      break;
    }

    // 将最佳候选加入已选集
    const selectedCandidate = remaining[bestIdx];
    selected.push(selectedCandidate);

    const selectedCandidateEmbedding = embeddings.get(selectedCandidate.id);
    if (selectedCandidateEmbedding) {
      selectedEmbeddings.push(selectedCandidateEmbedding);
    }

    remaining.splice(bestIdx, 1);
  }

  return selected;
}

/**
 * 简化版 MMR：基于预计算的相似度和候选向量
 * 适用于已有相似度分数但需要去重的场景
 *
 * @param candidates 候选结果（需包含 similarity 和 embedding）
 * @param lambda 平衡参数
 * @param k 返回数量
 * @returns 去重后的结果
 */
export function mmrReRankSimple<T extends { similarity: number; embedding?: Float32Array | number[] }>(
  candidates: T[],
  lambda: number = 0.5,
  k: number
): T[] {
  if (candidates.length <= k) {
    return candidates;
  }

  const selected: T[] = [];
  const remaining = [...candidates];

  // 选择第一个（最相关的）
  selected.push(remaining.shift()!);

  // 迭代选择
  while (selected.length < k && remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = candidate.similarity;

      // 计算与已选结果的最大相似度
      let maxDiversity = 0;
      if (candidate.embedding) {
        for (const sel of selected) {
          if (sel.embedding) {
            const sim = cosineSimilarity(candidate.embedding, sel.embedding);
            maxDiversity = Math.max(maxDiversity, sim);
          }
        }
      }

      // MMR 分数
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