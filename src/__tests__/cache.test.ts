import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryCache, LRUCache, useCache, globalCache } from '../utils/cache';
import { renderHook, act, waitFor } from '@testing-library/react';

describe('MemoryCache', () => {
  it('应该设置和获取值', () => {
    const cache = new MemoryCache<string>();
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('应该检查键是否存在', () => {
    const cache = new MemoryCache<string>();
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('key2')).toBe(false);
  });

  it('应该删除键', () => {
    const cache = new MemoryCache<string>();
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.has('key1')).toBe(false);
    expect(cache.delete('key1')).toBe(false);
  });

  it('应该清空所有缓存', () => {
    const cache = new MemoryCache<string>();
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('应该支持 TTL 过期', async () => {
    const cache = new MemoryCache<string>(100);
    cache.set('key1', 'value1', 50);
    expect(cache.get('key1')).toBe('value1');

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(cache.get('key1')).toBeUndefined();
  });

  it('应该返回所有 keys', () => {
    const cache = new MemoryCache<string>();
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    const keys = cache.keys();
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
    expect(keys.length).toBe(2);
  });

  it('应该返回所有 values', () => {
    const cache = new MemoryCache<string>();
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    const values = cache.values();
    expect(values).toContain('value1');
    expect(values).toContain('value2');
    expect(values.length).toBe(2);
  });

  it('应该返回正确的 size', () => {
    const cache = new MemoryCache<string>();
    expect(cache.size).toBe(0);
    cache.set('key1', 'value1');
    expect(cache.size).toBe(1);
    cache.set('key2', 'value2');
    expect(cache.size).toBe(2);
  });
});

describe('LRUCache', () => {
  it('应该设置和获取值', () => {
    const cache = new LRUCache<string>(3);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('应该淘汰最久未使用的项', () => {
    const cache = new LRUCache<string>(2);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.get('key1');
    cache.set('key3', 'value3');

    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBeUndefined();
    expect(cache.get('key3')).toBe('value3');
  });

  it('应该检查键是否存在', () => {
    const cache = new LRUCache<string>(3);
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('key2')).toBe(false);
  });

  it('应该删除键', () => {
    const cache = new LRUCache<string>(3);
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.has('key1')).toBe(false);
  });

  it('应该清空所有缓存', () => {
    const cache = new LRUCache<string>(3);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('应该支持 TTL 过期', async () => {
    const cache = new LRUCache<string>(10, 100);
    cache.set('key1', 'value1', 50);
    expect(cache.get('key1')).toBe('value1');

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(cache.get('key1')).toBeUndefined();
  });

  it('应该按访问顺序返回 keys', () => {
    const cache = new LRUCache<string>(3);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.get('key1');

    const keys = cache.keys();
    expect(keys[0]).toBe('key1');
    expect(keys[1]).toBe('key3');
    expect(keys[2]).toBe('key2');
  });

  it('应该更新已存在的键的值', () => {
    const cache = new LRUCache<string>(3);
    cache.set('key1', 'value1');
    cache.set('key1', 'value2');
    expect(cache.get('key1')).toBe('value2');
    expect(cache.size).toBe(1);
  });
});

describe('useCache', () => {
  beforeEach(() => {
    globalCache.clear();
  });

  it('应该加载和缓存数据', async () => {
    const fetcher = vi.fn().mockResolvedValue('test data');
    const { result } = renderHook(() => useCache('test-key', fetcher));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBe('test data');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('应该使用缓存数据', async () => {
    const fetcher = vi.fn().mockResolvedValue('test data');

    const { result: result1 } = renderHook(() => useCache('test-key', fetcher));
    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false);
    });

    const { result: result2 } = renderHook(() => useCache('test-key', fetcher));
    await waitFor(() => {
      expect(result2.current.data).toBe('test data');
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('应该支持 refetch', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce('data1')
      .mockResolvedValueOnce('data2');

    const { result } = renderHook(() => useCache('test-key', fetcher));

    await waitFor(() => {
      expect(result.current.data).toBe('data1');
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toBe('data2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('应该支持 clearCache', async () => {
    const fetcher = vi.fn().mockResolvedValue('test data');
    const { result } = renderHook(() => useCache('test-key', fetcher));

    await waitFor(() => {
      expect(result.current.data).toBe('test data');
    });

    act(() => {
      result.current.clearCache();
    });

    expect(result.current.data).toBeUndefined();
    expect(globalCache.has('test-key')).toBe(false);
  });

  it('应该处理错误', async () => {
    const error = new Error('Fetch failed');
    const fetcher = vi.fn().mockRejectedValue(error);
    const { result } = renderHook(() => useCache('error-key', fetcher));

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error).toBe(error);
    expect(result.current.isLoading).toBe(false);
  });
});
