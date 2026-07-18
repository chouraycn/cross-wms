import type { MemoryEntry, MemoryQuery, MemorySearchResult, MemoryScope } from './types.js';

export interface SearchRanking {
  entry: MemoryEntry;
  vectorScore: number;
  keywordScore: number;
  bm25Score: number;
  recencyScore: number;
  importanceScore: number;
  finalScore: number;
  rank: number;
}

export interface AdvancedSearchOptions {
  vectorWeight?: number;
  keywordWeight?: number;
  recencyWeight?: number;
  importanceWeight?: number;
  recencyDecayFactor?: number;
  enableReranking?: boolean;
  diversityLambda?: number;
  boostTags?: string[];
  boostFactors?: Record<string, number>;
  // hybrid search 权重
  bm25Weight?: number;
  // 字段权重 boost
  fieldBoosts?: FieldBoostConfig;
  // semantic reranking 配置
  rerankModel?: 'cross-encoder' | 'min-max' | 'semantic-similarity';
  rerankTopK?: number;
}

// 字段权重配置
export interface FieldBoostConfig {
  text?: number;
  tag?: number;
  source?: number;
  metadata?: number;
  importance?: number;
}

// Faceted search 过滤条件
export interface FacetedFilter {
  tags?: string[];
  timeRange?: {
    start?: number;
    end?: number;
  };
  source?: string;
  scope?: MemoryScope;
  importanceRange?: {
    min?: number;
    max?: number;
  };
}

// BM25 配置
export interface BM25Config {
  k1?: number;
  b?: number;
}

// Hybrid search 结果
export interface HybridSearchResult {
  entry: MemoryEntry;
  vectorScore: number;
  bm25Score: number;
  combinedScore: number;
}

// Cross-encoder reranking 模拟结果
export interface RerankResult {
  entry: MemoryEntry;
  rerankScore: number;
  originalRank: number;
  rerankRank: number;
}

/**
 * 简易 BM25 实现
 */
class SimpleBM25 {
  private documents: Array<{ text: string; terms: Map<string, number>; length: number }> = [];
  private avgDocLength = 0;
  private documentFrequency = new Map<string, number>();
  private totalDocs = 0;
  private k1: number;
  private b: number;

  constructor(config: BM25Config = {}) {
    this.k1 = config.k1 ?? 1.5;
    this.b = config.b ?? 0.75;
  }

  // 建立 BM25 索引
  indexDocuments(entries: MemoryEntry[]): void {
    this.documents = [];
    this.documentFrequency.clear();
    let totalLength = 0;

    for (const entry of entries) {
      const terms = this.tokenize(entry.text);
      const length = terms.size;
      totalLength += length;

      this.documents.push({ text: entry.text, terms, length });

      for (const term of terms.keys()) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) || 0) + 1);
      }
    }

    this.totalDocs = this.documents.length;
    this.avgDocLength = this.totalDocs > 0 ? totalLength / this.totalDocs : 1;
  }

  // 分词
  private tokenize(text: string): Map<string, number> {
    const terms = new Map<string, number>();
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    for (const word of words) {
      terms.set(word, (terms.get(word) || 0) + 1);
    }
    return terms;
  }

  // 计算单个文档的 BM25 分数
  score(query: string, docIndex: number): number {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const doc = this.documents[docIndex];
    if (!doc) return 0;

    let score = 0;

    for (const queryTerm of queryTerms) {
      const tf = doc.terms.get(queryTerm) || 0;
      if (tf === 0) continue;

      const df = this.documentFrequency.get(queryTerm) || 0;
      const idf = Math.log((this.totalDocs - df + 0.5) / (df + 0.5) + 1);
      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + this.b * (doc.length / this.avgDocLength));
      score += idf * (numerator / denominator);
    }

    return score;
  }

  // 搜索返回分数排序的结果
  search(query: string, entries: MemoryEntry[]): Array<{ entry: MemoryEntry; score: number }> {
    const results: Array<{ entry: MemoryEntry; score: number }> = [];

    for (let i = 0; i < entries.length; i++) {
      const score = this.score(query, i);
      if (score > 0) {
        results.push({ entry: entries[i], score });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }
}

/**
 * Cross-Encoder 重排序模拟器
 */
class CrossEncoderReranker {
  // 模拟 cross-encoder 重排序（实际应用中需要调用模型）
  rerank(entries: MemoryEntry[], query: string, topK: number = 10): RerankResult[] {
    // 简化版：基于 query term 覆盖率和位置评分
    const results: RerankResult[] = entries.slice(0, topK).map((entry, index) => {
      const score = this.simulateCrossEncoderScore(entry.text, query);
      return {
        entry,
        rerankScore: score,
        originalRank: index,
        rerankRank: 0,
      };
    });

    // 按 rerankScore 重新排序
    results.sort((a, b) => b.rerankScore - a.rerankScore);
    results.forEach((r, i) => {
      r.rerankRank = i + 1;
    });

    return results;
  }

  private simulateCrossEncoderScore(text: string, query: string): number {
    const queryTerms = new Set(query.toLowerCase().split(/\s+/));
    const textTerms = text.toLowerCase().split(/\s+/);

    let score = 0;
    let firstMatchIndex = -1;

    for (let i = 0; i < textTerms.length; i++) {
      if (queryTerms.has(textTerms[i])) {
        score += 1;
        if (firstMatchIndex === -1) firstMatchIndex = i;
      }
    }

    // 位置加权：越靠前权重越高
    const positionBoost = firstMatchIndex === 0 ? 0.5 : firstMatchIndex === -1 ? 0 : 0.1;

    // 覆盖率
    const coverage = score / queryTerms.size;

    return Math.min(1, coverage + positionBoost);
  }
}

/**
 * 高级搜索引擎
 * 支持混合检索、语义重排序、分面搜索、字段权重调整
 */
export class AdvancedSearchEngine {
  private options: Required<Omit<AdvancedSearchOptions, 'fieldBoosts' | 'boostTags' | 'boostFactors' | 'rerankModel'>> & {
    fieldBoosts?: FieldBoostConfig;
    boostTags?: string[];
    boostFactors?: Record<string, number>;
    rerankModel?: 'cross-encoder' | 'min-max' | 'semantic-similarity';
  };
  private bm25: SimpleBM25;
  private reranker: CrossEncoderReranker;

  constructor(options: AdvancedSearchOptions = {}) {
    this.options = {
      vectorWeight: 0.5,
      keywordWeight: 0.3,
      recencyWeight: 0.1,
      importanceWeight: 0.1,
      recencyDecayFactor: 0.95,
      enableReranking: false,
      diversityLambda: 0.5,
      bm25Weight: 0.2,
      rerankTopK: 10,
      ...options,
    };
    this.bm25 = new SimpleBM25();
    this.reranker = new CrossEncoderReranker();
  }

  /**
   * 混合搜索：结合向量搜索和 BM25
   */
  hybridSearch(
    vectorResults: Array<{ entry: MemoryEntry; score: number }>,
    entries: MemoryEntry[],
    query: string,
    options?: {
      vectorWeight?: number;
      bm25Weight?: number;
    },
  ): HybridSearchResult[] {
    const vWeight = options?.vectorWeight ?? this.options.vectorWeight ?? 0.6;
    const bm25Weight = options?.bm25Weight ?? this.options.bm25Weight ?? 0.4;

    // 建立 BM25 索引
    this.bm25.indexDocuments(entries);
    const bm25Results = this.bm25.search(query, entries);

    // 合并结果
    const combined = new Map<number, HybridSearchResult>();

    for (const result of vectorResults) {
      combined.set(result.entry.id, {
        entry: result.entry,
        vectorScore: result.score,
        bm25Score: 0,
        combinedScore: 0,
      });
    }

    for (const result of bm25Results) {
      const existing = combined.get(result.entry.id);
      if (existing) {
        existing.bm25Score = this.normalizeBM25Score(result.score);
      } else {
        combined.set(result.entry.id, {
          entry: result.entry,
          vectorScore: 0,
          bm25Score: this.normalizeBM25Score(result.score),
          combinedScore: 0,
        });
      }
    }

    // 计算综合分数
    for (const result of combined.values()) {
      result.combinedScore = result.vectorScore * vWeight + result.bm25Score * bm25Weight;
    }

    return Array.from(combined.values()).sort((a, b) => b.combinedScore - a.combinedScore);
  }

  /**
   * 语义重排序：基于 cross-encoder 模型重排序
   */
  semanticRerank(
    entries: MemoryEntry[],
    query: string,
    topK?: number,
  ): RerankResult[] {
    return this.reranker.rerank(entries, query, topK ?? this.options.rerankTopK);
  }

  /**
   * 分面搜索：按标签、时间范围、来源过滤
   */
  facetedSearch(
    entries: MemoryEntry[],
    filters: FacetedFilter,
  ): MemoryEntry[] {
    return entries.filter(entry => {
      // 标签过滤
      if (filters.tags && filters.tags.length > 0) {
        const entryTags = (entry.metadata?.tags as string[]) || [];
        if (!filters.tags.some(tag => entryTags.includes(tag))) {
          return false;
        }
      }

      // 时间范围过滤
      if (filters.timeRange) {
        const { start, end } = filters.timeRange;
        if (start !== undefined && entry.createdAt < start) return false;
        if (end !== undefined && entry.createdAt > end) return false;
      }

      // 来源过滤
      if (filters.source) {
        if (entry.metadata?.source !== filters.source) return false;
      }

      // Scope 过滤
      if (filters.scope) {
        if (entry.metadata?.scope !== filters.scope) return false;
      }

      // 重要性范围过滤
      if (filters.importanceRange) {
        const importance = (entry.metadata?.importance as number) || 0.5;
        const { min, max } = filters.importanceRange;
        if (min !== undefined && importance < min) return false;
        if (max !== undefined && importance > max) return false;
      }

      return true;
    });
  }

  /**
   * 应用字段权重 boost
   */
  applyFieldBoosts(
    rankings: SearchRanking[],
    fieldBoosts?: FieldBoostConfig,
  ): SearchRanking[] {
    const boosts = fieldBoosts ?? this.options.fieldBoosts;
    if (!boosts) return rankings;

    return rankings.map(ranking => {
      let boost = 1.0;

      // 文本 boost
      if (boosts.text && ranking.entry.text) {
        boost += boosts.text * 0.1;
      }

      // 标签 boost
      if (boosts.tag) {
        const tags = (ranking.entry.metadata?.tags as string[]) || [];
        boost += boosts.tag * tags.length * 0.1;
      }

      // 来源 boost
      if (boosts.source && ranking.entry.metadata?.source) {
        boost += boosts.source * 0.1;
      }

      // 重要性 boost
      if (boosts.importance) {
        const importance = (ranking.entry.metadata?.importance as number) || 0.5;
        boost += boosts.importance * importance * 0.1;
      }

      return {
        ...ranking,
        finalScore: ranking.finalScore * boost,
      };
    }).sort((a, b) => b.finalScore - a.finalScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  combineResults(
    vectorResults: Array<{ entry: MemoryEntry; score: number }>,
    keywordResults: Array<{ entry: MemoryEntry; score: number }>,
    query: MemoryQuery,
  ): SearchRanking[] {
    const combined = new Map<number, SearchRanking>();

    for (const result of vectorResults) {
      combined.set(result.entry.id, {
        entry: result.entry,
        vectorScore: result.score,
        keywordScore: 0,
        bm25Score: 0,
        recencyScore: this.calculateRecencyScore(result.entry),
        importanceScore: this.calculateImportanceScore(result.entry),
        finalScore: 0,
        rank: 0,
      });
    }

    for (const result of keywordResults) {
      const existing = combined.get(result.entry.id);
      if (existing) {
        existing.keywordScore = result.score;
      } else {
        combined.set(result.entry.id, {
          entry: result.entry,
          vectorScore: 0,
          keywordScore: result.score,
          bm25Score: 0,
          recencyScore: this.calculateRecencyScore(result.entry),
          importanceScore: this.calculateImportanceScore(result.entry),
          finalScore: 0,
          rank: 0,
        });
      }
    }

    for (const ranking of combined.values()) {
      ranking.finalScore = this.calculateFinalScore(ranking);
    }

    return Array.from(combined.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((ranking, index) => ({ ...ranking, rank: index + 1 }));
  }

  private calculateRecencyScore(entry: MemoryEntry): number {
    const ageMs = Date.now() - entry.createdAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const decayFactor = this.options.recencyDecayFactor || 0.95;
    return Math.pow(decayFactor, ageDays);
  }

  private calculateImportanceScore(entry: MemoryEntry): number {
    const importance = entry.metadata?.importance;
    if (typeof importance === 'number') {
      return Math.max(0, Math.min(1, importance));
    }
    if (entry.metadata?.pinned === true) {
      return 1.0;
    }
    const accessCount = entry.metadata?.accessCount;
    if (typeof accessCount === 'number') {
      return Math.min(1, Math.log10(accessCount + 1) / 3);
    }
    return 0.5;
  }

  private calculateFinalScore(ranking: SearchRanking): number {
    const { vectorWeight, keywordWeight, recencyWeight, importanceWeight, bm25Weight } = this.options;

    return (
      ranking.vectorScore * (vectorWeight || 0.5) +
      ranking.keywordScore * (keywordWeight || 0.3) +
      ranking.bm25Score * (bm25Weight || 0.1) +
      ranking.recencyScore * (recencyWeight || 0.05) +
      ranking.importanceScore * (importanceWeight || 0.05)
    );
  }

  private normalizeBM25Score(score: number): number {
    // 将 BM25 分数归一化到 [0, 1]
    return Math.tanh(score / 10);
  }

  rerankForDiversity(
    rankings: SearchRanking[],
    lambda: number = this.options.diversityLambda || 0.5,
  ): SearchRanking[] {
    if (rankings.length <= 1) return rankings;

    const selected: SearchRanking[] = [];
    const remaining = [...rankings];

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const diversityPenalty = i === 0 ? 0 : lambda * this.calculateSimilarity(remaining[0], remaining[i]);
        const score = remaining[i].finalScore - diversityPenalty;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      selected.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    }

    return selected.map((ranking, index) => ({ ...ranking, rank: index + 1 }));
  }

  private calculateSimilarity(a: SearchRanking, b: SearchRanking): number {
    if (a.entry.embedding && b.entry.embedding) {
      return this.cosineSimilarity(a.entry.embedding, b.entry.embedding);
    }
    const overlap = this.textOverlap(a.entry.text, b.entry.text);
    return overlap;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  private textOverlap(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  applyBoosts(rankings: SearchRanking[]): SearchRanking[] {
    const { boostTags, boostFactors } = this.options;
    if (!boostTags && !boostFactors) return rankings;

    const boosted = rankings.map((ranking) => {
      let multiplier = 1.0;
      const tags = (ranking.entry.metadata?.tags as string[]) || [];

      if (boostTags) {
        for (const tag of boostTags) {
          if (tags.includes(tag)) {
            multiplier += 0.2;
          }
        }
      }

      if (boostFactors) {
        for (const [key, factor] of Object.entries(boostFactors)) {
          if (ranking.entry.metadata?.[key] === true) {
            multiplier *= factor;
          }
        }
      }

      return {
        ...ranking,
        finalScore: ranking.finalScore * multiplier,
      };
    });

    return boosted
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((ranking, index) => ({ ...ranking, rank: index + 1 }));
  }

  toSearchResults(rankings: SearchRanking[], limit: number): MemorySearchResult[] {
    return rankings
      .slice(0, limit)
      .map((ranking) => ({
        entry: ranking.entry,
        score: ranking.finalScore,
        rank: ranking.rank,
      }));
  }

  filterByScope(rankings: SearchRanking[], scope: MemoryScope): SearchRanking[] {
    return rankings.filter((r) => r.entry.metadata?.scope === scope);
  }

  filterByScore(rankings: SearchRanking[], minScore?: number, maxScore?: number): SearchRanking[] {
    return rankings.filter((r) => {
      if (minScore !== undefined && r.finalScore < minScore) return false;
      if (maxScore !== undefined && r.finalScore > maxScore) return false;
      return true;
    });
  }
}

export const advancedSearchEngine = new AdvancedSearchEngine();