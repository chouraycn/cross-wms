import { describe, it, expect } from 'vitest';
import { AdvancedSearchEngine } from '../advanced-search';
import type { MemoryEntry, MemoryQuery } from '../types';

function entry(id: number, text: string, meta: Record<string, unknown> = {}): MemoryEntry {
  return { id, text, metadata: meta, createdAt: Date.now(), updatedAt: Date.now() };
}

const query: MemoryQuery = { text: 'q' };

describe('AdvancedSearchEngine', () => {
  it('should combine vector and keyword results with final scores', () => {
    const engine = new AdvancedSearchEngine();
    const e1 = entry(1, 'alpha');
    const e2 = entry(2, 'beta');
    const rankings = engine.combineResults(
      [{ entry: e1, score: 0.4 }, { entry: e2, score: 0.9 }],
      [{ entry: e2, score: 0.9 }],
      query,
    );
    expect(rankings.length).toBe(2);
    expect(rankings[0].rank).toBe(1);
    expect(rankings[0].finalScore).toBeGreaterThan(rankings[1].finalScore);
    // e2 appears in both vector (0.9) and keyword (0.9) -> ranks highest
    expect(rankings[0].entry.id).toBe(2);
  });

  it('should factor recency and importance into final score', () => {
    const engine = new AdvancedSearchEngine();
    const fresh = entry(1, 'a', { importance: 1 });
    const stale = entry(2, 'b', { importance: 0.1 });
    const rankings = engine.combineResults([{ entry: fresh, score: 0.5 }, { entry: stale, score: 0.5 }], [], query);
    expect(rankings[0].finalScore).toBeGreaterThan(rankings[1].finalScore);
  });

  it('should rerank for diversity only when more than one result', () => {
    const engine = new AdvancedSearchEngine();
    const e1 = entry(1, 'a');
    const e2 = entry(2, 'b');
    const rankings = engine.combineResults([{ entry: e1, score: 0.9 }, { entry: e2, score: 0.8 }], [], query);
    const diverse = engine.rerankForDiversity(rankings, 0.5);
    expect(diverse.length).toBe(2);
    expect(diverse[0].rank).toBe(1);
    // single ranking returns as-is
    expect(engine.rerankForDiversity(rankings.slice(0, 1)).length).toBe(1);
  });

  it('should apply tag and factor boosts', () => {
    const engine = new AdvancedSearchEngine({ boostTags: ['important'] });
    const e1 = entry(1, 'a', { tags: ['important'] });
    const e2 = entry(2, 'b', {});
    const rankings = engine.combineResults([{ entry: e1, score: 0.5 }, { entry: e2, score: 0.5 }], [], query);
    const boosted = engine.applyBoosts(rankings);
    expect(boosted[0].entry.id).toBe(1);
    expect(boosted[0].finalScore).toBeGreaterThan(rankings[0].finalScore);
  });

  it('should convert to search results and filter by scope/score', () => {
    const engine = new AdvancedSearchEngine();
    const e1 = entry(1, 'a', { scope: 'global' });
    const e2 = entry(2, 'b', { scope: 'session' });
    const rankings = engine.combineResults([{ entry: e1, score: 0.9 }, { entry: e2, score: 0.8 }], [], query);
    const results = engine.toSearchResults(rankings, 10);
    expect(results.length).toBe(2);
    expect(engine.filterByScope(rankings, 'global').length).toBe(1);
    // finalScores are ~0.55-0.60 here, so 0.5 admits both, 0.65 admits none
    expect(engine.filterByScore(rankings, 0.5).length).toBe(2);
    expect(engine.filterByScore(rankings, 0.65).length).toBe(0);
  });

  // 新增测试：Hybrid Search
  it('should perform hybrid search combining vector and BM25', () => {
    const engine = new AdvancedSearchEngine();
    const entries = [
      entry(1, 'machine learning algorithm'),
      entry(2, 'deep neural network'),
      entry(3, 'machine learning model'),
    ];

    const vectorResults = [
      { entry: entries[0], score: 0.9 },
      { entry: entries[2], score: 0.85 },
    ];

    const hybridResults = engine.hybridSearch(vectorResults, entries, 'machine learning');

    expect(hybridResults.length).toBeGreaterThan(0);
    expect(hybridResults.some(r => r.entry.text.includes('machine'))).toBe(true);
    expect(hybridResults.every(r => typeof r.combinedScore === 'number')).toBe(true);
  });

  // 新增测试：Semantic Reranking
  it('should perform semantic reranking', () => {
    const engine = new AdvancedSearchEngine();
    const entries = [
      entry(1, 'machine learning basics'),
      entry(2, 'advanced algorithms'),
      entry(3, 'neural network architecture'),
    ];

    const reranked = engine.semanticRerank(entries, 'machine learning', 3);

    expect(reranked.length).toBe(3);
    expect(reranked.every(r => typeof r.rerankScore === 'number')).toBe(true);
    expect(reranked.every((r, i) => r.rerankRank === i + 1)).toBe(true);
  });

  // 新增测试：Faceted Search
  it('should perform faceted search with filters', () => {
    const engine = new AdvancedSearchEngine();
    const entries = [
      entry(1, 'doc 1', { tags: ['important', 'work'], importance: 0.9 }),
      entry(2, 'doc 2', { tags: ['personal'], importance: 0.5 }),
      entry(3, 'doc 3', { tags: ['work'], importance: 0.8 }),
    ];

    // 按标签过滤
    const byTag = engine.facetedSearch(entries, { tags: ['work'] });
    expect(byTag.length).toBe(2);

    // 按重要性范围过滤
    const byImportance = engine.facetedSearch(entries, {
      importanceRange: { min: 0.7 },
    });
    expect(byImportance.length).toBe(2);
  });

  // 新增测试：Field Boosts
  it('should apply field boosts', () => {
    const engine = new AdvancedSearchEngine({
      fieldBoosts: { text: 2, tag: 1.5 },
    });

    const e1 = entry(1, 'test document', { tags: ['important'] });
    const rankings = engine.combineResults([{ entry: e1, score: 0.5 }], [], query);

    const boosted = engine.applyFieldBoosts(rankings);

    expect(boosted[0].finalScore).toBeGreaterThan(rankings[0].finalScore);
  });

  // 新增测试：Time Range Filter
  it('should filter by time range', () => {
    const engine = new AdvancedSearchEngine();
    const now = Date.now();
    const entries = [
      { ...entry(1, 'old'), createdAt: now - 10000 },
      { ...entry(2, 'new'), createdAt: now - 1000 },
    ];

    const filtered = engine.facetedSearch(entries, {
      timeRange: { start: now - 5000 },
    });

    expect(filtered.length).toBe(1);
    expect(filtered[0].text).toBe('new');
  });
});
