import type { MemoryEntry, MemoryQuery, MemorySearchResult, MemoryScope } from './types.js';

export interface SearchRanking {
  entry: MemoryEntry;
  vectorScore: number;
  keywordScore: number;
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
}

export class AdvancedSearchEngine {
  private options: AdvancedSearchOptions;

  constructor(options: AdvancedSearchOptions = {}) {
    this.options = {
      vectorWeight: 0.5,
      keywordWeight: 0.3,
      recencyWeight: 0.1,
      importanceWeight: 0.1,
      recencyDecayFactor: 0.95,
      enableReranking: false,
      diversityLambda: 0.5,
      ...options,
    };
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
    const { vectorWeight, keywordWeight, recencyWeight, importanceWeight } = this.options;

    return (
      ranking.vectorScore * (vectorWeight || 0.5) +
      ranking.keywordScore * (keywordWeight || 0.3) +
      ranking.recencyScore * (recencyWeight || 0.1) +
      ranking.importanceScore * (importanceWeight || 0.1)
    );
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