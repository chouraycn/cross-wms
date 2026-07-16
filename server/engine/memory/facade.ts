import { logger } from '../../logger.js';
import { classifyMemory, type MemoryCategory } from './classifier.js';
import { quickHybridSearch, type SearchResult, type HybridSearchOptions } from './hybridSearch.js';
import type { TimeDecayConfig } from './timeDecay.js';

export type MemoryFacadeContext = {
  agentId?: string;
  workspaceDir?: string;
};

export type MemoryFacadeOptions = {
  ctx: MemoryFacadeContext;
};

export type MemoryBootstrapResult = {
  success: boolean;
  message?: string;
};

export type MemoryIngestResult = {
  ingested: boolean;
  count: number;
};

export type MemorySearchResult = {
  results: SearchResult[];
  total: number;
};

export type MemoryCompactResult = {
  compacted: boolean;
  originalCount: number;
  compactedCount: number;
};

export class MemoryFacade {
  private ctx: MemoryFacadeContext;
  private memories: Map<string, SearchResult> = new Map();

  constructor(options: MemoryFacadeOptions) {
    this.ctx = options.ctx;
  }

  async bootstrap(): Promise<MemoryBootstrapResult> {
    logger.debug(`[Memory:Facade] Bootstrapping memory for agent ${this.ctx.agentId}`);
    return { success: true, message: 'Memory bootstrap complete' };
  }

  async ingest(
    content: string,
    metadata?: { category?: MemoryCategory; timestamp?: number; tags?: string[] }
  ): Promise<MemoryIngestResult> {
    const category = metadata?.category ?? classifyMemory(content).category;
    const memoryId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const entry: SearchResult = {
      id: memoryId,
      text: content,
      category,
      createdAt: metadata?.timestamp ?? Date.now(),
      finalScore: 0,
    };

    this.memories.set(memoryId, entry);
    logger.debug(`[Memory:Facade] Ingested memory: ${memoryId}`);

    return { ingested: true, count: this.memories.size };
  }

  async search(
    query: string,
    options?: Omit<HybridSearchOptions, 'query'> & { limit?: number }
  ): Promise<MemorySearchResult> {
    const entries = Array.from(this.memories.values());
    
    if (entries.length === 0) {
      return { results: [], total: 0 };
    }

    const results = quickHybridSearch([], entries, {
      ...options,
    });

    const limited = options?.limit ? results.slice(0, options.limit) : results;
    
    logger.debug(`[Memory:Facade] Search "${query}" found ${limited.length} results`);
    
    return { results: limited, total: results.length };
  }

  async compact(options?: { maxEntries?: number; decayConfig?: TimeDecayConfig }): Promise<MemoryCompactResult> {
    const originalCount = this.memories.size;
    const maxEntries = options?.maxEntries ?? 1000;

    if (originalCount <= maxEntries) {
      return { compacted: false, originalCount, compactedCount: originalCount };
    }

    const entries = Array.from(this.memories.values());
    const sorted = entries.sort((a, b) => {
      const aTime = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : (a.createdAt ?? 0);
      const bTime = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : (b.createdAt ?? 0);
      return bTime - aTime;
    });
    const kept = sorted.slice(0, maxEntries);

    this.memories.clear();
    for (const entry of kept) {
      this.memories.set(String(entry.id), entry);
    }

    logger.debug(`[Memory:Facade] Compacted from ${originalCount} to ${this.memories.size} entries`);

    return {
      compacted: true,
      originalCount,
      compactedCount: this.memories.size,
    };
  }

  getStats(): { total: number; byCategory: Record<MemoryCategory, number> } {
    const byCategory: Record<MemoryCategory, number> = {
      fact: 0,
      experience: 0,
      preference: 0,
      project: 0,
    };

    for (const entry of this.memories.values()) {
      if (entry.category && (entry.category === 'fact' || entry.category === 'experience' || entry.category === 'preference' || entry.category === 'project')) {
        byCategory[entry.category]++;
      }
    }

    return { total: this.memories.size, byCategory };
  }

  clear(): void {
    this.memories.clear();
    logger.debug('[Memory:Facade] All memories cleared');
  }
}

export function createMemoryFacade(ctx: MemoryFacadeContext): MemoryFacade {
  return new MemoryFacade({ ctx });
}