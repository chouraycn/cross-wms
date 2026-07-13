// Tests for skill favorites and recent-usage helpers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addFavoriteSkill,
  fuzzySkillScore,
  getFavoriteSkills,
  getRecentSkills,
  isFavoriteSkill,
  recordRecentSkill,
  removeFavoriteSkill,
  toggleFavoriteSkill,
} from '../utils/skillFavorites';

describe('skill favorites', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('starts empty', () => {
    expect(getFavoriteSkills()).toEqual([]);
    expect(isFavoriteSkill('foo')).toBe(false);
  });

  it('adds and detects favorites', () => {
    addFavoriteSkill('skill-a');
    addFavoriteSkill('skill-b');
    expect(isFavoriteSkill('skill-a')).toBe(true);
    expect(isFavoriteSkill('skill-b')).toBe(true);
    expect(isFavoriteSkill('skill-c')).toBe(false);
  });

  it('does not duplicate when adding twice', () => {
    addFavoriteSkill('skill-a');
    addFavoriteSkill('skill-a');
    expect(getFavoriteSkills()).toEqual(['skill-a']);
  });

  it('removes favorites', () => {
    addFavoriteSkill('skill-a');
    addFavoriteSkill('skill-b');
    removeFavoriteSkill('skill-a');
    expect(isFavoriteSkill('skill-a')).toBe(false);
    expect(isFavoriteSkill('skill-b')).toBe(true);
  });

  it('toggle returns new state', () => {
    expect(toggleFavoriteSkill('foo')).toBe(true);
    expect(toggleFavoriteSkill('foo')).toBe(false);
  });
});

describe('skill recent usage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('records most-recent first', () => {
    recordRecentSkill('a');
    recordRecentSkill('b');
    recordRecentSkill('c');
    expect(getRecentSkills()).toEqual(['c', 'b', 'a']);
  });

  it('deduplicates and re-orders', () => {
    recordRecentSkill('a');
    recordRecentSkill('b');
    recordRecentSkill('a');
    expect(getRecentSkills()).toEqual(['a', 'b']);
  });

  it('respects a custom limit', () => {
    recordRecentSkill('a');
    recordRecentSkill('b');
    recordRecentSkill('c');
    recordRecentSkill('d');
    expect(getRecentSkills(2)).toEqual(['d', 'c']);
  });
});

describe('fuzzySkillScore', () => {
  const skill = {
    id: 'builtin-inventory-query',
    name: '库存查询',
    trigger: '查询库存',
    tags: ['库存', '查询'],
    desc: '查询仓库库存情况',
  };

  it('returns high score on exact name match', () => {
    expect(fuzzySkillScore('库存查询', skill)).toBe(100);
  });

  it('returns zero for no match', () => {
    expect(fuzzySkillScore('xyz123nothingmatches', skill)).toBe(0);
  });

  it('matches by tag', () => {
    const score = fuzzySkillScore('库存', skill);
    expect(score).toBeGreaterThan(0);
  });

  it('matches by id with subsequence', () => {
    // "inv" is a subsequence of "builtin-inventory-query"
    expect(fuzzySkillScore('inv', skill)).toBeGreaterThan(0);
  });
});
