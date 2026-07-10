import { describe, it, expect, vi } from 'vitest';
import {
  SkillTriggerRouter,
  parseTrigger,
} from '../skillTriggerRouter.js';
import type { RegisteredSkill } from '../../types/skill-runtime.js';

function makeSkill(id: string, triggers: string[], status: RegisteredSkill['status'] = 'enabled'): RegisteredSkill {
  return {
    status,
    definition: { id, triggers },
  } as unknown as RegisteredSkill;
}

describe('parseTrigger', () => {
  it('parses intent / event / schedule prefixes', () => {
    expect(parseTrigger('intent:query')).toEqual({ type: 'intent', value: 'query' });
    expect(parseTrigger('event:message.received')).toEqual({ type: 'event', value: 'message.received' });
    expect(parseTrigger('schedule:0 9 * * *')).toEqual({ type: 'schedule', value: '0 9 * * *' });
  });

  it('returns null for non-prefixed or empty triggers', () => {
    expect(parseTrigger('plainkeyword')).toBeNull();
    expect(parseTrigger('intent:')).toBeNull();
  });
});

describe('SkillTriggerRouter', () => {
  it('matches intent triggers from recognized intents', () => {
    const skills = [
      makeSkill('stock-query', ['intent:query', 'intent:analyze']),
      makeSkill('stock-create', ['intent:create']),
    ];
    const router = new SkillTriggerRouter(() => skills);

    const matches = router.matchIntentResults(['query']);
    expect(matches.map((m) => m.skillId)).toEqual(['stock-query']);
  });

  it('matches event triggers with exact and wildcard', () => {
    const skills = [
      makeSkill('on-received', ['event:message.received']),
      makeSkill('on-any-message', ['event:message.*']),
      makeSkill('on-all', ['event:*']),
    ];
    const router = new SkillTriggerRouter(() => skills);

    const matches = router.matchEvent('message.received');
    expect(matches.map((m) => m.skillId).sort()).toEqual(['on-all', 'on-any-message', 'on-received']);
  });

  it('does not match event trigger on mismatch', () => {
    const skills = [makeSkill('on-session', ['event:session.created'])];
    const router = new SkillTriggerRouter(() => skills);
    expect(router.matchEvent('message.received').length).toBe(0);
  });

  it('enumerates schedule triggers', () => {
    const skills = [makeSkill('daily-report', ['schedule:0 9 * * *', 'intent:summarize'])];
    const router = new SkillTriggerRouter(() => skills);

    const schedules = router.getScheduleTriggers();
    expect(schedules).toEqual([{ skillId: 'daily-report', schedule: '0 9 * * *' }]);
  });

  it('registerSchedules delegates to the provided register fn', () => {
    const skills = [
      makeSkill('a', ['schedule:0 9 * * *']),
      makeSkill('b', ['schedule:*/5 * * * *']),
    ];
    const router = new SkillTriggerRouter(() => skills);
    const register = vi.fn();

    router.registerSchedules(register);
    expect(register).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenCalledWith({ skillId: 'a', schedule: '0 9 * * *' });
  });

  it('skips disabled skills', () => {
    const skills = [makeSkill('disabled-intent', ['intent:query'], 'disabled')];
    const router = new SkillTriggerRouter(() => skills);
    expect(router.matchIntentResults(['query']).length).toBe(0);
  });
});
