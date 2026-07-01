/**
 * 混合搜索增强模块
 *
 * 结合向量搜索、全文搜索、时间衰减和 MMR 去重的综合搜索系统。
 * 提供可配置的权重参数，支持按分类过滤。
 */

import { MemoryCategory } from './classifier.js';
import { mmrSelect, MemoryEntry } from './mmr.js';
import {
  computeTimeWeights,
  applyTimeDecay,
  TimeDecayConfig,
  DEFAULT_TIME_DECAY_CONFIG,
  TIME_DECAY_PRESETS,
} from './timeDecay.js';
import { classifyMemory, filterByCategory } from './classifier.js';

/**
 * 搜索结果接口
 */
export interface SearchResult extends MemoryEntry {
  /** 最终综合评分 */
  finalScore: number;
  /** 向量相似度分数 */
  vectorScore?: number;
  /** 全文搜索分数 */
  fullTextScore?: number;
  /** 时间衰减权重 */
  timeWeight?: number;
  /** 是否经过 MMR 处理 */
  mmrProcessed?: boolean;
}

/**
 * 混合搜索配置选项
 */
export interface HybridSearchOptions {
  /** 查询文本 */
  query: string;
  /** 向量搜索权重，范围 0.0-1.0 */
  vectorWeight: number;
  /** 全文搜索权重，范围 0.0-1.0 */
  fullTextWeight: number;
  /** 时间衰减权重，范围 0.0-1.0 */
  timeDecayWeight: number;
  /** MMR lambda 参数，平衡相关性和多样性 */
  mmrLambda: number;
  /** 分类过滤器（可选） */
  categories?: MemoryCategory[];
  /** 返回结果数量 */
  limit: number;
  /** 是否启用 MMR 去重 */
  useMMR?: boolean;
  /** 是否启用时间衰减 */
  useTimeDecay?: boolean;
  /** 是否启用分类 */
  useClassify?: boolean;
  /** 时间衰减配置 */
  timeDecayConfig?: TimeDecayConfig;
  /** 候选结果倍数（用于 MMR 前的候选扩充） */
  candidateMultiplier?: number;
}

/**
 * 默认混合搜索配置
 */
export const DEFAULT_HYBRID_SEARCH_OPTIONS: Partial<HybridSearchOptions> = {
  vectorWeight: 0.7,
  fullTextWeight: 0.3,
  timeDecayWeight: 0.2,
  mmrLambda: 0.5,
  limit: 10,
  useMMR: true,
  useTimeDecay: true,
  useClassify: true,
  timeDecayConfig: DEFAULT_TIME_DECAY_CONFIG,
  candidateMultiplier: 3,
};

/**
 * 向量搜索结果提供者接口
 */
export interface VectorSearchProvider {
  /** 执行向量搜索 */
  (query: string, limit: number): Promise<MemoryEntry[]>;
}

/**
 * 全文搜索结果提供者接口
 */
export interface FullTextSearchProvider {
  /** 执行全文搜索 */
  (query: string, limit: number): Promise<MemoryEntry[]>;
}

/**
 * Embedding 提供者接口
 */
export interface EmbeddingProvider {
  /** 生成文本的 embedding 向量 */
  (text: string): Promise<number[] | Float32Array>;
}

/**
 * 混合搜索引擎类
 */
export class HybridSearchEngine {
  private vectorSearchProvider?: VectorSearchProvider;
  private fullTextSearchProvider?: FullTextSearchProvider;
  private embeddingProvider?: EmbeddingProvider;

  /**
   * 设置向量搜索提供者
   */
  setVectorSearchProvider(provider: VectorSearchProvider): void {
    this.vectorSearchProvider = provider;
  }

  /**
   * 设置全文搜索提供者
   */
  setFullTextSearchProvider(provider: FullTextSearchProvider): void {
    this.fullTextSearchProvider = provider;
  }

  /**
   * 设置 Embedding 提供者
   */
  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

  /**
   * 执行混合搜索
   *
   * @param options 搜索配置选项
   * @returns 搜索结果数组
   */
  async search(options: HybridSearchOptions): Promise<SearchResult[]> {
    const {
      query,
      vectorWeight,
      fullTextWeight,
      timeDecayWeight,
      mmrLambda,
      categories,
      limit,
      useMMR = true,
      useTimeDecay = true,
      useClassify = true,
      timeDecayConfig = DEFAULT_TIME_DECAY_CONFIG,
      candidateMultiplier = 3,
    } = options;

    // 候选数量（用于 MMR 前的扩充）
    const candidateCount = limit * candidateMultiplier;

    // 1. 执行向量搜索和全文搜索
    const [vectorResults, fullTextResults] = await Promise.allSettled([
      this.vectorSearchProvider ? this.vectorSearchProvider(query, candidateCount) : Promise.resolve([]),
      this.fullTextSearchProvider ? this.fullTextSearchProvider(query, candidateCount) : Promise.resolve([]),
    ]);

    // 2. 合并搜索结果
    const merged = new Map<string | number, SearchResult>();

    // 添加向量搜索结果
    if (vectorResults.status === 'fulfilled') {
      for (const result of vectorResults.value) {
        const score = result.similarity ?? 0;
        merged.set(result.id, {
          ...result,
          vectorScore: score,
          finalScore: score * vectorWeight,
        });
      }
    }

    // 合并全文搜索结果
    if (fullTextResults.status === 'fulfilled') {
      for (const result of fullTextResults.value) {
        const existing = merged.get(result.id);
        const fullTextScore = result.similarity ?? 0;

        if (existing) {
          // 已存在：合并分数
          existing.fullTextScore = fullTextScore;
          existing.finalScore = existing.vectorScore! * vectorWeight + fullTextScore * fullTextWeight;
        } else {
          // 不存在：新增
          merged.set(result.id, {
            ...result,
            fullTextScore,
            finalScore: fullTextScore * fullTextWeight,
          });
        }
      }
    }

    // 转换为数组
    let results = Array.from(merged.values());

    // 3. 应用分类过滤
    if (useClassify && categories && categories.length > 0) {
      // 为未分类的结果添加分类
      results = results.map((result) => {
        if (!result.category) {
          const classification = classifyMemory(result.text);
          result.category = classification.category;
        }
        return result;
      });

      // 按分类过滤
      results = filterByCategory(results as Array<{ category?: MemoryCategory }>, categories) as SearchResult[];
    }

    // 4. 应用时间衰减
    if (useTimeDecay && results.length > 0) {
      const timeWeights = computeTimeWeights(
        results.map((r) => ({
          createdAt: r.createdAt ?? Date.now(),
          lastAccessedAt: r.lastAccessedAt ?? r.createdAt ?? Date.now(),
        })),
        timeDecayConfig
      );

      results = results.map((result, index) => {
        result.timeWeight = timeWeights[index];
        result.finalScore =
          (result.vectorScore ?? 0) * vectorWeight +
          (result.fullTextScore ?? 0) * fullTextWeight +
          timeWeights[index] * timeDecayWeight;
        return result;
      });
    }

    // 5. 按综合分数排序
    results.sort((a, b) => b.finalScore - a.finalScore);

    // 6. 应用 MMR 去重
    if (useMMR && results.length > limit && this.embeddingProvider) {
      // 获取查询向量
      const queryVector = await this.embeddingProvider(query);

      // 获取候选 embedding
      const embeddings = new Map<string | number, number[] | Float32Array>();
      for (const result of results) {
        if (result.embedding) {
          embeddings.set(result.id, result.embedding);
        } else {
          // 为没有 embedding 的结果生成向量
          const emb = await this.embeddingProvider(result.text);
          embeddings.set(result.id, emb);
          result.embedding = emb;
        }
      }

      // 执行 MMR 选择
      const mmrResults = mmrSelect({
        queryVector: Array.from(queryVector),
        candidates: results,
        lambda: mmrLambda,
        k: limit,
        embeddings,
      });

      // 转换为 SearchResult
      results = mmrResults.map((r) => {
        const original = merged.get(r.id);
        return {
          ...original!,
          mmrProcessed: true,
        };
      });
    } else {
      // 不使用 MMR，直接截取
      results = results.slice(0, limit);
    }

    return results;
  }
}

/**
 * 创建混合搜索引擎实例
 */
export function createHybridSearchEngine(): HybridSearchEngine {
  return new HybridSearchEngine();
}

/**
 * 快速混合搜索（无依赖注入）
 *
 * 适用于已有搜索结果的场景，直接进行混合处理
 *
 * @param vectorResults 向量搜索结果
 * @param fullTextResults 全文搜索结果
 * @param options 搜索配置
 * @returns 混合处理后的结果
 */
export function quickHybridSearch(
  vectorResults: MemoryEntry[],
  fullTextResults: MemoryEntry[],
  options: Partial<HybridSearchOptions> = {}
): SearchResult[] {
  const {
    vectorWeight = 0.7,
    fullTextWeight = 0.3,
    timeDecayWeight = 0.2,
    categories,
    limit = 10,
    useTimeDecay = true,
    useClassify = true,
    timeDecayConfig = DEFAULT_TIME_DECAY_CONFIG,
  } = options;

  // 合并结果
  const merged = new Map<string | number, SearchResult>();

  for (const result of vectorResults) {
    const score = result.similarity ?? 0;
    merged.set(result.id, {
      ...result,
      vectorScore: score,
      finalScore: score * vectorWeight,
    });
  }

  for (const result of fullTextResults) {
    const existing = merged.get(result.id);
    const fullTextScore = result.similarity ?? 0;

    if (existing) {
      existing.fullTextScore = fullTextScore;
      existing.finalScore = existing.vectorScore! * vectorWeight + fullTextScore * fullTextWeight;
    } else {
      merged.set(result.id, {
        ...result,
        fullTextScore,
        finalScore: fullTextScore * fullTextWeight,
      });
    }
  }

  let results = Array.from(merged.values());

  // 应用分类
  if (useClassify) {
    results = results.map((result) => {
      if (!result.category) {
        const classification = classifyMemory(result.text);
        result.category = classification.category;
      }
      return result;
    });

    if (categories && categories.length > 0) {
      results = filterByCategory(results as Array<{ category?: MemoryCategory }>, categories) as SearchResult[];
    }
  }

  // 应用时间衰减
  if (useTimeDecay && results.length > 0) {
    const timeWeights = computeTimeWeights(
      results.map((r) => ({
        createdAt: r.createdAt ?? Date.now(),
        lastAccessedAt: r.lastAccessedAt ?? r.createdAt ?? Date.now(),
      })),
      timeDecayConfig
    );

    results = results.map((result, index) => {
      result.timeWeight = timeWeights[index];
      result.finalScore =
        (result.vectorScore ?? 0) * vectorWeight +
        (result.fullTextScore ?? 0) * fullTextWeight +
        timeWeights[index] * timeDecayWeight;
      return result;
    });
  }

  // 排序并截取
  results.sort((a, b) => b.finalScore - a.finalScore);
  results = results.slice(0, limit);

  return results;
}

/**
 * 预设的混合搜索配置
 */
export const HYBRID_SEARCH_PRESETS = {
  /** 语义优先：侧重向量搜索 */
  semanticFocus: {
    vectorWeight: 0.8,
    fullTextWeight: 0.2,
    timeDecayWeight: 0.1,
    mmrLambda: 0.7,
  },
  /** 关键词优先：侧重全文搜索 */
  keywordFocus: {
    vectorWeight: 0.3,
    fullTextWeight: 0.7,
    timeDecayWeight: 0.1,
    mmrLambda: 0.6,
  },
  /** 平衡模式：均匀权重 */
  balanced: {
    vectorWeight: 0.5,
    fullTextWeight: 0.5,
    timeDecayWeight: 0.15,
    mmrLambda: 0.5,
  },
  /** 新鲜度优先：重视时间衰减 */
  freshFocus: {
    vectorWeight: 0.4,
    fullTextWeight: 0.3,
    timeDecayWeight: 0.4,
    mmrLambda: 0.5,
    timeDecayConfig: TIME_DECAY_PRESETS.shortTerm,
  },
  /** 多样性优先：强调 MMR 去重 */
  diversityFocus: {
    vectorWeight: 0.6,
    fullTextWeight: 0.3,
    timeDecayWeight: 0.1,
    mmrLambda: 0.3, // 更重视多样性
  },
} as const;