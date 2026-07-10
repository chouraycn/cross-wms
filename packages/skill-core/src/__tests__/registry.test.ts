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

describe('SkillRegistry trigger types', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('matches intent trigger when intents supplied via options', () => {
    registry.registerSkill(
      {
        id: 'intent-skill',
        name: 'Intent Skill',
        version: '1.0.0',
        description: 'Handles query intent',
        type: 'native',
        triggers: [{ type: 'intent', intent: 'query' }],
      },
      async () => ({ success: true }),
    );
    registry.enableSkill('intent-skill');

    const matches = registry.matchTriggers('帮我查询库存', { intents: ['query'] });
    expect(matches.length).toBe(1);
    expect(matches[0].skillId).toBe('intent-skill');
    expect(matches[0].confidence).toBe(0.85);
  });

  it('does not match intent trigger when no intents supplied', () => {
    registry.registerSkill(
      {
        id: 'intent-skill-2',
        name: 'Intent Skill 2',
        version: '1.0.0',
        description: 'Handles analyze intent',
        type: 'native',
        triggers: [{ type: 'intent', intent: 'analyze' }],
      },
      async () => ({ success: true }),
    );

    expect(registry.matchTriggers('随便说点什么').length).toBe(0);
  });

  it('matches intent trigger with confidence objects', () => {
    registry.registerSkill(
      {
        id: 'intent-skill-3',
        name: 'Intent Skill 3',
        version: '1.0.0',
        description: 'Handles create intent',
        type: 'native',
        triggers: [{ type: 'intent', intent: 'create' }],
      },
      async () => ({ success: true }),
    );
    registry.enableSkill('intent-skill-3');

    const matches = registry.matchTriggers('x', { intents: [{ intent: 'create', confidence: 0.95 }] });
    expect(matches.length).toBe(1);
    expect(matches[0].confidence).toBe(0.95);
  });

  it('matches event triggers with exact / wildcard / prefix', () => {
    registry.registerSkill(
      {
        id: 'evt-exact',
        name: 'Exact',
        version: '1.0.0',
        description: 'd',
        type: 'native',
        triggers: [{ type: 'event', event: 'message.received' }],
      },
      async () => ({ success: true }),
    );
    registry.registerSkill(
      {
        id: 'evt-prefix',
        name: 'Prefix',
        version: '1.0.0',
        description: 'd',
        type: 'native',
        triggers: [{ type: 'event', event: 'message.*' }],
      },
      async () => ({ success: true }),
    );
    registry.registerSkill(
      {
        id: 'evt-wild',
        name: 'Wild',
        version: '1.0.0',
        description: 'd',
        type: 'native',
        triggers: [{ type: 'event', event: '*' }],
      },
      async () => ({ success: true }),
    );
    registry.enableSkill('evt-exact');
    registry.enableSkill('evt-prefix');
    registry.enableSkill('evt-wild');

    const matches = registry.matchEventTriggers('message.received');
    const ids = matches.map((m) => m.skillId).sort();
    expect(ids).toEqual(['evt-exact', 'evt-prefix', 'evt-wild']);
  });

  it('does not match event trigger on mismatch', () => {
    registry.registerSkill(
      {
        id: 'evt-no',
        name: 'No',
        version: '1.0.0',
        description: 'd',
        type: 'native',
        triggers: [{ type: 'event', event: 'session.created' }],
      },
      async () => ({ success: true }),
    );

    expect(registry.matchEventTriggers('message.received').length).toBe(0);
  });

  it('enumerates schedule triggers', () => {
    registry.registerSkill(
      {
        id: 'sched-skill',
        name: 'Sched',
        version: '1.0.0',
        description: 'd',
        type: 'native',
        triggers: [{ type: 'schedule', schedule: '0 9 * * *' }],
      },
      async () => ({ success: true }),
    );
    registry.enableSkill('sched-skill');

    const schedules = registry.getScheduleTriggers();
    expect(schedules.length).toBe(1);
    expect(schedules[0].skillId).toBe('sched-skill');
    expect(schedules[0].schedule).toBe('0 9 * * *');
  });

  it('skips disabled skills for all trigger types', () => {
    registry.registerSkill(
      {
        id: 'disabled-skill',
        name: 'Disabled',
        version: '1.0.0',
        description: 'd',
        type: 'native',
        triggers: [
          { type: 'intent', intent: 'query' },
          { type: 'event', event: 'message.received' },
          { type: 'schedule', schedule: '0 9 * * *' },
        ],
      },
      async () => ({ success: true }),
    );
    registry.disableSkill('disabled-skill');

    expect(registry.matchTriggers('x', { intents: ['query'] }).length).toBe(0);
    expect(registry.matchEventTriggers('message.received').length).toBe(0);
    expect(registry.getScheduleTriggers().length).toBe(0);
  });
});