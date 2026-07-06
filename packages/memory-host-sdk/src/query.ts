import EventEmitter from 'eventemitter3';
import type { MemoryBackend, MemoryBackendConfig, MemoryQuery, MemorySearchResult, MemoryStats, MemoryBackendType } from './types';

export interface MemoryQueryEngineEvents {
  query_started: [query: MemoryQuery];
  query_completed: [results: MemorySearchResult[], query: MemoryQuery];
  query_failed: [error: Error, query: MemoryQuery];
}

export class MemoryQueryEngine extends EventEmitter<MemoryQueryEngineEvents> {
  private backend: MemoryBackend | null = null;
  private config: MemoryBackendConfig | null = null;
  private queryHistory: Array<{ query: MemoryQuery; results: number; duration: number; timestamp: number }> = [];
  private maxHistorySize = 1000;

  async initialize(backend: MemoryBackend, config: MemoryBackendConfig): Promise<void> {
    this.backend = backend;
    this.config = config;
    await backend.init(config);
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    if (!this.backend) {
      throw new Error('MemoryQueryEngine not initialized');
    }

    const startTime = Date.now();
    this.emit('query_started', query);

    try {
      const results = await this.backend.searchMemory(query);

      const duration = Date.now() - startTime;
      this.recordQuery(query, results.length, duration);

      this.emit('query_completed', results, query);
      return results;
    } catch (error) {
      this.emit('query_failed', error as Error, query);
      throw error;
    }
  }

  async semanticSearch(
    text: string,
    options: Partial<MemoryQuery> = {},
  ): Promise<MemorySearchResult[]> {
    return this.search({
      text,
      topK: 10,
      ...options,
    });
  }

  async hybridSearch(
    text: string,
    options: Partial<MemoryQuery> = {},
  ): Promise<MemorySearchResult[]> {
    if (this.backend?.capabilities.hybridSearch) {
      return this.search({ text, ...options });
    }

    const vectorResults = await this.search({ text, topK: (options.topK || 10) * 2, ...options });
    return this.rerankResults(text, vectorResults, options.topK || 10);
  }

  private rerankResults(
    query: string,
    results: MemorySearchResult[],
    topK: number,
  ): MemorySearchResult[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = results.map((result) => {
      const text = result.entry.text.toLowerCase();
      let keywordScore = 0;
      for (const term of queryTerms) {
        if (text.includes(term)) {
          keywordScore += 0.1;
        }
      }
      return {
        ...result,
        score: result.score + keywordScore,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  private recordQuery(query: MemoryQuery, resultCount: number, duration: number): void {
    this.queryHistory.push({
      query,
      results: resultCount,
      duration,
      timestamp: Date.now(),
    });

    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory.shift();
    }
  }

  getQueryHistory(): typeof this.queryHistory {
    return [...this.queryHistory];
  }

  clearHistory(): void {
    this.queryHistory = [];
  }

  getStats(): Promise<MemoryStats> {
    if (!this.backend) {
      throw new Error('MemoryQueryEngine not initialized');
    }
    return this.backend.getStats();
  }

  getBackendType(): MemoryBackendType | null {
    return this.backend?.type || null;
  }

  isInitialized(): boolean {
    return this.backend !== null;
  }

  async shutdown(): Promise<void> {
    if (this.backend?.shutdown) {
      await this.backend.shutdown();
    }
    this.backend = null;
    this.config = null;
  }
}

export const memoryQueryEngine = new MemoryQueryEngine();
