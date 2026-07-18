import { describe, it, expect } from 'vitest';
import { classifySessionKind } from '../classify-session-kind.js';
import type { SessionKind } from '../types.js';

describe('classify-session-kind — 会话分类', () => {
  it('对 global 密钥返回 global', () => {
    expect(classifySessionKind('global')).toBe('global');
  });

  it('对 unknown 密钥返回 unknown', () => {
    expect(classifySessionKind('unknown')).toBe('unknown');
  });

  it('对 cron 密钥返回 cron', () => {
    expect(classifySessionKind('agent:agent-1:cron:job-1')).toBe('cron');
  });

  it('对有 spawnedBy 的条目返回 spawn-child', () => {
    expect(
      classifySessionKind('agent:agent-1:slack:dm:U123', { spawnedBy: 'parent-session' }),
    ).toBe('spawn-child');
  });

  it('对群组聊天类型返回 group', () => {
    expect(
      classifySessionKind('some-key', { chatType: 'group' }),
    ).toBe('group');
    expect(
      classifySessionKind('some-key', { chatType: 'channel' }),
    ).toBe('group');
  });

  it('从密钥中的 :group: 或 :channel: 推断 group', () => {
    expect(classifySessionKind('slack:group:C12345')).toBe('group');
    expect(classifySessionKind('discord:channel:general')).toBe('group');
  });

  it('默认返回 direct', () => {
    expect(classifySessionKind('agent:agent-1:slack:dm:U123')).toBe('direct');
    expect(classifySessionKind('random-key')).toBe('direct');
  });

  it('优先级: spawnedBy 优先于 chatType', () => {
    expect(
      classifySessionKind('some-key', { spawnedBy: 'parent', chatType: 'group' }),
    ).toBe('spawn-child');
  });

  it('优先级: cron 优先于 spawnedBy', () => {
    expect(
      classifySessionKind('agent:agent-1:cron:job-1', { spawnedBy: 'parent' }),
    ).toBe('cron');
  });

  describe('SessionKind 类型', () => {
    it('所有分类结果都是有效的 SessionKind', () => {
      const kinds: SessionKind[] = [
        classifySessionKind('global'),
        classifySessionKind('unknown'),
        classifySessionKind('agent:a:cron:j'),
        classifySessionKind('k', { spawnedBy: 'p' }),
        classifySessionKind('k', { chatType: 'group' }),
        classifySessionKind('slack:group:C123'),
        classifySessionKind('direct-key'),
      ];

      const validKinds = ['cron', 'direct', 'group', 'global', 'spawn-child', 'unknown'];
      kinds.forEach((kind) => {
        expect(validKinds).toContain(kind);
      });
    });
  });
});
