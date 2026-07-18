import { logger } from '../../logger.js';

export interface RelevanceScorerConfig {
  keywordMatchWeight: number;
  semanticSimilarityWeight: number;
  recencyWeight: number;
  importanceWeight: number;
  sourceWeight: number;
  timeDecayHalfLifeMs: number;
  minScoreThreshold: number;
  maxTopK: number;
  useMMR: boolean;
  mmrDiversity: number;
  keywordMatchMode: 'exact' | 'fuzzy' | 'hybrid';
}

export interface ScoredItem<T = unknown> {
  id: string;
  content: string;
  score: number;
  scoreBreakdown: {
    keywordScore: number;
    semanticScore: number;
    recencyScore: number;
    importanceScore: number;
    sourceScore: number;
  };
  source?: string;
  timestamp?: number;
  metadata?: T;
}

export interface ScoringOptions {
  topK?: number;
  minScore?: number;
  maxAgeMs?: number;
  includeMetadata?: boolean;
  sources?: string[];
  boostKeywords?: string[];
  useMMR?: boolean;
  mmrDiversity?: number;
}

export interface KeywordMatchResult {
  matched: boolean;
  score: number;
  matchedKeywords: string[];
  matchPositions: number[];
}

const DEFAULT_CONFIG: Required<RelevanceScorerConfig> = {
  keywordMatchWeight: 0.35,
  semanticSimilarityWeight: 0.35,
  recencyWeight: 0.15,
  importanceWeight: 0.1,
  sourceWeight: 0.05,
  timeDecayHalfLifeMs: 24 * 60 * 60 * 1000,
  minScoreThreshold: 0.1,
  maxTopK: 50,
  useMMR: false,
  mmrDiversity: 0.7,
  keywordMatchMode: 'hybrid',
};

export class RelevanceScorer {
  private config: Required<RelevanceScorerConfig>;

  constructor(config: Partial<RelevanceScorerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.debug('[RelevanceScorer] 初始化完成');
  }

  scoreItems<T = unknown>(
    query: string,
    items: Array<{
      id: string;
      content: string;
      source?: string;
      timestamp?: number;
      importance?: number;
      metadata?: T;
    }>,
    options: ScoringOptions = {}
  ): ScoredItem<T>[] {
    const {
      topK = 10,
      minScore = this.config.minScoreThreshold,
      maxAgeMs,
      sources,
      boostKeywords = [],
      useMMR = this.config.useMMR,
      mmrDiversity = this.config.mmrDiversity,
    } = options;

    const queryKeywords = this.extractKeywords(query);
    const allKeywords = [...new Set([...queryKeywords, ...boostKeywords])];

    let filteredItems = items;

    if (sources && sources.length > 0) {
      const sourceSet = new Set(sources);
      filteredItems = filteredItems.filter(item => item.source && sourceSet.has(item.source));
    }

    if (maxAgeMs) {
      const cutoffTime = Date.now() - maxAgeMs;
      filteredItems = filteredItems.filter(item => !item.timestamp || item.timestamp >= cutoffTime);
    }

    const scored: ScoredItem<T>[] = filteredItems.map(item => {
      const keywordScore = this.calculateKeywordScore(item.content, allKeywords);
      const semanticScore = this.calculateSemanticScore(query, item.content);
      const recencyScore = item.timestamp ? this.calculateRecencyScore(item.timestamp) : 0.5;
      const importanceScore = item.importance !== undefined ? item.importance : 0.5;
      const sourceScore = item.source ? this.calculateSourceScore(item.source) : 0.5;

      const totalWeight =
        this.config.keywordMatchWeight +
        this.config.semanticSimilarityWeight +
        this.config.recencyWeight +
        this.config.importanceWeight +
        this.config.sourceWeight;

      const finalScore =
        (keywordScore * this.config.keywordMatchWeight +
          semanticScore * this.config.semanticSimilarityWeight +
          recencyScore * this.config.recencyWeight +
          importanceScore * this.config.importanceWeight +
          sourceScore * this.config.sourceWeight) /
        totalWeight;

      return {
        id: item.id,
        content: item.content,
        score: finalScore,
        scoreBreakdown: {
          keywordScore,
          semanticScore,
          recencyScore,
          importanceScore,
          sourceScore,
        },
        source: item.source,
        timestamp: item.timestamp,
        metadata: item.metadata,
      };
    });

    let results = scored
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score);

    if (useMMR && results.length > 1) {
      results = this.applyMMR(results, mmrDiversity, Math.min(topK, results.length));
    }

    return results.slice(0, Math.min(topK, this.config.maxTopK));
  }

  calculateKeywordScore(content: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;

    const contentLower = content.toLowerCase();
    let totalScore = 0;

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      const matches = this.countMatches(contentLower, keywordLower);
      if (matches > 0) {
        const matchScore = Math.min(1, matches / 5);
        const lengthBonus = Math.min(1, keyword.length / 10);
        totalScore += matchScore * (0.7 + 0.3 * lengthBonus);
      }
    }

    return Math.min(1, totalScore / keywords.length);
  }

  calculateSemanticScore(query: string, content: string): number {
    const queryWords = new Set(this.tokenize(query.toLowerCase()));
    const contentWords = new Set(this.tokenize(content.toLowerCase()));

    if (queryWords.size === 0 || contentWords.size === 0) return 0;

    let intersection = 0;
    for (const word of queryWords) {
      if (contentWords.has(word)) {
        intersection++;
      }
    }

    const jaccardSimilarity = intersection / (queryWords.size + contentWords.size - intersection);

    const queryBigrams = this.getBigrams(query.toLowerCase());
    const contentBigrams = this.getBigrams(content.toLowerCase());
    let bigramMatches = 0;
    for (const bigram of queryBigrams) {
      if (contentBigrams.has(bigram)) {
        bigramMatches++;
      }
    }
    const bigramSimilarity = queryBigrams.size > 0 ? bigramMatches / queryBigrams.size : 0;

    return jaccardSimilarity * 0.6 + bigramSimilarity * 0.4;
  }

  calculateRecencyScore(timestamp: number): number {
    const ageMs = Date.now() - timestamp;
    if (ageMs <= 0) return 1;

    const decayFactor = Math.pow(0.5, ageMs / this.config.timeDecayHalfLifeMs);
    return Math.max(0, Math.min(1, decayFactor));
  }

  calculateSourceScore(source: string): number {
    const highPrioritySources = ['system', 'memory', 'workspace'];
    const mediumPrioritySources = ['tool', 'artifact'];

    if (highPrioritySources.includes(source)) return 1;
    if (mediumPrioritySources.includes(source)) return 0.7;
    return 0.5;
  }

  keywordMatch(content: string, keyword: string): KeywordMatchResult {
    const contentLower = content.toLowerCase();
    const keywordLower = keyword.toLowerCase();
    const matchedKeywords: string[] = [];
    const matchPositions: number[] = [];

    let position = 0;
    let count = 0;

    while (position < contentLower.length) {
      const idx = contentLower.indexOf(keywordLower, position);
      if (idx === -1) break;
      matchPositions.push(idx);
      matchedKeywords.push(keyword);
      count++;
      position = idx + keywordLower.length;
    }

    return {
      matched: count > 0,
      score: Math.min(1, count / 5),
      matchedKeywords,
      matchPositions,
    };
  }

  extractKeywords(text: string): string[] {
    const words = this.tokenize(text.toLowerCase());
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
      'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
      'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further',
      'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
      'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
      'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      'just', 'because', 'but', 'and', 'or', 'if', 'while', 'although',
      'though', 'that', 'this', 'these', 'those', 'i', 'you', 'he', 'she',
      'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
      'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
      '什么', '的', '是', '了', '在', '和', '与', '及', '或', '等', '也',
      '都', '就', '还', '又', '再', '更', '很', '最', '不', '没', '有',
    ]);

    return words.filter(word => word.length > 1 && !stopWords.has(word));
  }

  private tokenize(text: string): string[] {
    const results: string[] = [];
    const englishWords = text.match(/[a-zA-Z][a-zA-Z0-9_-]*/g) || [];
    results.push(...englishWords);

    const chineseChars = text.match(/[\u4e00-\u9fa5]+/g) || [];
    for (const chunk of chineseChars) {
      for (let i = 0; i < chunk.length - 1; i++) {
        results.push(chunk.slice(i, i + 2));
      }
    }

    return results;
  }

  private getBigrams(text: string): Set<string> {
    const bigrams = new Set<string>();
    const tokens = this.tokenize(text);

    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.add(`${tokens[i]}_${tokens[i + 1]}`);
    }

    return bigrams;
  }

  private countMatches(content: string, keyword: string): number {
    if (keyword.length === 0) return 0;
    let count = 0;
    let position = 0;

    while (position < content.length) {
      const idx = content.indexOf(keyword, position);
      if (idx === -1) break;
      count++;
      position = idx + keyword.length;
    }

    return count;
  }

  private applyMMR<T>(
    items: ScoredItem<T>[],
    diversity: number,
    topK: number
  ): ScoredItem<T>[] {
    if (items.length <= topK) return items;

    const selected: ScoredItem<T>[] = [];
    const remaining = [...items];

    while (selected.length < topK && remaining.length > 0) {
      let bestItem: ScoredItem<T> | null = null;
      let bestMMRScore = -Infinity;
      let bestIndex = -1;

      for (let i = 0; i < remaining.length; i++) {
        const item = remaining[i];
        let maxSimilarity = 0;

        for (const selectedItem of selected) {
          const similarity = this.calculateSemanticScore(item.content, selectedItem.content);
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        const mmrScore = diversity * item.score - (1 - diversity) * maxSimilarity;

        if (mmrScore > bestMMRScore) {
          bestMMRScore = mmrScore;
          bestItem = item;
          bestIndex = i;
        }
      }

      if (bestItem && bestIndex >= 0) {
        selected.push(bestItem);
        remaining.splice(bestIndex, 1);
      } else {
        break;
      }
    }

    return selected;
  }
}
