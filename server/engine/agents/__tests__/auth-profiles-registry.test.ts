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
  registerAuthProfile,
  updateAuthProfile,
  getAuthProfile,
  listAuthProfiles,
  deleteAuthProfile,
  getAuthProfilesByProvider,
  isAuthProfileValid,
  clearAuthProfiles,
} from '../auth-profiles-registry.js';
import type { AuthProfile } from '../auth-profiles-registry.js';

function makeProfileInput(overrides: Partial<AuthProfile> = {}) {
  return {
    id: overrides.id ?? 'test-profile',
    name: overrides.name ?? '测试',
    provider: overrides.provider ?? 'openai',
    type: overrides.type ?? ('api_key' as const),
    credentials: overrides.credentials ?? { key: 'sk-test' },
    scopes: overrides.scopes ?? [],
    expiresAt: overrides.expiresAt,
    metadata: overrides.metadata ?? {},
  };
}

describe('auth-profiles-registry', () => {
  beforeEach(() => {
    clearAuthProfiles();
  });

  describe('registerAuthProfile', () => {
    it('应注册 profile 并自动填充时间戳', () => {
      const profile = registerAuthProfile(makeProfileInput({ id: 'r1' }));
      expect(profile.id).toBe('r1');
      expect(profile.createdAt).toBeTypeOf('number');
      expect(profile.updatedAt).toBe(profile.createdAt);
      expect(getAuthProfile('r1')).toBe(profile);
    });

    it('应接受完整参数含 scopes 和 metadata', () => {
      const profile = registerAuthProfile(
        makeProfileInput({
          id: 'r2',
          scopes: ['read', 'write'],
          metadata: { env: 'prod' },
          expiresAt: 9999999999999,
        }),
      );
      expect(profile.scopes).toEqual(['read', 'write']);
      expect(profile.metadata).toEqual({ env: 'prod' });
      expect(profile.expiresAt).toBe(9999999999999);
    });

    it('应拒绝无效的 type', () => {
      expect(() =>
        registerAuthProfile(makeProfileInput({ id: 'bad', type: 'invalid' as any })),
      ).toThrow();
    });

    it('应拒绝缺少必填字段 name 的 profile', () => {
      expect(() =>
        registerAuthProfile({
          id: 'bad2',
          provider: 'openai',
          type: 'api_key',
          credentials: { key: 'sk-test' },
        } as any),
      ).toThrow();
    });
  });

  describe('updateAuthProfile', () => {
    it('应更新字段并刷新 updatedAt', () => {
      const created = registerAuthProfile(makeProfileInput({ id: 'u1' }));
      const updated = updateAuthProfile('u1', { name: '新名', credentials: { key: 'sk-new' } });
      expect(updated!.name).toBe('新名');
      expect(updated!.credentials).toEqual({ key: 'sk-new' });
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    });

    it('更新不存在的 profile 应返回 undefined', () => {
      expect(updateAuthProfile('ghost', { name: 'x' })).toBeUndefined();
    });

    it('应拒绝无效的更新值', () => {
      registerAuthProfile(makeProfileInput({ id: 'u2' }));
      expect(() =>
        updateAuthProfile('u2', { type: 'invalid' as any }),
      ).toThrow();
    });
  });

  describe('getAuthProfile', () => {
    it('应返回已存在的 profile', () => {
      registerAuthProfile(makeProfileInput({ id: 'g1' }));
      expect(getAuthProfile('g1')).toBeDefined();
      expect(getAuthProfile('g1')!.id).toBe('g1');
    });

    it('应返回 undefined 表示未找到', () => {
      expect(getAuthProfile('not-exist')).toBeUndefined();
    });
  });

  describe('listAuthProfiles', () => {
    it('应返回所有已注册的 profile', () => {
      registerAuthProfile(makeProfileInput({ id: 'l1' }));
      registerAuthProfile(makeProfileInput({ id: 'l2' }));
      expect(listAuthProfiles()).toHaveLength(2);
    });

    it('清空后应返回空数组', () => {
      registerAuthProfile(makeProfileInput({ id: 'l3' }));
      clearAuthProfiles();
      expect(listAuthProfiles()).toHaveLength(0);
    });
  });

  describe('deleteAuthProfile', () => {
    it('应删除已存在的 profile 并返回 true', () => {
      registerAuthProfile(makeProfileInput({ id: 'd1' }));
      expect(deleteAuthProfile('d1')).toBe(true);
      expect(getAuthProfile('d1')).toBeUndefined();
    });

    it('删除不存在的 profile 应返回 false', () => {
      expect(deleteAuthProfile('ghost')).toBe(false);
    });
  });

  describe('getAuthProfilesByProvider', () => {
    it('应按 provider 过滤 profile', () => {
      registerAuthProfile(makeProfileInput({ id: 'p1', provider: 'openai' }));
      registerAuthProfile(makeProfileInput({ id: 'p2', provider: 'anthropic' }));
      registerAuthProfile(makeProfileInput({ id: 'p3', provider: 'openai' }));
      const openaiProfiles = getAuthProfilesByProvider('openai');
      expect(openaiProfiles).toHaveLength(2);
      expect(openaiProfiles.every((p) => p.provider === 'openai')).toBe(true);
    });

    it('无匹配 provider 时应返回空数组', () => {
      registerAuthProfile(makeProfileInput({ id: 'p4', provider: 'openai' }));
      expect(getAuthProfilesByProvider('unknown')).toEqual([]);
    });
  });

  describe('isAuthProfileValid', () => {
    it('无 expiresAt 时应返回 true', () => {
      const profile = registerAuthProfile(makeProfileInput({ id: 'v1' }));
      expect(isAuthProfileValid(profile)).toBe(true);
    });

    it('expiresAt 在未来时应返回 true', () => {
      const profile = registerAuthProfile(
        makeProfileInput({ id: 'v2', expiresAt: Date.now() + 10000 }),
      );
      expect(isAuthProfileValid(profile)).toBe(true);
    });

    it('expiresAt 在过去时应返回 false', () => {
      const profile = registerAuthProfile(
        makeProfileInput({ id: 'v3', expiresAt: Date.now() - 10000 }),
      );
      expect(isAuthProfileValid(profile)).toBe(false);
    });
  });

  describe('clearAuthProfiles', () => {
    it('应清空所有 profile', () => {
      registerAuthProfile(makeProfileInput({ id: 'c1' }));
      registerAuthProfile(makeProfileInput({ id: 'c2' }));
      clearAuthProfiles();
      expect(listAuthProfiles()).toHaveLength(0);
      expect(getAuthProfile('c1')).toBeUndefined();
    });
  });
});
