/**
 * schemaCache 单元测试
 *
 * 覆盖：
 * - getSchemaHash：相同结构产生相同哈希，不同结构产生不同哈希
 * - isCacheValid / set / get：缓存读写与命中判断
 * - clear / size：缓存管理
 */

import { describe, it, expect } from 'vitest';
import { SchemaCache } from '../schemaCache.js';

describe('SchemaCache', () => {
  it('相同对象应产生相同哈希', () => {
    const cache = new SchemaCache();
    const h1 = cache.getSchemaHash({ type: 'string' });
    const h2 = cache.getSchemaHash({ type: 'string' });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  it('不同对象应产生不同哈希', () => {
    const cache = new SchemaCache();
    const h1 = cache.getSchemaHash({ type: 'string' });
    const h2 = cache.getSchemaHash({ type: 'number' });
    expect(h1).not.toBe(h2);
  });

  it('键序不同不应影响哈希', () => {
    const cache = new SchemaCache();
    const h1 = cache.getSchemaHash({ a: 1, b: 2 });
    const h2 = cache.getSchemaHash({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it('未写入缓存时应返回无效', () => {
    const cache = new SchemaCache();
    const hash = cache.getSchemaHash({ a: 1 });
    expect(cache.isCacheValid(hash)).toBe(false);
    expect(cache.get(hash)).toBeUndefined();
  });

  it('写入缓存后应可命中', () => {
    const cache = new SchemaCache();
    const hash = cache.getSchemaHash({ a: 1 });
    cache.set(hash, { cached: true });
    expect(cache.isCacheValid(hash)).toBe(true);
    expect(cache.get(hash)).toEqual({ cached: true });
  });

  it('应支持不同类型缓存值', () => {
    const cache = new SchemaCache();
    const hash1 = cache.getSchemaHash({ id: 1 });
    const hash2 = cache.getSchemaHash({ id: 2 });

    cache.set(hash1, 'string-value');
    cache.set(hash2, { nested: { a: 1 } });

    expect(cache.get<string>(hash1)).toBe('string-value');
    expect(cache.get(hash2)).toEqual({ nested: { a: 1 } });
  });

  it('clear 应清空缓存', () => {
    const cache = new SchemaCache();
    const hash = cache.getSchemaHash({ x: 1 });
    cache.set(hash, 'val');
    expect(cache.size()).toBe(1);

    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.isCacheValid(hash)).toBe(false);
    expect(cache.get(hash)).toBeUndefined();
  });

  it('size 应返回正确条目数', () => {
    const cache = new SchemaCache();
    expect(cache.size()).toBe(0);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size()).toBe(2);
  });
});
