import { logger } from '../../logger.js';
import { listTools, type ToolDefinition } from './tool-catalog.js';

export interface ToolSearchQuery {
  query: string;
  category?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  includeDeprecated?: boolean;
}

export interface ToolSearchResult {
  tool: ToolDefinition;
  score: number;
  matchReasons: string[];
}

export function searchTools(query: ToolSearchQuery): ToolSearchResult[] {
  let tools = listTools();

  if (!query.includeDeprecated) {
    tools = tools.filter(t => !t.deprecated);
  }

  if (query.category) {
    tools = tools.filter(t => t.category === query.category);
  }

  if (query.tags && query.tags.length > 0) {
    tools = tools.filter(t => query.tags!.some(tag => t.tags.includes(tag)));
  }

  let results: ToolSearchResult[] = tools.map(tool => ({
    tool,
    score: 0,
    matchReasons: [],
  }));

  if (query.query.trim()) {
    const lowerQuery = query.query.toLowerCase().trim();
    const queryWords = lowerQuery.split(/\s+/);

    results = results.map(result => {
      const { tool } = result;
      let score = 0;
      const reasons: string[] = [];

      if (tool.name.toLowerCase() === lowerQuery) {
        score += 100;
        reasons.push('exact_name_match');
      } else if (tool.name.toLowerCase().includes(lowerQuery)) {
        score += 50;
        reasons.push('name_contains');
      }

      if (tool.description.toLowerCase().includes(lowerQuery)) {
        score += 30;
        reasons.push('description_contains');
      }

      for (const word of queryWords) {
        if (tool.name.toLowerCase().includes(word)) {
          score += 10;
        }
        if (tool.tags.some(t => t.toLowerCase().includes(word))) {
          score += 15;
          if (!reasons.includes('tag_match')) {
            reasons.push('tag_match');
          }
        }
        if (tool.category.toLowerCase().includes(word)) {
          score += 20;
          if (!reasons.includes('category_match')) {
            reasons.push('category_match');
          }
        }
      }

      return {
        ...result,
        score,
        matchReasons: reasons,
      };
    });

    results = results.filter(r => r.score > 0);
  } else {
    results.forEach(r => {
      r.score = 1;
      r.matchReasons = ['all_tools'];
    });
  }

  results.sort((a, b) => b.score - a.score);

  const offset = query.offset ?? 0;
  const limit = query.limit ?? results.length;
  
  return results.slice(offset, offset + limit);
}

export function searchToolNames(query: string, limit: number = 10): string[] {
  const results = searchTools({ query, limit });
  return results.map(r => r.tool.name);
}

export function fuzzySearchTools(query: string, threshold: number = 0.3): ToolSearchResult[] {
  return searchTools({ query }).filter(r => r.score > threshold * 100);
}

export function getToolSuggestions(partialInput: string, limit: number = 5): ToolDefinition[] {
  const results = searchTools({ query: partialInput, limit });
  return results.map(r => r.tool);
}

logger.debug('[Agents:ToolSearch] Module loaded');
