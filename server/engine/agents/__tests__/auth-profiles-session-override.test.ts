import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  setSessionAuthOverride,
  getSessionAuthOverride,
  clearSessionAuthOverride,
  applySessionOverride,
  listSessionAuthOverrides,
  cleanupExpiredOverrides,
} from '../auth-profiles-session-override.js';
import { registerAuthProfile, clearAuthProfiles } from '../auth-profiles-registry.js';
import type { AuthProfile } from '../auth-profiles-registry.js';

function makeBaseProfile(id: string): AuthProfile {
  return registerAuthProfile({
    id,
    name: id,
    provider: 'openai',
    type: 'api_key',
    credentials: { key: 'sk-test' },
    scopes: [],
    metadata: {},
  });
}

describe('auth-profiles-session-override', () => {
  beforeEach(() => {
    clearAuthProfiles();
    // 清空 session override store：逐个清除
    for (const ov of listSessionAuthOverrides()) {
      clearSessionAuthOverride(ov.sessionId);
    }
  });

  describe('setSessionAuthOverride', () => {
    it('应创建 override 并自动填充 createdAt', () => {
      const ov = setSessionAuthOverride('sess1', 'profile1', { name: '覆盖名' });
      expect(ov.sessionId).toBe('sess1');
      expect(ov.profileId).toBe('profile1');
      expect(ov.overrides).toEqual({ name: '覆盖名' });
      expect(ov.createdAt).toBeTypeOf('number');
      expect(ov.expiresAt).toBeUndefined();
    });

    it('应接受 expiresAt 参数', () => {
      const ov = setSessionAuthOverride('sess2', 'profile2', {}, Date.now() + 5000);
      expect(ov.expiresAt).toBeTypeOf('number');
    });

    it('同 sessionId 重复设置应覆盖', () => {
      setSessionAuthOverride('sess3', 'p1', { name: '第一' });
      setSessionAuthOverride('sess3', 'p2', { name: '第二' });
      const ov = getSessionAuthOverride('sess3');
      expect(ov!.profileId).toBe('p2');
      expect(ov!.overrides.name).toBe('第二');
    });
  });

  describe('getSessionAuthOverride', () => {
    it('应返回已存在的 override', () => {
      setSessionAuthOverride('sess4', 'p', { name: 'x' });
      expect(getSessionAuthOverride('sess4')).toBeDefined();
      expect(getSessionAuthOverride('sess4')!.profileId).toBe('p');
    });

    it('应返回 undefined 表示未找到', () => {
      expect(getSessionAuthOverride('ghost')).toBeUndefined();
    });

    it('过期 override 应返回 undefined 并自动删除', () => {
      setSessionAuthOverride('sess5', 'p', {}, Date.now() - 1000);
      expect(getSessionAuthOverride('sess5')).toBeUndefined();
    });

    it('未过期的 override 应正常返回', () => {
      setSessionAuthOverride('sess6', 'p', {}, Date.now() + 5000);
      expect(getSessionAuthOverride('sess6')).toBeDefined();
    });
  });

  describe('clearSessionAuthOverride', () => {
    it('应清除已存在的 override 并返回 true', () => {
      setSessionAuthOverride('sess7', 'p', {});
      expect(clearSessionAuthOverride('sess7')).toBe(true);
      expect(getSessionAuthOverride('sess7')).toBeUndefined();
    });

    it('清除不存在的 override 应返回 false', () => {
      expect(clearSessionAuthOverride('ghost')).toBe(false);
    });
  });

  describe('applySessionOverride', () => {
    it('无 override 时应返回原 profile', () => {
      const profile = makeBaseProfile('orig1');
      const result = applySessionOverride(profile, 'no-override-session');
      expect(result).toEqual(profile);
    });

    it('override 的 profileId 不匹配时应返回原 profile', () => {
      const profile = makeBaseProfile('orig2');
      setSessionAuthOverride('sess8', 'other-profile', { name: 'x' });
      const result = applySessionOverride(profile, 'sess8');
      expect(result).toEqual(profile);
    });

    it('override 的 profileId 匹配时应合并覆盖字段', () => {
      const profile = makeBaseProfile('orig3');
      setSessionAuthOverride('sess9', 'orig3', { name: '覆盖名', scopes: ['custom'] });
      const result = applySessionOverride(profile, 'sess9');
      expect(result.name).toBe('覆盖名');
      expect(result.scopes).toEqual(['custom']);
      // 未覆盖的字段应保留原值
      expect(result.provider).toBe('openai');
      expect(result.id).toBe('orig3');
    });

    it('合并后应刷新 updatedAt', () => {
      const profile = makeBaseProfile('orig4');
      const originalUpdatedAt = profile.updatedAt;
      setSessionAuthOverride('sess10', 'orig4', { name: '新名' });
      const result = applySessionOverride(profile, 'sess10');
      expect(result.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  describe('listSessionAuthOverrides', () => {
    it('应返回所有 override', () => {
      setSessionAuthOverride('s1', 'p', {});
      setSessionAuthOverride('s2', 'p', {});
      expect(listSessionAuthOverrides()).toHaveLength(2);
    });

    it('清空后应返回空数组', () => {
      setSessionAuthOverride('s3', 'p', {});
      clearSessionAuthOverride('s3');
      expect(listSessionAuthOverrides()).toHaveLength(0);
    });
  });

  describe('cleanupExpiredOverrides', () => {
    it('应移除过期 override 并返回移除数量', () => {
      setSessionAuthOverride('expired1', 'p', {}, Date.now() - 1000);
      setSessionAuthOverride('expired2', 'p', {}, Date.now() - 2000);
      setSessionAuthOverride('alive', 'p', {}, Date.now() + 5000);
      const count = cleanupExpiredOverrides();
      expect(count).toBe(2);
      expect(listSessionAuthOverrides()).toHaveLength(1);
      expect(getSessionAuthOverride('alive')).toBeDefined();
    });

    it('无过期 override 时应返回 0', () => {
      setSessionAuthOverride('alive2', 'p', {}, Date.now() + 5000);
      expect(cleanupExpiredOverrides()).toBe(0);
    });

    it('无 override 时应返回 0', () => {
      expect(cleanupExpiredOverrides()).toBe(0);
    });

    it('无 expiresAt 的 override 不应被移除', () => {
      setSessionAuthOverride('no-expiry', 'p', {});
      expect(cleanupExpiredOverrides()).toBe(0);
      expect(getSessionAuthOverride('no-expiry')).toBeDefined();
    });
  });
});
