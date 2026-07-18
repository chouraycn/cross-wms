/**
 * SecretStore 单元测试（15 例）
 *
 * 覆盖：
 * 1. set + get 基本存取
 * 2. get 不存在的 key 返回 null
 * 3. set 覆盖后 version + 1
 * 4. has 存在/不存在
 * 5. delete 已存在/不存在
 * 6. list 无过滤返回全部
 * 7. list 按 tags 过滤（任一匹配）
 * 8. list 多个 tag 取并集
 * 9. rotate 更新 value 并自增 version，保留 createdAt
 * 10. rotate 不存在的 key 抛错
 * 11. getMetadata 返回元数据不返回明文
 * 12. expiresAt 字符串与 Date 都接受
 * 13. 加密：相同明文两次 set 密文不同（IV 随机）
 * 14. 多个 key 之间互不影响
 * 15. clear 清空
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecretStore } from '../secretStore.js';

describe('SecretStore', () => {
  let store: SecretStore;

  beforeEach(() => {
    store = new SecretStore();
  });

  // 1
  it('set + get 基本存取：明文可正确读取', () => {
    store.set('api_key', 'sk-test-12345');
    expect(store.get('api_key')).toBe('sk-test-12345');
  });

  // 2
  it('get 不存在的 key 返回 null', () => {
    expect(store.get('nope')).toBeNull();
  });

  // 3
  it('set 覆盖同一 key：version + 1，updatedAt 刷新', async () => {
    store.set('k', 'v1');
    const first = store.getMetadata('k')!;
    await new Promise(r => setTimeout(r, 5));
    store.set('k', 'v2');
    const second = store.getMetadata('k')!;
    expect(second.version).toBe(first.version + 1);
    expect(second.updatedAt >= first.updatedAt).toBe(true);
    expect(second.createdAt).toBe(first.createdAt);
    expect(store.get('k')).toBe('v2');
  });

  // 4
  it('has 正确反映存在性', () => {
    expect(store.has('k')).toBe(false);
    store.set('k', 'v');
    expect(store.has('k')).toBe(true);
  });

  // 5
  it('delete 已存在/不存在：成功删除或静默 noop', () => {
    store.set('k', 'v');
    expect(store.has('k')).toBe(true);
    store.delete('k');
    expect(store.has('k')).toBe(false);
    // 删除不存在的 key 不抛错
    expect(() => store.delete('nope')).not.toThrow();
  });

  // 6
  it('list 无过滤返回全部元数据', () => {
    store.set('a', '1', { tags: ['x'] });
    store.set('b', '2', { tags: ['y'] });
    const all = store.list();
    expect(all).toHaveLength(2);
    expect(all.map(e => e.key).sort()).toEqual(['a', 'b']);
  });

  // 7
  it('list 按 tag 过滤：任一匹配即命中', () => {
    store.set('a', '1', { tags: ['prod', 'db'] });
    store.set('b', '2', { tags: ['dev'] });
    store.set('c', '3', { tags: ['prod'] });
    const prod = store.list({ tags: ['prod'] });
    expect(prod.map(e => e.key).sort()).toEqual(['a', 'c']);
  });

  // 8
  it('list 多个 tag 取并集', () => {
    store.set('a', '1', { tags: ['prod'] });
    store.set('b', '2', { tags: ['staging'] });
    store.set('c', '3', { tags: ['dev'] });
    const result = store.list({ tags: ['prod', 'staging'] });
    expect(result.map(e => e.key).sort()).toEqual(['a', 'b']);
  });

  // 9
  it('rotate 更新 value 并自增 version，保留 createdAt 和原 tags', () => {
    store.set('k', 'v1', { tags: ['t1'] });
    const before = store.getMetadata('k')!;
    store.rotate('k', 'v2');
    const after = store.getMetadata('k')!;
    expect(store.get('k')).toBe('v2');
    expect(after.version).toBe(before.version + 1);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.tags).toEqual(['t1']);
  });

  // 10
  it('rotate 不存在的 key 抛错', () => {
    expect(() => store.rotate('missing', 'v')).toThrow(/凭证不存在/);
  });

  // 11
  it('getMetadata 返回元数据且不包含明文字段', () => {
    store.set('k', 'super-secret-value', { tags: ['t'] });
    const meta = store.getMetadata('k')!;
    expect(meta.key).toBe('k');
    expect(meta.tags).toEqual(['t']);
    expect(meta.version).toBe(1);
    // SecretEntry 类型本身不应有 value 字段
    expect((meta as unknown as Record<string, unknown>).value).toBeUndefined();
    expect((meta as unknown as Record<string, unknown>).ciphertext).toBeUndefined();
  });

  // 12
  it('expiresAt 同时支持 ISO 字符串与 Date 对象', () => {
    const isoDate = '2026-12-31T00:00:00.000Z';
    const dateObj = new Date('2027-06-30T00:00:00.000Z');

    store.set('a', '1', { expiresAt: isoDate });
    expect(store.getMetadata('a')!.expiresAt).toBe(isoDate);

    store.set('b', '2', { expiresAt: dateObj });
    expect(store.getMetadata('b')!.expiresAt).toBe('2027-06-30T00:00:00.000Z');
  });

  // 13
  it('加密：相同明文两次 set 密文不同（IV 随机）', () => {
    // 通过反射访问内部 Map 来确认 ciphertext 变化
    store.set('a', 'same-value');
    store.set('a', 'same-value');
    // 两次 set 后 ciphertext 应当不同（因为 IV 每次随机）
    // 由于 set 覆盖，我们再 set 一个不同 key 同明文，比较
    store.set('b', 'same-value');
    const internal = (store as unknown as { secrets: Map<string, { ciphertext: string }> }).secrets;
    expect(internal.get('a')!.ciphertext).not.toBe(internal.get('b')!.ciphertext);
  });

  // 14
  it('多个 key 之间互不影响', () => {
    store.set('a', 'alpha');
    store.set('b', 'beta');
    expect(store.get('a')).toBe('alpha');
    expect(store.get('b')).toBe('beta');
    store.delete('a');
    expect(store.get('a')).toBeNull();
    expect(store.get('b')).toBe('beta');
  });

  // 15
  it('clear 清空所有凭证', () => {
    store.set('a', '1');
    store.set('b', '2');
    expect(store.size()).toBe(2);
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.list()).toEqual([]);
  });
});
