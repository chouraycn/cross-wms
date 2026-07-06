/**
 * LRU Cache 单元测试
 *
 * 覆盖 LRUCache 类的核心功能：
 * - 基本 get/set/delete 操作
 * - TTL 过期自动清理
 * - LRU 淘汰策略（容量限制和内存限制）
 * - 批量操作（getMultiple, setMultiple, deleteMultiple）
 * - 模式匹配删除（invalidatePattern）
 * - 缓存统计（命中率、驱逐次数等）
 * - getOrSet 自动加载
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUCache } from '../lru-cache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>({
      maxSize: 5,
      defaultTTL: 1000,
      maxMemoryBytes: 1024 * 1024,
    });
  });

  describe('基本操作', () => {
    it('get 不存在的 key 返回 undefined', () => {
      expect(cache.get('missing')).toBeUndefined();
    });

    it('set 后 get 返回正确的值', () => {
      cache.set('a', 'value-a');
      expect(cache.get('a')).toBe('value-a');
    });

    it('has 对存在的 key 返回 true', () => {
      cache.set('a', 'value-a');
      expect(cache.has('a')).toBe(true);
    });

    it('has 对不存在的 key 返回 false', () => {
      expect(cache.has('missing')).toBe(false);
    });

    it('delete 存在的 key 返回 true', () => {
      cache.set('a', 'value-a');
      expect(cache.delete('a')).toBe(true);
      expect(cache.get('a')).toBeUndefined();
    });

    it('delete 不存在的 key 返回 false', () => {
      expect(cache.delete('missing')).toBe(false);
    });

    it('clear 清空所有条目', () => {
      cache.set('a', 'value-a');
      cache.set('b', 'value-b');
      cache.clear();
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.size()).toBe(0);
    });

    it('keys 返回所有未过期的 key', () => {
      cache.set('a', 'value-a');
      cache.set('b', 'value-b');
      const keys = cache.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toHaveLength(2);
    });

    it('values 返回所有未过期的值', () => {
      cache.set('a', 'value-a');
      cache.set('b', 'value-b');
      const values = cache.values();
      expect(values).toContain('value-a');
      expect(values).toContain('value-b');
      expect(values).toHaveLength(2);
    });

    it('entries 返回所有未过期的键值对', () => {
      cache.set('a', 'value-a');
      const entries = cache.entries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(['a', 'value-a']);
    });
  });

  describe('TTL 过期', () => {
    it('自定义 TTL 到期后 get 返回 undefined', () => {
      cache.set('a', 'value-a', 50);
      expect(cache.get('a')).toBe('value-a');

      // 手动修改过期时间模拟过期
      const entry = (cache as any).cache.get('a');
      if (entry) entry.expiresAt = Date.now() - 1;

      expect(cache.get('a')).toBeUndefined();
    });

    it('默认 TTL 到期后条目被清理', () => {
      cache.set('a', 'value-a');
      const entry = (cache as any).cache.get('a');
      if (entry) entry.expiresAt = Date.now() - 1;

      expect(cache.has('a')).toBe(false);
    });

    it('getWithMetadata 过期返回 undefined', () => {
      cache.set('a', 'value-a');
      const entry = (cache as any).cache.get('a');
      if (entry) entry.expiresAt = Date.now() - 1;

      expect(cache.getWithMetadata('a')).toBeUndefined();
    });

    it('pruneExpired 返回清理的数量', () => {
      cache.set('a', 'value-a');
      cache.set('b', 'value-b');

      // 模拟过期
      for (const entry of (cache as any).cache.values()) {
        entry.expiresAt = Date.now() - 1;
      }

      const removed = cache.pruneExpired();
      expect(removed).toBe(2);
      expect(cache.size()).toBe(0);
    });
  });

  describe('LRU 淘汰策略', () => {
    it('超出 maxSize 时淘汰最久未使用的条目', () => {
      cache.set('a', 'value-a');
      cache.set('b', 'value-b');
      cache.set('c', 'value-c');
      cache.set('d', 'value-d');
      cache.set('e', 'value-e');

      // 访问 a 使其变为最近使用
      cache.get('a');

      // 添加第 6 个，应该淘汰 b
      cache.set('f', 'value-f');

      expect(cache.get('a')).toBe('value-a'); // a 被访问过，保留
      expect(cache.get('b')).toBeUndefined(); // b 最久未使用，被淘汰
      expect(cache.get('f')).toBe('value-f');
      expect(cache.size()).toBe(5);
    });

    it('重复 set 同个 key 更新值且不增加计数', () => {
      cache.set('a', 'value-a');
      cache.set('a', 'value-a2');
      expect(cache.get('a')).toBe('value-a2');
      expect(cache.size()).toBe(1);
    });

    it('超出内存限制时淘汰条目', () => {
      const smallCache = new LRUCache<string>({
        maxSize: 100,
        defaultTTL: 60000,
        maxMemoryBytes: 10, // 很小的内存限制
      });

      smallCache.set('a', 'this is a long string');
      // 应该因为内存限制被淘汰
      expect(smallCache.get('a')).toBeUndefined();
    });
  });

  describe('批量操作', () => {
    it('getMultiple 返回存在的值', () => {
      cache.set('a', 'value-a');
      cache.set('b', 'value-b');

      const result = cache.getMultiple(['a', 'b', 'c']);
      expect(result).toEqual({
        a: 'value-a',
        b: 'value-b',
      });
    });

    it('setMultiple 批量设置', () => {
      cache.setMultiple([
        { key: 'a', value: 'value-a' },
        { key: 'b', value: 'value-b' },
      ]);
      expect(cache.get('a')).toBe('value-a');
      expect(cache.get('b')).toBe('value-b');
    });

    it('deleteMultiple 批量删除', () => {
      cache.set('a', 'value-a');
      cache.set('b', 'value-b');
      cache.set('c', 'value-c');

      const deleted = cache.deleteMultiple(['a', 'b', 'missing']);
      expect(deleted).toBe(2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe('value-c');
    });
  });

  describe('模式匹配删除', () => {
    it('invalidatePattern 按正则删除匹配的 key', () => {
      cache.set('user:1', 'data1');
      cache.set('user:2', 'data2');
      cache.set('product:1', 'data3');

      const removed = cache.invalidatePattern('^user:');
      expect(removed).toBe(2);
      expect(cache.get('user:1')).toBeUndefined();
      expect(cache.get('user:2')).toBeUndefined();
      expect(cache.get('product:1')).toBe('data3');
    });
  });

  describe('getOrSet 自动加载', () => {
    it('缓存命中时直接返回值', async () => {
      cache.set('a', 'cached');
      const fetcher = vi.fn().mockResolvedValue('fetched');

      const result = await cache.getOrSet('a', fetcher);
      expect(result).toBe('cached');
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('缓存未命中时调用 fetcher 并缓存结果', async () => {
      const fetcher = vi.fn().mockResolvedValue('fetched');

      const result = await cache.getOrSet('a', fetcher);
      expect(result).toBe('fetched');
      expect(fetcher).toHaveBeenCalledOnce();
      expect(cache.get('a')).toBe('fetched');
    });
  });

  describe('统计信息', () => {
    it('初始统计为 0', () => {
      const stats = cache.getStats();
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
      expect(stats.evictionCount).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('命中和未命中正确统计', () => {
      cache.set('a', 'value-a');
      cache.get('a'); // hit
      cache.get('missing'); // miss
      cache.get('missing'); // miss

      const stats = cache.getStats();
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(2);
      expect(stats.hitRate).toBe(1 / 3);
    });

    it('淘汰后 evictionCount 增加', () => {
      cache.set('a', 'a');
      cache.set('b', 'b');
      cache.set('c', 'c');
      cache.set('d', 'd');
      cache.set('e', 'e');
      cache.set('f', 'f'); // 淘汰 a

      const stats = cache.getStats();
      expect(stats.evictionCount).toBeGreaterThanOrEqual(1);
    });

    it('resetStats 清空统计', () => {
      cache.set('a', 'value-a');
      cache.get('a');
      cache.get('missing');

      cache.resetStats();
      const stats = cache.getStats();
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
      expect(stats.evictionCount).toBe(0);
    });

    it('size() 返回正确数量', () => {
      expect(cache.size()).toBe(0);
      cache.set('a', 'value-a');
      expect(cache.size()).toBe(1);
      cache.set('b', 'value-b');
      expect(cache.size()).toBe(2);
    });
  });

  describe('不同类型值', () => {
    it('支持数字类型值', () => {
      const numCache = new LRUCache<number>();
      numCache.set('num', 42);
      expect(numCache.get('num')).toBe(42);
    });

    it('支持对象类型值', () => {
      const objCache = new LRUCache<{ name: string }>();
      objCache.set('obj', { name: 'test' });
      expect(objCache.get('obj')).toEqual({ name: 'test' });
    });

    it('支持数组类型值', () => {
      const arrCache = new LRUCache<string[]>();
      arrCache.set('arr', ['a', 'b', 'c']);
      expect(arrCache.get('arr')).toEqual(['a', 'b', 'c']);
    });
  });
});
