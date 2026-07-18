/**
 * 运行时模块测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecretsRuntime, isResolvedFromCache, DEFAULT_RUNTIME_CACHE_TTL_MS } from '../runtime.js';
import { ProviderRegistry, EnvProvider } from '../provider.js';
import type { SecretRef, ResolvedSecret } from '../types.js';

describe('运行时模块', () => {
  let registry: ProviderRegistry;
  let runtime: SecretsRuntime;

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.register(new EnvProvider({ env: { RUNTIME_KEY: 'rt-value-12345', FALLBACK_KEY: 'fb-value' } }));
    runtime = new SecretsRuntime({ registry, cacheTtlMs: 1000 });
  });

  describe('基础获取', () => {
    it('应能获取 env 密钥', () => {
      const ref: SecretRef = { provider: 'env', key: 'RUNTIME_KEY' };
      expect(runtime.get(ref)).toBe('rt-value-12345');
    });

    it('未定义密钥应返回 null', () => {
      const ref: SecretRef = { provider: 'env', key: 'UNDEFINED' };
      expect(runtime.get(ref)).toBeNull();
    });

    it('异步获取应与同步一致', async () => {
      const ref: SecretRef = { provider: 'env', key: 'RUNTIME_KEY' };
      const sync = runtime.get(ref);
      const async = await runtime.getAsync(ref);
      expect(sync).toBe(async);
    });
  });

  describe('缓存', () => {
    it('第二次获取应命中缓存（hits 增加）', () => {
      const ref: SecretRef = { provider: 'env', key: 'RUNTIME_KEY' };
      runtime.get(ref);
      runtime.get(ref);
      const stats = runtime.getRawStats();
      expect(stats.hits).toBeGreaterThanOrEqual(1);
    });

    it('invalidate 后应重新解析', () => {
      const ref: SecretRef = { provider: 'env', key: 'RUNTIME_KEY' };
      runtime.get(ref);
      runtime.invalidate('env', 'RUNTIME_KEY');
      runtime.get(ref);
      const stats = runtime.getRawStats();
      expect(stats.invalidations).toBeGreaterThanOrEqual(1);
    });

    it('invalidateAll 应清空全部缓存', () => {
      runtime.get({ provider: 'env', key: 'RUNTIME_KEY' });
      runtime.get({ provider: 'env', key: 'FALLBACK_KEY' });
      runtime.invalidateAll();
      const stats = runtime.getRawStats();
      expect(stats.invalidations).toBeGreaterThanOrEqual(2);
    });

    it('enableCache=false 时不应缓存', () => {
      const noCacheRuntime = new SecretsRuntime({ registry, enableCache: false });
      noCacheRuntime.get({ provider: 'env', key: 'RUNTIME_KEY' });
      noCacheRuntime.get({ provider: 'env', key: 'RUNTIME_KEY' });
      const stats = noCacheRuntime.getRawStats();
      expect(stats.hits).toBe(0);
    });
  });

  describe('回退链', () => {
    it('应返回首个可用值', () => {
      const refs: SecretRef[] = [
        { provider: 'env', key: 'UNDEFINED' },
        { provider: 'env', key: 'FALLBACK_KEY' },
      ];
      expect(runtime.getWithFallback(refs)).toBe('fb-value');
    });

    it('全部失败应返回 null', () => {
      const refs: SecretRef[] = [{ provider: 'env', key: 'UNDEFINED' }];
      expect(runtime.getWithFallback(refs)).toBeNull();
    });

    it('空数组应返回 null', () => {
      expect(runtime.getWithFallback([])).toBeNull();
    });
  });

  describe('模板解析', () => {
    it('应解析模板中的占位符', () => {
      const template = 'key=${secret:env:RUNTIME_KEY}';
      expect(runtime.resolveTemplate(template)).toBe('key=rt-value-12345');
    });
  });

  describe('会话与快照', () => {
    it('setSession 应设置 sessionId', () => {
      runtime.setSession('test-session');
      const snap = runtime.snapshot();
      expect(snap.sessionId).toBe('test-session');
    });

    it('setActiveSecrets 应记录活跃密钥', () => {
      const refs: SecretRef[] = [{ provider: 'env', key: 'RUNTIME_KEY' }];
      runtime.setActiveSecrets(refs);
      const snap = runtime.snapshot();
      expect(snap.activeSecrets).toHaveLength(1);
      expect(snap.activeSecrets[0].key).toBe('RUNTIME_KEY');
    });
  });

  describe('统计', () => {
    it('getStats 应返回命中率', () => {
      runtime.get({ provider: 'env', key: 'RUNTIME_KEY' });
      runtime.get({ provider: 'env', key: 'RUNTIME_KEY' });
      const stats = runtime.getStats();
      expect(stats.cacheHitRate).toBeGreaterThan(0);
    });

    it('byProvider 应按 provider 分组', () => {
      runtime.get({ provider: 'env', key: 'RUNTIME_KEY' });
      const stats = runtime.getStats();
      expect(stats.byProvider.env).toBeGreaterThanOrEqual(1);
    });
  });

  describe('常量与工具', () => {
    it('DEFAULT_RUNTIME_CACHE_TTL_MS 应为正数', () => {
      expect(DEFAULT_RUNTIME_CACHE_TTL_MS).toBeGreaterThan(0);
    });

    it('isResolvedFromCache 应正确判断', () => {
      const cached: ResolvedSecret = {
        ref: { provider: 'env', key: 'X' },
        value: 'v',
        source: 'env',
        resolvedAt: Date.now(),
        cached: true,
      };
      const notCached: ResolvedSecret = { ...cached, cached: false };
      expect(isResolvedFromCache(cached)).toBe(true);
      expect(isResolvedFromCache(notCached)).toBe(false);
    });
  });

  describe('registerStoreInvalidation', () => {
    it('多次调用应只注册一次', () => {
      // 此方法依赖 store 模块，此处仅验证不抛错
      expect(() => runtime.registerStoreInvalidation()).not.toThrow();
      expect(() => runtime.registerStoreInvalidation()).not.toThrow();
    });
  });
});
