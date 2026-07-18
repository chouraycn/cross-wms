/**
 * Media Analysis Cache 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildCacheKey, MediaAnalysisCache } from '../cache.js';

describe('MediaAnalysisCache', () => {
  let cache: MediaAnalysisCache<string>;

  beforeEach(() => {
    cache = new MediaAnalysisCache<string>({ maxEntries: 3, ttlMs: 1000 });
  });

  describe('buildCacheKey', () => {
    it('应基于 path 生成 key', () => {
      const key = buildCacheKey({ path: '/tmp/a.png' });
      expect(key).toContain('path:/tmp/a.png');
    });

    it('应基于 url 生成 key', () => {
      const key = buildCacheKey({ url: 'https://example.com/a.png' });
      expect(key).toContain('url:https://example.com/a.png');
    });

    it('相同 buffer 应生成相同 key', () => {
      const buf1 = Buffer.from('hello');
      const buf2 = Buffer.from('hello');
      expect(buildCacheKey({ buffer: buf1 })).toBe(buildCacheKey({ buffer: buf2 }));
    });

    it('不同 buffer 应生成不同 key', () => {
      const buf1 = Buffer.from('hello');
      const buf2 = Buffer.from('world');
      expect(buildCacheKey({ buffer: buf1 })).not.toBe(buildCacheKey({ buffer: buf2 }));
    });

    it('应包含 fileName 和 mime', () => {
      const key = buildCacheKey({ fileName: 'a.png', mime: 'image/png' });
      expect(key).toContain('name:a.png');
      expect(key).toContain('mime:image/png');
    });
  });

  describe('基本操作', () => {
    it('set/get 应正常存取', () => {
      cache.set('k1', 'v1');
      expect(cache.get('k1')).toBe('v1');
    });

    it('未命中的 key 返回 undefined', () => {
      expect(cache.get('missing')).toBeUndefined();
    });

    it('has 应正确判断存在性', () => {
      cache.set('k1', 'v1');
      expect(cache.has('k1')).toBe(true);
      expect(cache.has('k2')).toBe(false);
    });

    it('delete 应删除条目', () => {
      cache.set('k1', 'v1');
      expect(cache.delete('k1')).toBe(true);
      expect(cache.has('k1')).toBe(false);
      expect(cache.delete('k1')).toBe(false);
    });

    it('clear 应清空所有条目', () => {
      cache.set('k1', 'v1');
      cache.set('k2', 'v2');
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('size 应返回当前条目数', () => {
      cache.set('k1', 'v1');
      cache.set('k2', 'v2');
      expect(cache.size).toBe(2);
    });
  });

  describe('TTL 过期', () => {
    it('过期后 get 返回 undefined', () => {
      vi.useFakeTimers();
      cache.set('k1', 'v1', 100);
      vi.advanceTimersByTime(200);
      expect(cache.get('k1')).toBeUndefined();
      vi.useRealTimers();
    });

    it('过期后 has 返回 false', () => {
      vi.useFakeTimers();
      cache.set('k1', 'v1', 100);
      vi.advanceTimersByTime(200);
      expect(cache.has('k1')).toBe(false);
      vi.useRealTimers();
    });

    it('pruneExpired 应清理过期条目', () => {
      vi.useFakeTimers();
      cache.set('k1', 'v1', 100);
      cache.set('k2', 'v2', 5000);
      vi.advanceTimersByTime(200);
      const removed = cache.pruneExpired();
      expect(removed).toBe(1);
      expect(cache.has('k1')).toBe(false);
      expect(cache.has('k2')).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('LRU 淘汰', () => {
    it('超过容量时应淘汰最久未使用的', () => {
      cache.set('k1', 'v1');
      cache.set('k2', 'v2');
      cache.set('k3', 'v3');
      // 访问 k1，使其成为最近使用
      cache.get('k1');
      // 插入 k4，应淘汰 k2（最久未使用）
      cache.set('k4', 'v4');
      expect(cache.has('k1')).toBe(true);
      expect(cache.has('k2')).toBe(false);
      expect(cache.has('k3')).toBe(true);
      expect(cache.has('k4')).toBe(true);
    });
  });
});
