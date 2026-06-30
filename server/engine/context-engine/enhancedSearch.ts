import { logger } from '../../logger.js';
import { hybridSearchMemory, type VecSearchResult, type HybridSearchOptions } from '../vecMemoryStore.js';

export interface EnhancedSearchOptions extends HybridSearchOptions {
  timeDecayFactor?: number;
  timeDecayHalfLifeDays?: number;
  maxAgeDays?: number;
  minDecayWeight?: number;
  boostRecentTurns?: number;
}

export interface ScoredSearchResult extends VecSearchResult {
  adjustedScore: number;
  timeDecayWeight: number;
  ageHours: number;
}

const DEFAULT_TIME_DECAY = {
  factor: 0.5,
  halfLifeDays: 7,
  minDecayWeight: 0.2,
};

function extractTimestamp(result: VecSearchResult): number | null {
  const metadata = result.metadata || {};

  if (metadata.timestamp && typeof metadata.timestamp === 'number') {
    return metadata.timestamp;
  }

  if (metadata.createdAt && metadata.createdAt instanceof Date) {
    return metadata.createdAt.getTime();
  }

  if (metadata.createdAt && typeof metadata.createdAt === 'number') {
    return metadata.createdAt;
  }

  return null;
}

function calculateTimeDecayWeight(
  timestamp: number,
  now: number,
  halfLifeDays: number,
  minWeight: number
): number {
  const ageMs = now - timestamp;
  if (ageMs <= 0) return 1;

  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
  const decayFactor = Math.pow(0.5, ageMs / halfLifeMs);

  return Math.max(decayFactor, minWeight);
}

export function applyTimeDecay(
  results: VecSearchResult[],
  options: {
    decayFactor?: number;
    halfLifeDays?: number;
    minDecayWeight?: number;
    now?: number;
  } = {}
): ScoredSearchResult[] {
  const decayFactor = options.decayFactor ?? DEFAULT_TIME_DECAY.factor;
  const halfLifeDays = options.halfLifeDays ?? DEFAULT_TIME_DECAY.halfLifeDays;
  const minDecayWeight = options.minDecayWeight ?? DEFAULT_TIME_DECAY.minDecayWeight;
  const now = options.now ?? Date.now();

  if (decayFactor <= 0) {
    return results.map(r => ({
      ...r,
      adjustedScore: r.similarity,
      timeDecayWeight: 1,
      ageHours: 0,
    }));
  }

  const scaledResults: ScoredSearchResult[] = results.map(r => {
    const timestamp = extractTimestamp(r);
    let ageHours = 0;
    let timeDecayWeight = 1;

    if (timestamp) {
      ageHours = (now - timestamp) / (1000 * 60 * 60);
      const rawWeight = calculateTimeDecayWeight(timestamp, now, halfLifeDays, minDecayWeight);
      timeDecayWeight = minDecayWeight + (1 - minDecayWeight) * Math.pow(rawWeight, decayFactor);
    } else {
      timeDecayWeight = minDecayWeight + (1 - minDecayWeight) * 0.5;
    }

    const adjustedScore = r.similarity * timeDecayWeight;

    return {
      ...r,
      adjustedScore,
      timeDecayWeight,
      ageHours,
    };
  });

  scaledResults.sort((a, b) => b.adjustedScore - a.adjustedScore);

  return scaledResults;
}

export function filterByAge(
  results: VecSearchResult[],
  maxAgeDays: number
): VecSearchResult[] {
  if (maxAgeDays <= 0) return results;

  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  return results.filter(r => {
    const timestamp = extractTimestamp(r);
    if (!timestamp) return true;
    return (now - timestamp) <= maxAgeMs;
  });
}

export async function enhancedSearchMemory(
  query: string,
  options: EnhancedSearchOptions = {}
): Promise<ScoredSearchResult[]> {
  const {
    timeDecayFactor,
    timeDecayHalfLifeDays,
    maxAgeDays,
    minDecayWeight,
    ...hybridOptions
  } = options;

  const candidateCount = (hybridOptions.topK ?? 10) * 3;
  const rawResults = await hybridSearchMemory(query, {
    ...hybridOptions,
    topK: candidateCount,
  });

  let results = rawResults;

  if (maxAgeDays && maxAgeDays > 0) {
    results = filterByAge(results, maxAgeDays);
  }

  const hasTimeDecay = timeDecayFactor !== undefined && timeDecayFactor > 0;
  if (!hasTimeDecay) {
    return results.slice(0, hybridOptions.topK ?? 10).map(r => ({
      ...r,
      adjustedScore: r.similarity,
      timeDecayWeight: 1,
      ageHours: 0,
    }));
  }

  const scored = applyTimeDecay(results, {
    decayFactor: timeDecayFactor,
    halfLifeDays: timeDecayHalfLifeDays,
    minDecayWeight,
  });

  const topK = hybridOptions.topK ?? 10;
  const finalResults = scored.slice(0, topK);

  if (finalResults.length > 0) {
    logger.debug(
      `[EnhancedSearch] 增强搜索完成: query="${query.slice(0, 30)}..., ` +
      `结果=${finalResults.length}, ` +
      `时间衰减因子=${timeDecayFactor}, ` +
      `最高分=${finalResults[0].adjustedScore.toFixed(4)} (原始=${finalResults[0].similarity.toFixed(4)})`
    );
  }

  return finalResults;
}

export interface MemorySearchStrategy {
  name: string;
  search: (query: string, options: EnhancedSearchOptions) => Promise<ScoredSearchResult[]>;
}

export const SEARCH_STRATEGIES: Record<string, MemorySearchStrategy> = {
  hybrid: {
    name: 'hybrid',
    search: async (query, options) => enhancedSearchMemory(query, options),
  },
  vector: {
    name: 'vector',
    search: async (query, options) => {
      const { timeDecayFactor, timeDecayHalfLifeDays, minDecayWeight, topK, filters } = options;
      const { searchMemory } = await import('../vecMemoryStore.js');
      const results = await searchMemory(query, topK ?? 10, filters ?? {});

      if (!timeDecayFactor || timeDecayFactor <= 0) {
        return results.map(r => ({
          ...r,
          adjustedScore: r.similarity,
          timeDecayWeight: 1,
          ageHours: 0,
        }));
      }

      return applyTimeDecay(results, {
        decayFactor: timeDecayFactor,
        halfLifeDays: timeDecayHalfLifeDays,
        minDecayWeight,
      }).slice(0, topK ?? 10);
    },
  },
};
