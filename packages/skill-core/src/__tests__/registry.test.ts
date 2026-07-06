import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillRegistry } from '../registry';

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('should register skills', () => {
    const handler = vi.fn().mockResolvedValue({ success: true, data: 'result' });
    const skill = registry.registerSkill(
      {
        id: 'test-skill',
        name: 'Test Skill',
        version: '1.0.0',
        description: 'A test skill',
        type: 'native',
        triggers: [{ type: 'command', command: 'test' }],
      },
      handler,
    );

    expect(skill.definition.id).toBe('test-skill');
    expect(skill.status).toBe('registered');
  });

  it('should execute skills', async () => {
    const handler = vi.fn().mockResolvedValue({ success: true, data: 'executed' });
    registry.registerSkill(
      {
        id: 'exec-skill',
        name: 'Exec Skill',
        version: '1.0.0',
        description: 'Executable',
        type: 'native',
        triggers: [],
      },
      handler,
    );

    const result = await registry.executeSkill('exec-skill', { input: 'test' });
    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalled();
  });

  it('should list skills', () => {
    registry.registerSkill(
      { id: 'skill-a', name: 'Skill A', version: '1.0.0', description: 'A', type: 'native', triggers: [] },
      async () => ({ success: true }),
    );
    registry.registerSkill(
      { id: 'skill-b', name: 'Skill B', version: '1.0.0', description: 'B', type: 'declarative', triggers: [] },
      async () => ({ success: true }),
    );

    const skills = registry.listSkills();
    expect(skills.length).toBe(2);
    expect(skills.some((s) => s.definition.id === 'skill-a')).toBe(true);
  });

  it('should return undefined for non-existent skill', () => {
    const skill = registry.getSkill('non-existent');
    expect(skill).toBeUndefined();
  });

  it('should return error when executing non-existent skill', async () => {
    const result = await registry.executeSkill('non-existent', {});
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should have size 0 when empty', () => {
    expect(registry.size()).toBe(0);
  });
});