/**
 * AdvancedTriggerEngine 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AdvancedTriggerEngine, advancedTriggerEngine } from '../advanced-triggers.js';
import type { AdvancedTrigger } from '../advanced-triggers.js';

describe('AdvancedTriggerEngine', () => {
  let engine: AdvancedTriggerEngine;

  beforeEach(() => {
    engine = new AdvancedTriggerEngine();
  });

  it('should match keyword trigger', async () => {
    const triggers: AdvancedTrigger[] = [
      { type: 'keyword', keywords: ['hello', 'hi'] },
    ];

    const matches = await engine.match('say hello world', triggers);
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe(0.5);
  });

  it('should match regex trigger', async () => {
    const triggers: AdvancedTrigger[] = [
      { type: 'regex', pattern: '\\b\\d{4}-\\d{2}-\\d{2}\\b' },
    ];

    const matches = await engine.match('meeting on 2024-01-15', triggers);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedText).toBe('2024-01-15');
  });

  it('should match command trigger', async () => {
    const triggers: AdvancedTrigger[] = [
      { type: 'command', command: 'help' },
    ];

    const matches = await engine.match('/help something', triggers);
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe(1);
  });

  it('should match fuzzy trigger with built-in levenshtein', async () => {
    const triggers: AdvancedTrigger[] = [
      { type: 'fuzzy', pattern: 'weather', maxDistance: 2 },
    ];

    const matches = await engine.match('what is the wether today', triggers);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].trigger.type).toBe('fuzzy');
  });

  it('should match composite AND trigger', async () => {
    const triggers: AdvancedTrigger[] = [
      {
        type: 'composite',
        operator: 'AND',
        triggers: [
          { type: 'keyword', keywords: ['weather'] },
          { type: 'keyword', keywords: ['today'] },
        ],
      },
    ];

    const matches = await engine.match('what is the weather today', triggers);
    expect(matches).toHaveLength(1);
  });

  it('should match composite NOT trigger', async () => {
    const triggers: AdvancedTrigger[] = [
      {
        type: 'composite',
        operator: 'NOT',
        triggers: [
          { type: 'keyword', keywords: ['forbidden'] },
        ],
      },
    ];

    const matches = await engine.match('this is normal text', triggers);
    expect(matches).toHaveLength(1);

    const noMatches = await engine.match('this has forbidden word', triggers);
    expect(noMatches).toHaveLength(0);
  });

  it('singleton advancedTriggerEngine should be available', () => {
    expect(advancedTriggerEngine).toBeInstanceOf(AdvancedTriggerEngine);
  });
});
