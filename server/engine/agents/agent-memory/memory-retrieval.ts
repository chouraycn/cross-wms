import { logger } from '../../../logger.js';
import type { MemoryEntry, MemoryRetrievalOptions } from './types.js';
import { retrieveMemory } from './memory-manager.js';

export interface MemorySearchResult {
  entries: MemoryEntry[];
  totalCount: number;
  query?: string;
}

export async function searchMemory(options: MemoryRetrievalOptions & { query?: string }): Promise<MemorySearchResult> {
  logger.debug(`[Agents:MemoryRetrieval] Searching memory for agent ${options.agentId}${options.query ? ` with query: ${options.query}` : ''}`);

  const entries = await retrieveMemory(options);
  
  const result: MemorySearchResult = {
    entries,
    totalCount: entries.length,
    query: options.query,
  };

  logger.debug(`[Agents:MemoryRetrieval] Found ${entries.length} entries`);
  return result;
}

export async function getRecentMemory(agentId: string, options?: {
  sessionId?: string;
  type?: MemoryEntry['type'];
  limit?: number;
}): Promise<MemoryEntry[]> {
  const entries = await retrieveMemory({
    agentId,
    sessionId: options?.sessionId,
    type: options?.type,
    limit: options?.limit ?? 20,
  });

  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRelevantMemory(agentId: string, query: string, options?: {
  sessionId?: string;
  limit?: number;
  minRelevance?: number;
}): Promise<MemoryEntry[]> {
  const entries = await retrieveMemory({
    agentId,
    sessionId: options?.sessionId,
    limit: options?.limit ?? 10,
    minRelevance: options?.minRelevance ?? 0.3,
  });

  const scored = entries.map(entry => ({
    ...entry,
    relevance: calculateRelevance(entry.content, query),
  }));

  return scored
    .sort((a, b) => (b.relevance as number) - (a.relevance as number))
    .slice(0, options?.limit ?? 10);
}

function calculateRelevance(content: string, query: string): number {
  if (!query || !content) return 0;

  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const contentLower = content.toLowerCase();

  let score = 0;
  let matchedTerms = 0;

  for (const term of queryTerms) {
    if (contentLower.includes(term)) {
      matchedTerms++;
      const index = contentLower.indexOf(term);
      score += 1 - (index / contentLower.length);
    }
  }

  if (matchedTerms === 0) return 0;

  return (score / queryTerms.length) * (matchedTerms / queryTerms.length);
}

export async function getMemoryByTags(agentId: string, tags: string[], options?: {
  sessionId?: string;
  limit?: number;
}): Promise<MemoryEntry[]> {
  return retrieveMemory({
    agentId,
    sessionId: options?.sessionId,
    tags,
    limit: options?.limit ?? 20,
  });
}

export async function getMemorySummary(agentId: string, options?: {
  sessionId?: string;
  type?: MemoryEntry['type'];
  maxEntries?: number;
}): Promise<string> {
  const entries = await retrieveMemory({
    agentId,
    sessionId: options?.sessionId,
    type: options?.type,
    limit: options?.maxEntries ?? 10,
  });

  if (entries.length === 0) {
    return 'No memory entries found.';
  }

  const summaries = entries.map((entry, index) => {
    const contentPreview = entry.content.length > 100 
      ? entry.content.substring(0, 100) + '...' 
      : entry.content;
    return `${index + 1}. [${entry.type}] ${contentPreview}`;
  });

  return summaries.join('\n');
}

export async function getMemoryStats(agentId: string, options?: {
  sessionId?: string;
}): Promise<{
  total: number;
  shortTerm: number;
  longTerm: number;
  working: number;
}> {
  const [total, shortTerm, longTerm, working] = await Promise.all([
    retrieveMemory({ agentId, sessionId: options?.sessionId }),
    retrieveMemory({ agentId, sessionId: options?.sessionId, type: 'short-term' }),
    retrieveMemory({ agentId, sessionId: options?.sessionId, type: 'long-term' }),
    retrieveMemory({ agentId, sessionId: options?.sessionId, type: 'working' }),
  ]);

  return {
    total: total.length,
    shortTerm: shortTerm.length,
    longTerm: longTerm.length,
    working: working.length,
  };
}

logger.debug('[Agents:MemoryRetrieval] Module loaded');