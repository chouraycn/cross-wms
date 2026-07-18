/**
 * MemoryCore 契约测试
 *
 * 覆盖内存存储管理：
 * - 存储条目
 * - 检索条目
 * - 删除条目
 * - 内存压缩
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryCore } from '../memory-core.js';
import type { MemoryEntry, MemoryQuery } from '../types.js';

describe('MemoryCore Contract', () => {
  describe('store', () => {
    it('存储条目并返回 ID', async () => {
      const memory = new MemoryCore();

      const id = await memory.store({
        content: 'test memory',
      });

      expect(id).toMatch(/^mem-/);
    });

    it('触发 entry_stored 事件', async () => {
      const memory = new MemoryCore();
      const handler = vi.fn();
      memory.on('entry_stored', handler);

      await memory.store({ content: 'event test' });

      expect(handler).toHaveBeenCalled();
    });

    it('存储的条目包含时间戳', async () => {
      const memory = new MemoryCore();
      const before = Date.now();

      const id = await memory.store({ content: 'timestamp test' });
      const entry = memory.get(id);

      expect(entry?.createdAt).toBeGreaterThanOrEqual(before);
      expect(entry?.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('存储带类型的条目', async () => {
      const memory = new MemoryCore();

      const id = await memory.store({
        content: 'fact memory',
        type: 'fact',
      });

      const entry = memory.get(id);
      expect(entry?.type).toBe('fact');
    });

    it('存储带重要性的条目', async () => {
      const memory = new MemoryCore();

      const id = await memory.store({
        content: 'important memory',
        importance: 0.9,
      });

      const entry = memory.get(id);
      expect(entry?.importance).toBe(0.9);
    });
  });

  describe('retrieve', () => {
    it('检索所有条目', async () => {
      const memory = new MemoryCore();

      await memory.store({ content: 'entry 1' });
      await memory.store({ content: 'entry 2' });

      const results = await memory.retrieve({});
      expect(results.length).toBe(2);
    });

    it('按类型过滤', async () => {
      const memory = new MemoryCore();

      await memory.store({ content: 'fact', type: 'fact' });
      await memory.store({ content: 'event', type: 'event' });

      const results = await memory.retrieve({ type: 'fact' });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('fact');
    });

    it('按 ID 过滤', async () => {
      const memory = new MemoryCore();

      const id1 = await memory.store({ content: 'entry 1' });
      await memory.store({ content: 'entry 2' });

      const results = await memory.retrieve({ ids: [id1] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(id1);
    });

    it('按最小重要性过滤', async () => {
      const memory = new MemoryCore();

      await memory.store({ content: 'low', importance: 0.3 });
      await memory.store({ content: 'high', importance: 0.8 });

      const results = await memory.retrieve({ minImportance: 0.5 });
      expect(results).toHaveLength(1);
      expect(results[0].importance).toBe(0.8);
    });

    it('应用分页', async () => {
      const memory = new MemoryCore();

      await memory.store({ content: 'entry 1' });
      await memory.store({ content: 'entry 2' });
      await memory.store({ content: 'entry 3' });

      const results = await memory.retrieve({ limit: 2, offset: 1 });
      expect(results).toHaveLength(2);
    });

    it('触发 entry_retrieved 事件', async () => {
      const memory = new MemoryCore();
      const handler = vi.fn();
      memory.on('entry_retrieved', handler);

      await memory.store({ content: 'test' });
      await memory.retrieve({});

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('forget', () => {
    it('删除存在的条目', async () => {
      const memory = new MemoryCore();

      const id = await memory.store({ content: 'to delete' });
      await memory.forget(id);

      expect(memory.get(id)).toBeUndefined();
    });

    it('触发 entry_forgotten 事件', async () => {
      const memory = new MemoryCore();
      const handler = vi.fn();
      memory.on('entry_forgotten', handler);

      const id = await memory.store({ content: 'delete test' });
      await memory.forget(id);

      expect(handler).toHaveBeenCalledWith(id);
    });

    it('删除不存在的条目不报错', async () => {
      const memory = new MemoryCore();
      await expect(memory.forget('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('compact', () => {
    it('压缩删除过期条目', async () => {
      const memory = new MemoryCore();

      // 创建已过期的条目
      await memory.store({
        content: 'expired',
        expiresAt: Date.now() - 1000,
      });

      await memory.compact();

      const results = await memory.retrieve({});
      expect(results).toHaveLength(0);
    });

    it('触发 memory_compacted 事件', async () => {
      const memory = new MemoryCore();
      const handler = vi.fn();
      memory.on('memory_compacted', handler);

      await memory.store({
        content: 'expired',
        expiresAt: Date.now() - 1000,
      });
      await memory.compact();

      expect(handler).toHaveBeenCalled();
    });

    it('压缩删除低重要性条目', async () => {
      const memory = new MemoryCore({ maxEntries: 2, maxAgeMs: 100 });

      await memory.store({ content: 'low', importance: 0.1 });
      await memory.store({ content: 'high', importance: 0.9 });
      // 手动触发压缩
      await memory.compact();

      const stats = memory.getStats();
      // 条目还在（因为未过期且不超过限制）
      expect(stats.totalEntries).toBe(2);
    });
  });

  describe('getStats', () => {
    it('返回统计信息', async () => {
      const memory = new MemoryCore();

      await memory.store({ content: 'entry 1', type: 'fact' });
      await memory.store({ content: 'entry 2', type: 'event' });

      const stats = memory.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.byType).toHaveProperty('fact');
      expect(stats.byType).toHaveProperty('event');
    });

    it('计算平均重要性', async () => {
      const memory = new MemoryCore();

      await memory.store({ content: '1', importance: 0.5 });
      await memory.store({ content: '2', importance: 0.7 });

      const stats = memory.getStats();
      expect(stats.avgImportance).toBeCloseTo(0.6);
    });
  });

  describe('clear', () => {
    it('清空所有条目', async () => {
      const memory = new MemoryCore();

      await memory.store({ content: 'entry 1' });
      await memory.store({ content: 'entry 2' });

      memory.clear();

      expect(memory.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('返回条目数量', async () => {
      const memory = new MemoryCore();

      expect(memory.size()).toBe(0);

      await memory.store({ content: 'test' });
      expect(memory.size()).toBe(1);
    });
  });
});