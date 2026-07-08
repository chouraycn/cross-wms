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
});
