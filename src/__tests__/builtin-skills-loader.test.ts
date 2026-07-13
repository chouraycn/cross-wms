// Tests for the builtin-skills lazy loader.
import { describe, expect, it, beforeEach } from 'vitest';
import {
  getBuiltinSkillsSync,
  loadBuiltinSkills,
  __resetBuiltinSkillsCacheForTests,
} from '../types/builtin-skills-loader';

describe('builtin-skills-loader', () => {
  beforeEach(() => {
    __resetBuiltinSkillsCacheForTests();
  });

  it('returns an empty array on first sync read', () => {
    expect(getBuiltinSkillsSync()).toEqual([]);
  });

  it('loads the catalog on demand and caches the result', async () => {
    const first = await loadBuiltinSkills();
    expect(first.length).toBeGreaterThan(0);
    const second = await loadBuiltinSkills();
    expect(second).toBe(first);
  });

  it('exposes the cached data through getBuiltinSkillsSync after loading', async () => {
    await loadBuiltinSkills();
    const sync = getBuiltinSkillsSync();
    expect(sync.length).toBeGreaterThan(0);
  });
});
