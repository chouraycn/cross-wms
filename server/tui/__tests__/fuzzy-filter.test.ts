import { describe, expect, it } from 'vitest';
import {
  findWordBoundaryIndex,
  fuzzyFilterLower,
  fuzzyFilter,
  prepareSearchItems,
  highlightMatch,
} from '../components/fuzzy-filter.js';

describe('findWordBoundaryIndex', () => {
  it('finds match at start of string', () => {
    expect(findWordBoundaryIndex('hello world', 'hello')).toBe(0);
  });

  it('finds match at word boundary', () => {
    expect(findWordBoundaryIndex('hello world', 'world')).toBe(6);
  });

  it('returns null for no match', () => {
    expect(findWordBoundaryIndex('hello world', 'xyz')).toBeNull();
  });

  it('returns null for empty query', () => {
    expect(findWordBoundaryIndex('hello', '')).toBeNull();
  });

  it('handles hyphens as word boundaries', () => {
    expect(findWordBoundaryIndex('hello-world', 'world')).toBe(6);
  });

  it('handles underscores as word boundaries', () => {
    expect(findWordBoundaryIndex('hello_world', 'world')).toBe(6);
  });

  it('is case insensitive', () => {
    expect(findWordBoundaryIndex('Hello World', 'world')).toBe(6);
  });
});

describe('fuzzyFilterLower', () => {
  const items = [
    { value: '1', label: 'apple pie', searchTextLower: 'apple pie' },
    { value: '2', label: 'banana bread', searchTextLower: 'banana bread' },
    { value: '3', label: 'cherry tart', searchTextLower: 'cherry tart' },
  ];

  it('returns all items for empty query', () => {
    const result = fuzzyFilterLower(items, '');
    expect(result.length).toBe(3);
  });

  it('filters by fuzzy match', () => {
    const result = fuzzyFilterLower(items, 'ap');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.label).toContain('apple');
  });

  it('returns empty for no matches', () => {
    const result = fuzzyFilterLower(items, 'zzz');
    expect(result.length).toBe(0);
  });

  it('handles multiple tokens', () => {
    const result = fuzzyFilterLower(items, 'ap pi');
    expect(result.length).toBe(1);
    expect(result[0]?.label).toBe('apple pie');
  });

  it('sorts by match quality', () => {
    const result = fuzzyFilterLower(items, 'a');
    expect(result.length).toBeGreaterThan(1);
  });
});

describe('fuzzyFilter', () => {
  const items = [
    { value: '1', label: 'Apple Pie', description: 'Dessert' },
    { value: '2', label: 'Banana Bread', description: 'Breakfast' },
  ];

  it('filters items case-insensitively', () => {
    const prepared = prepareSearchItems(items);
    const result = fuzzyFilter(prepared, 'apple');
    expect(result.length).toBe(1);
    expect(result[0]?.label).toBe('Apple Pie');
  });
});

describe('prepareSearchItems', () => {
  it('adds searchTextLower field', () => {
    const items = [{ label: 'Hello World', description: 'Test' }];
    const result = prepareSearchItems(items);
    expect(result[0]?.searchTextLower).toBeDefined();
    expect(result[0]?.searchTextLower).toContain('hello');
    expect(result[0]?.searchTextLower).toContain('world');
    expect(result[0]?.searchTextLower).toContain('test');
  });

  it('handles items with searchText', () => {
    const items = [{ label: 'Item', searchText: 'extra keywords' }];
    const result = prepareSearchItems(items);
    expect(result[0]?.searchTextLower).toContain('extra');
    expect(result[0]?.searchTextLower).toContain('keywords');
  });
});

describe('highlightMatch', () => {
  it('highlights matching substring', () => {
    const result = highlightMatch('Hello world', 'world', (s) => `[${s}]`);
    expect(result).toBe('Hello [world]');
  });

  it('returns text unchanged for empty query', () => {
    const result = highlightMatch('Hello', '', (s) => `[${s}]`);
    expect(result).toBe('Hello');
  });

  it('returns text unchanged for no match', () => {
    const result = highlightMatch('Hello', 'xyz', (s) => `[${s}]`);
    expect(result).toBe('Hello');
  });

  it('is case insensitive', () => {
    const result = highlightMatch('Hello World', 'world', (s) => `[${s}]`);
    expect(result).toBe('Hello [World]');
  });
});
