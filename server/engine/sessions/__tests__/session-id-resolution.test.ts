import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveSessionIdMatchSelection,
  resolvePreferredSessionKeyForSessionIdMatches,
  findExactSessionIdMatch,
  findSessionsByIdSubstring,
  resolveSessionReference,
} from '../session-id-resolution.js';
import type { SessionRecord } from '../types.js';

function createMockSession(id: string, key: string, lastActivityAt: number): SessionRecord {
  return {
    id,
    key,
    status: 'active',
    metadata: {},
    stats: {
      messageCount: 0,
      toolCallCount: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      lastActivityAt,
      createdAt: lastActivityAt - 1000,
      totalDurationMs: 0,
    },
  };
}

describe('session-id-resolution — 会话 ID 解析', () => {
  describe('resolveSessionIdMatchSelection', () => {
    it('空匹配返回 none', () => {
      const result = resolveSessionIdMatchSelection([], 'test-id');
      expect(result.kind).toBe('none');
    });

    it('单个匹配返回 selected', () => {
      const session = createMockSession(
        '550e8400-e29b-41d4-a716-446655440000',
        'agent:agent-1:session-1',
        1000,
      );
      const matches: Array<[string, SessionRecord]> = [['agent:agent-1:session-1', session]];

      const result = resolveSessionIdMatchSelection(matches, '550e8400-e29b-41d4-a716-446655440000');
      expect(result.kind).toBe('selected');
      if (result.kind === 'selected') {
        expect(result.sessionKey).toBe('agent:agent-1:session-1');
      }
    });

    it('多个不同活动时间的匹配选择最新的', () => {
      const session1 = createMockSession(
        '550e8400-e29b-41d4-a716-446655440000',
        'session-1',
        1000,
      );
      const session2 = createMockSession(
        '550e8400-e29b-41d4-a716-446655440001',
        'session-2',
        2000,
      );
      const matches: Array<[string, SessionRecord]> = [
        ['session-1', session1],
        ['session-2', session2],
      ];

      const result = resolveSessionIdMatchSelection(matches, '550e8400');
      expect(result.kind).toBe('selected');
      if (result.kind === 'selected') {
        expect(result.sessionKey).toBe('session-2');
      }
    });

    it('相同活动时间的多个匹配返回 ambiguous', () => {
      const session1 = createMockSession(
        '550e8400-e29b-41d4-a716-446655440000',
        'session-1',
        1000,
      );
      const session2 = createMockSession(
        '550e8400-e29b-41d4-a716-446655440001',
        'session-2',
        1000,
      );
      const matches: Array<[string, SessionRecord]> = [
        ['session-1', session1],
        ['session-2', session2],
      ];

      const result = resolveSessionIdMatchSelection(matches, '550e8400');
      expect(result.kind).toBe('ambiguous');
    });
  });

  describe('resolvePreferredSessionKeyForSessionIdMatches', () => {
    it('选中时返回会话密钥', () => {
      const session = createMockSession(
        '550e8400-e29b-41d4-a716-446655440000',
        'my-session',
        1000,
      );
      const matches: Array<[string, SessionRecord]> = [['my-session', session]];

      const result = resolvePreferredSessionKeyForSessionIdMatches(
        matches,
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(result).toBe('my-session');
    });

    it('未选中时返回 undefined', () => {
      const result = resolvePreferredSessionKeyForSessionIdMatches([], 'test-id');
      expect(result).toBeUndefined();
    });
  });

  describe('findExactSessionIdMatch', () => {
    it('找到精确匹配的会话', () => {
      const sessions = new Map<string, SessionRecord>();
      const session = createMockSession(
        '550e8400-e29b-41d4-a716-446655440000',
        'test-session',
        1000,
      );
      sessions.set('test-session', session);

      const result = findExactSessionIdMatch(
        sessions,
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(result).not.toBeUndefined();
      expect(result?.key).toBe('test-session');
    });

    it('不区分大小写匹配', () => {
      const sessions = new Map<string, SessionRecord>();
      const session = createMockSession(
        '550e8400-e29b-41d4-a716-446655440000',
        'test-session',
        1000,
      );
      sessions.set('test-session', session);

      const result = findExactSessionIdMatch(
        sessions,
        '550E8400-E29B-41D4-A716-446655440000',
      );
      expect(result).not.toBeUndefined();
    });

    it('未找到时返回 undefined', () => {
      const sessions = new Map<string, SessionRecord>();
      const result = findExactSessionIdMatch(sessions, 'non-existent-id');
      expect(result).toBeUndefined();
    });

    it('无效的 ID 格式返回 undefined', () => {
      const sessions = new Map<string, SessionRecord>();
      const result = findExactSessionIdMatch(sessions, 'not-a-uuid');
      expect(result).toBeUndefined();
    });
  });

  describe('findSessionsByIdSubstring', () => {
    it('找到 ID 包含子字符串的会话', () => {
      const sessions = new Map<string, SessionRecord>();
      const session1 = createMockSession(
        '550e8400-e29b-41d4-a716-446655440000',
        'session-1',
        1000,
      );
      const session2 = createMockSession(
        '123e4567-e89b-12d3-a456-426614174000',
        'session-2',
        2000,
      );
      sessions.set('session-1', session1);
      sessions.set('session-2', session2);

      const result = findSessionsByIdSubstring(sessions, '550e8400');
      expect(result).toHaveLength(1);
      expect(result[0][0]).toBe('session-1');
    });

    it('空子字符串返回空数组', () => {
      const sessions = new Map<string, SessionRecord>();
      const result = findSessionsByIdSubstring(sessions, '');
      expect(result).toEqual([]);
    });
  });

  describe('resolveSessionReference', () => {
    let sessions: Map<string, SessionRecord>;

    beforeEach(() => {
      sessions = new Map();
      sessions.set(
        'agent:agent-1:slack:dm:U123',
        createMockSession('550e8400-e29b-41d4-a716-446655440000', 'agent:agent-1:slack:dm:U123', 1000),
      );
      sessions.set(
        'agent:agent-1:slack:group:C456',
        createMockSession('123e4567-e89b-12d3-a456-426614174000', 'agent:agent-1:slack:group:C456', 2000),
      );
    });

    it('通过精确 UUID 匹配', () => {
      const result = resolveSessionReference(sessions, '550e8400-e29b-41d4-a716-446655440000');
      expect(result.kind).toBe('selected');
      if (result.kind === 'selected') {
        expect(result.sessionKey).toBe('agent:agent-1:slack:dm:U123');
      }
    });

    it('通过密钥子字符串匹配', () => {
      const result = resolveSessionReference(sessions, 'U123');
      expect(result.kind).toBe('selected');
      if (result.kind === 'selected') {
        expect(result.sessionKey).toBe('agent:agent-1:slack:dm:U123');
      }
    });

    it('没有匹配时返回 none', () => {
      const result = resolveSessionReference(sessions, 'non-existent');
      expect(result.kind).toBe('none');
    });

    it('空引用返回 none', () => {
      const result = resolveSessionReference(sessions, '');
      expect(result.kind).toBe('none');
    });
  });
});
