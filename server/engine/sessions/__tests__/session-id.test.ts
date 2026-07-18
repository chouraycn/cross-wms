import { describe, it, expect } from 'vitest';
import { generateSessionId, looksLikeSessionId, normalizeSessionId, SESSION_ID_RE } from '../session-id.js';

describe('session-id — 会话 ID', () => {
  describe('generateSessionId', () => {
    it('生成符合 UUID 格式的会话 ID', () => {
      const id = generateSessionId();
      expect(SESSION_ID_RE.test(id)).toBe(true);
    });

    it('每次生成的 ID 都不同', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('looksLikeSessionId', () => {
    it('对有效的 UUID 返回 true', () => {
      expect(looksLikeSessionId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(looksLikeSessionId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    });

    it('对大写的 UUID 也返回 true', () => {
      expect(looksLikeSessionId('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('对无效的字符串返回 false', () => {
      expect(looksLikeSessionId('not-a-uuid')).toBe(false);
      expect(looksLikeSessionId('')).toBe(false);
      expect(looksLikeSessionId('12345')).toBe(false);
      expect(looksLikeSessionId('550e8400-e29b-41d4-a716')).toBe(false);
    });

    it('忽略前后空格', () => {
      expect(looksLikeSessionId('  550e8400-e29b-41d4-a716-446655440000  ')).toBe(true);
    });
  });

  describe('normalizeSessionId', () => {
    it('规范化有效的 UUID 为小写', () => {
      expect(normalizeSessionId('550E8400-E29B-41D4-A716-446655440000')).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('对无效的字符串返回空字符串', () => {
      expect(normalizeSessionId('not-a-uuid')).toBe('');
      expect(normalizeSessionId('')).toBe('');
      expect(normalizeSessionId(null)).toBe('');
      expect(normalizeSessionId(undefined)).toBe('');
    });
  });
});
