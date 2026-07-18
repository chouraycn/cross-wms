/**
 * SecretLifecycle 单元测试（8 例）
 *
 * 覆盖：
 * 1. isExpired: 无 expiresAt 永不过期
 * 2. isExpired: 过去时间视为过期
 * 3. isExpired: 未来时间视为未过期
 * 4. daysUntilExpiry: 无 expiresAt 返回 Infinity
 * 5. daysUntilExpiry: 已过期返回负数
 * 6. getExpiringSoon: 阈值内的未过期凭证
 * 7. cleanup: 删除已过期凭证
 * 8. audit: 综合统计
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecretStore } from '../secretStore.js';
import { SecretLifecycle } from '../secretLifecycle.js';

describe('SecretLifecycle', () => {
  let store: SecretStore;
  let lifecycle: SecretLifecycle;

  beforeEach(() => {
    store = new SecretStore();
    lifecycle = new SecretLifecycle(store);
  });

  // 1
  it('isExpired: 无 expiresAt 永不过期', () => {
    const entry = store.set('k', 'v');
    expect(lifecycle.isExpired(store.getMetadata('k')!)).toBe(false);
  });

  // 2
  it('isExpired: 过去时间视为过期', () => {
    store.set('k', 'v', { expiresAt: '2020-01-01T00:00:00.000Z' });
    expect(lifecycle.isExpired(store.getMetadata('k')!)).toBe(true);
  });

  // 3
  it('isExpired: 未来时间视为未过期', () => {
    const future = new Date(Date.now() + 86400 * 1000).toISOString();
    store.set('k', 'v', { expiresAt: future });
    expect(lifecycle.isExpired(store.getMetadata('k')!)).toBe(false);
  });

  // 4
  it('daysUntilExpiry: 无 expiresAt 返回 Infinity', () => {
    store.set('k', 'v');
    expect(lifecycle.daysUntilExpiry(store.getMetadata('k')!)).toBe(Infinity);
  });

  // 5
  it('daysUntilExpiry: 已过期返回负数', () => {
    // 设置为 5 天前过期
    const past = new Date(Date.now() - 5 * 86400 * 1000).toISOString();
    store.set('k', 'v', { expiresAt: past });
    const days = lifecycle.daysUntilExpiry(store.getMetadata('k')!);
    expect(days).toBeLessThan(0);
    expect(days).toBeGreaterThan(-6); // 大约 -5
  });

  // 6
  it('getExpiringSoon: 仅返回阈值内未过期凭证', () => {
    const in3Days = new Date(Date.now() + 3 * 86400 * 1000).toISOString();
    const in30Days = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    const past = new Date(Date.now() - 1 * 86400 * 1000).toISOString();

    store.set('soon', 'v', { expiresAt: in3Days });
    store.set('far', 'v', { expiresAt: in30Days });
    store.set('expired', 'v', { expiresAt: past });
    store.set('permanent', 'v');

    const result = lifecycle.getExpiringSoon(7);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('soon');
  });

  // 7
  it('cleanup: 删除已过期凭证，返回被删除的 key 列表', () => {
    const past = new Date(Date.now() - 86400 * 1000).toISOString();
    const future = new Date(Date.now() + 86400 * 1000).toISOString();
    store.set('expired1', 'v', { expiresAt: past });
    store.set('expired2', 'v', { expiresAt: past });
    store.set('alive', 'v', { expiresAt: future });
    store.set('permanent', 'v');

    const removed = lifecycle.cleanup();
    expect(removed.sort()).toEqual(['expired1', 'expired2']);
    expect(store.has('expired1')).toBe(false);
    expect(store.has('expired2')).toBe(false);
    expect(store.has('alive')).toBe(true);
    expect(store.has('permanent')).toBe(true);
  });

  // 8
  it('audit: 综合统计 active/expired/expiring/rotated', () => {
    // 2 个未过期 (1 个 5 天内过期, 1 个 30 天后过期)
    // 1 个已过期
    // 1 个永不过期
    // 1 个轮换过 (version > 1)
    const in5Days = new Date(Date.now() + 5 * 86400 * 1000).toISOString();
    const in30Days = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    const past = new Date(Date.now() - 1 * 86400 * 1000).toISOString();

    store.set('a', 'v', { expiresAt: in5Days, tags: ['db', 'prod'] });
    store.set('b', 'v', { expiresAt: in30Days, tags: ['db'] });
    store.set('c', 'v', { expiresAt: past, tags: ['legacy'] });
    store.set('d', 'v', { tags: ['db'] });
    store.set('e', 'v1', { tags: ['rotated'] });
    store.rotate('e', 'v2'); // version=2，视为轮换过

    const report = lifecycle.audit(7);

    expect(report.total).toBe(5);
    expect(report.expired).toBe(1);
    expect(report.active).toBe(4); // a, b, d, e 都未过期
    expect(report.expiring).toBe(1); // a 在 7 天内
    expect(report.rotated).toBe(1); // e
    expect(report.byTag['db']).toBe(3);
    expect(report.byTag['prod']).toBe(1);
    expect(report.byTag['legacy']).toBe(1);
    expect(report.byTag['rotated']).toBe(1);
    expect(report.expiringSoon).toHaveLength(1);
    expect(report.expiringSoon[0].key).toBe('a');
    expect(report.expiredEntries).toHaveLength(1);
    expect(report.expiredEntries[0].key).toBe('c');
  });
});
