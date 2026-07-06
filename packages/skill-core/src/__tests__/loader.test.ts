import { describe, it, expect, beforeEach } from 'vitest';
import { SkillLoader } from '../loader';

describe('SkillLoader', () => {
  let loader: SkillLoader;

  beforeEach(() => {
    loader = new SkillLoader();
  });

  it('should load skills from directory', async () => {
    const skills = await loader.loadFromDirectory('./test-skills');
    expect(Array.isArray(skills)).toBe(true);
  });

  it('should list loaded skills', () => {
    const skills = loader.listLoadedSkills();
    expect(Array.isArray(skills)).toBe(true);
  });

  it('should return false for isLoaded when skill not loaded', () => {
    expect(loader.isLoaded('non-existent')).toBe(false);
  });

  it('should return 0 for size when no skills loaded', () => {
    expect(loader.size()).toBe(0);
  });
});