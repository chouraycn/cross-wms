/**
 * Cache Manager 单元测试
 *
 * 覆盖 CacheManager 的核心功能：
 * - 多命名空间缓存管理
 * - 缓存统计聚合
 * - 命名空间生命周期（创建、删除、清空）
 * - 过期清理
 * - 预定义命名空间便捷方法
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  cacheManager,
  CACHE_NAMESPACES,
  getPluginCache,
  getModelCache,
  getMemoryCache,
  getEmbeddingCache,
} from '../cache-manager.js';

describe('CacheManager', () => {
  beforeEach(() => {
    // 彻底删除所有命名空间，确保测试间隔离
    for (const name of cacheManager.getCacheNames()) {
      cacheManager.deleteCache(name);
    }
  });

  describe('基本操作', () => {
    it('获取不存在的命名空间会自动创建', () => {
      const cache = cacheManager.getCache('test-ns');
      expect(cache).toBeDefined();
      expect(cacheManager.hasCache('test-ns')).toBe(true);
    });

    it('同名命名空间返回同一实例', () => {
      const cache1 = cacheManager.getCache('test-ns');
      const cache2 = cacheManager.getCache('test-ns');
      expect(cache1).toBe(cache2);
    });

    it('不同命名空间返回不同实例', () => {
      const cache1 = cacheManager.getCache('ns-1');
      const cache2 = cacheManager.getCache('ns-2');
      expect(cache1).not.toBe(cache2);
    });

    it('可以指定自定义选项创建缓存', () => {
      const cache = cacheManager.getCache('custom-ns', {
        maxSize: 10,
        defaultTTL: 5000,
      });
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });
  });

  describe('删除和清空', () => {
    it('deleteCache 删除命名空间', () => {
      cacheManager.getCache('to-delete').set('k', 'v');
      expect(cacheManager.hasCache('to-delete')).toBe(true);

      const deleted = cacheManager.deleteCache('to-delete');
      expect(deleted).toBe(true);
      expect(cacheManager.hasCache('to-delete')).toBe(false);
    });

    it('deleteCache 不存在的命名空间返回 false', () => {
      expect(cacheManager.deleteCache('nonexistent')).toBe(false);
    });

    it('clearCache 清空命名空间内容但不删除', () => {
      const cache = cacheManager.getCache('to-clear');
      cache.set('k', 'v');
      expect(cache.size()).toBe(1);

      const cleared = cacheManager.clearCache('to-clear');
      expect(cleared).toBe(true);
      expect(cacheManager.hasCache('to-clear')).toBe(true);
      expect(cache.size()).toBe(0);
    });

    it('clearCache 不存在的命名空间返回 false', () => {
      expect(cacheManager.clearCache('nonexistent')).toBe(false);
    });

    it('clearAll 清空所有命名空间', () => {
      cacheManager.getCache('ns-1').set('k1', 'v1');
      cacheManager.getCache('ns-2').set('k2', 'v2');

      cacheManager.clearAll();

      expect(cacheManager.getCache('ns-1').size()).toBe(0);
      expect(cacheManager.getCache('ns-2').size()).toBe(0);
    });
  });

  describe('统计信息', () => {
    it('getStats 返回整体统计', () => {
      cacheManager.getCache('ns-1').set('k', 'v');
      cacheManager.getCache('ns-2').set('k', 'v');

      const stats = cacheManager.getStats();
      expect(stats.totalCaches).toBe(2);
      expect(stats.totalEntries).toBe(2);
    });

    it('getStats 包含各命名空间统计', () => {
      cacheManager.getCache('ns-1').set('k', 'v');

      const stats = cacheManager.getStats();
      expect(stats.namespaces).toHaveProperty('ns-1');
    });

    it('命中和未命中计算整体命中率', () => {
      const cache = cacheManager.getCache('ns-1');
      cache.set('k', 'v');
      cache.get('k'); // hit
      cache.get('missing'); // miss

      const stats = cacheManager.getStats();
      expect(stats.overallHitRate).toBe(0.5);
    });

    it('getCacheNames 返回所有命名空间名称', () => {
      cacheManager.getCache('ns-a');
      cacheManager.getCache('ns-b');

      const names = cacheManager.getCacheNames();
      expect(names).toContain('ns-a');
      expect(names).toContain('ns-b');
      expect(names).toHaveLength(2);
    });

    it('getCacheInfo 返回命名空间详细信息', () => {
      cacheManager.getCache('ns-info', { maxSize: 50, defaultTTL: 10000 });
      const info = cacheManager.getCacheInfo('ns-info');

      expect(info).not.toBeNull();
      expect(info!.name).toBe('ns-info');
      expect(info!.options.maxSize).toBe(50);
      expect(info!.options.defaultTTL).toBe(10000);
    });

    it('getCacheInfo 不存在的命名空间返回 null', () => {
      expect(cacheManager.getCacheInfo('nonexistent')).toBeNull();
    });
  });

  describe('过期清理', () => {
    it('pruneAllExpired 清理所有命名空间的过期条目', () => {
      const cache1 = cacheManager.getCache('ns-1');
      const cache2 = cacheManager.getCache('ns-2');

      cache1.set('a', 'value-a');
      cache2.set('b', 'value-b');

      // 模拟过期
      for (const entry of (cache1 as any).cache.values()) {
        entry.expiresAt = Date.now() - 1;
      }
      for (const entry of (cache2 as any).cache.values()) {
        entry.expiresAt = Date.now() - 1;
      }

      const removed = cacheManager.pruneAllExpired();
      expect(removed).toBe(2);
      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(0);
    });
  });

  describe('resetAllStats', () => {
    it('重置所有命名空间的统计', () => {
      const cache = cacheManager.getCache('ns-1');
      cache.set('k', 'v');
      cache.get('k');
      cache.get('missing');

      cacheManager.resetAllStats();
      const stats = cacheManager.getStats();
      expect(stats.namespaces['ns-1'].hitCount).toBe(0);
      expect(stats.namespaces['ns-1'].missCount).toBe(0);
    });
  });

  describe('预定义命名空间便捷方法', () => {
    it('getPluginCache 返回插件缓存', () => {
      const cache = getPluginCache();
      expect(cache).toBeDefined();
      cache.set('plugin-1', { name: 'test' });
      expect(cache.get('plugin-1')).toEqual({ name: 'test' });
    });

    it('getModelCache 返回模型缓存', () => {
      const cache = getModelCache();
      expect(cache).toBeDefined();
      cache.set('model-1', 'gpt-4');
      expect(cache.get('model-1')).toBe('gpt-4');
    });

    it('getMemoryCache 返回内存缓存', () => {
      const cache = getMemoryCache();
      expect(cache).toBeDefined();
      cache.set('mem-1', 'data');
      expect(cache.get('mem-1')).toBe('data');
    });

    it('getEmbeddingCache 返回嵌入缓存', () => {
      const cache = getEmbeddingCache();
      expect(cache).toBeDefined();
      cache.set('emb-1', [0.1, 0.2]);
      expect(cache.get('emb-1')).toEqual([0.1, 0.2]);
    });

    it('便捷方法使用预定义配置', () => {
      const pluginCache = getPluginCache();
      const modelCache = getModelCache();

      // 应该是同一实例（singleton）
      expect(pluginCache).toBe(getPluginCache());
      expect(modelCache).toBe(getModelCache());
    });
  });

  describe('CACHE_NAMESPACES 常量', () => {
    it('包含所有预定义命名空间', () => {
      expect(CACHE_NAMESPACES.PLUGINS).toBe('plugins');
      expect(CACHE_NAMESPACES.MODELS).toBe('models');
      expect(CACHE_NAMESPACES.MEMORY).toBe('memory');
      expect(CACHE_NAMESPACES.EMBEDDINGS).toBe('embeddings');
      expect(CACHE_NAMESPACES.MESSAGES).toBe('messages');
      expect(CACHE_NAMESPACES.CONFIG).toBe('config');
      expect(CACHE_NAMESPACES.METRICS).toBe('metrics');
      expect(CACHE_NAMESPACES.AUDIT).toBe('audit');
      expect(CACHE_NAMESPACES.API_RESPONSES).toBe('api-responses');
    });
  });
});
