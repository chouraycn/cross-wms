import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createPluginStateKeyedStore,
  createPluginStateSyncKeyedStore,
  createCorePluginStateSyncKeyedStore,
  clearPluginStateStoreForTests,
  resetPluginStateStoreForTests,
  PluginStateStoreError,
  MAX_PLUGIN_STATE_VALUE_BYTES,
} from '../_stub__plugin-state-store.js';

describe('plugins/_stub__plugin-state-store', () => {
  beforeEach(() => {
    clearPluginStateStoreForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('namespace 验证', () => {
    it('接受合法 namespace（小写字母 + 数字 + 分隔符）', () => {
      const store = createPluginStateKeyedStore('plugin-a', {
        namespace: 'cache.v1',
        maxEntries: 10,
      });
      expect(store).toBeDefined();
      expect(typeof store.register).toBe('function');
    });

    it('接受大写字母开头的 namespace', () => {
      const store = createPluginStateKeyedStore('plugin-a', {
        namespace: 'MyNamespace',
        maxEntries: 10,
      });
      expect(store).toBeDefined();
    });

    it('拒绝空 namespace', () => {
      expect(() =>
        createPluginStateKeyedStore('plugin-a', { namespace: '', maxEntries: 10 }),
      ).toThrow(PluginStateStoreError);
    });

    it('拒绝包含非法字符的 namespace（含空格、斜杠等）', () => {
      expect(() =>
        createPluginStateKeyedStore('plugin-a', { namespace: 'has space', maxEntries: 10 }),
      ).toThrow(PluginStateStoreError);
      expect(() =>
        createPluginStateKeyedStore('plugin-a', { namespace: 'has/slash', maxEntries: 10 }),
      ).toThrow(PluginStateStoreError);
      expect(() =>
        createPluginStateKeyedStore('plugin-a', { namespace: 'has@char', maxEntries: 10 }),
      ).toThrow(PluginStateStoreError);
    });

    it('拒绝超过最大字节数的 namespace', () => {
      const tooLong = 'a'.repeat(129);
      expect(() =>
        createPluginStateKeyedStore('plugin-a', { namespace: tooLong, maxEntries: 10 }),
      ).toThrow(PluginStateStoreError);
    });

    it('trim 后接受带前后空白的 namespace', () => {
      const store = createPluginStateKeyedStore('plugin-a', {
        namespace: '  cache  ',
        maxEntries: 10,
      });
      expect(store).toBeDefined();
    });
  });

  describe('maxEntries 验证', () => {
    it('拒绝 0', () => {
      expect(() =>
        createPluginStateKeyedStore('plugin-a', { namespace: 'ns', maxEntries: 0 }),
      ).toThrow(PluginStateStoreError);
    });

    it('拒绝负数', () => {
      expect(() =>
        createPluginStateKeyedStore('plugin-a', { namespace: 'ns', maxEntries: -5 }),
      ).toThrow(PluginStateStoreError);
    });

    it('拒绝非整数', () => {
      expect(() =>
        createPluginStateKeyedStore('plugin-a', { namespace: 'ns', maxEntries: 1.5 }),
      ).toThrow(PluginStateStoreError);
    });
  });

  describe('core: 前缀保护', () => {
    it('createPluginStateKeyedStore 拒绝 core: 前缀的 pluginId', () => {
      expect(() =>
        createPluginStateKeyedStore('core:internal', { namespace: 'ns', maxEntries: 10 }),
      ).toThrow(PluginStateStoreError);
    });

    it('createPluginStateSyncKeyedStore 拒绝 core: 前缀的 pluginId', () => {
      expect(() =>
        createPluginStateSyncKeyedStore('core:internal', { namespace: 'ns', maxEntries: 10 }),
      ).toThrow(PluginStateStoreError);
    });

    it('createCorePluginStateSyncKeyedStore 允许 core: 前缀 ownerId', () => {
      const store = createCorePluginStateSyncKeyedStore({
        namespace: 'ns',
        maxEntries: 10,
        ownerId: 'core:feature',
      });
      expect(store).toBeDefined();
      store.register('k', 'v');
      expect(store.lookup('k')).toBe('v');
    });
  });

  describe('register / lookup / delete', () => {
    it('register 后 lookup 返回值', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('foo', { count: 1 });
      const value = await store.lookup('foo');
      expect(value).toEqual({ count: 1 });
    });

    it('lookup 未注册的 key 返回 undefined', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      const value = await store.lookup('missing');
      expect(value).toBeUndefined();
    });

    it('delete 返回 true 删除已存在的 key', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('foo', 'v');
      expect(await store.delete('foo')).toBe(true);
      expect(await store.lookup('foo')).toBeUndefined();
    });

    it('delete 返回 false 删除不存在的 key', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      expect(await store.delete('missing')).toBe(false);
    });

    it('register 覆盖已存在的 key', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('foo', 'v1');
      await store.register('foo', 'v2');
      expect(await store.lookup('foo')).toBe('v2');
    });

    it('register 拒绝空 key', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await expect(store.register('', 'v')).rejects.toThrow(PluginStateStoreError);
    });

    it('register 拒绝非 JSON 可序列化的值（含函数）', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await expect(store.register('k', () => 1)).rejects.toThrow(PluginStateStoreError);
    });

    it('register 拒绝循环引用对象', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      await expect(store.register('k', obj)).rejects.toThrow(PluginStateStoreError);
    });
  });

  describe('consume', () => {
    it('consume 返回值并删除条目', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('once', 'v');
      expect(await store.consume('once')).toBe('v');
      expect(await store.lookup('once')).toBeUndefined();
    });

    it('consume 不存在的 key 返回 undefined', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      expect(await store.consume('missing')).toBeUndefined();
    });
  });

  describe('registerIfAbsent', () => {
    it('首次注册返回 true', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      expect(await store.registerIfAbsent('k', 'v')).toBe(true);
    });

    it('已存在时返回 false 且不覆盖', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('k', 'v1');
      expect(await store.registerIfAbsent('k', 'v2')).toBe(false);
      expect(await store.lookup('k')).toBe('v1');
    });
  });

  describe('update', () => {
    it('update 基于当前值计算新值', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('counter', 1);
      const ok = await store.update!('counter', (cur) => (cur ?? 0) + 1);
      expect(ok).toBe(true);
      expect(await store.lookup('counter')).toBe(2);
    });

    it('update 不存在的 key 时 current 为 undefined', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      const ok = await store.update!('new', (cur) => (cur ?? 0) + 5);
      expect(ok).toBe(true);
      expect(await store.lookup('new')).toBe(5);
    });

    it('update 返回 undefined 时返回 false 且不写入', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('k', 'v');
      const ok = await store.update!('k', () => undefined);
      expect(ok).toBe(false);
      expect(await store.lookup('k')).toBe('v');
    });
  });

  describe('TTL 行为', () => {
    it('ttlMs 到期后 lookup 返回 undefined', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('k', 'v', { ttlMs: 1000 });
      expect(await store.lookup('k')).toBe('v');
      vi.advanceTimersByTime(1001);
      expect(await store.lookup('k')).toBeUndefined();
    });

    it('consume 到期的 key 返回 undefined', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('k', 'v', { ttlMs: 500 });
      vi.advanceTimersByTime(501);
      expect(await store.consume('k')).toBeUndefined();
    });

    it('defaultTtlMs 作为兜底 TTL', async () => {
      const store = createPluginStateKeyedStore('p1', {
        namespace: 'ns',
        maxEntries: 10,
        defaultTtlMs: 2000,
      });
      await store.register('k', 'v');
      vi.advanceTimersByTime(1999);
      expect(await store.lookup('k')).toBe('v');
      vi.advanceTimersByTime(2);
      expect(await store.lookup('k')).toBeUndefined();
    });

    it('显式 ttlMs 覆盖 defaultTtlMs', async () => {
      const store = createPluginStateKeyedStore('p1', {
        namespace: 'ns',
        maxEntries: 10,
        defaultTtlMs: 2000,
      });
      await store.register('k', 'v', { ttlMs: 500 });
      vi.advanceTimersByTime(501);
      expect(await store.lookup('k')).toBeUndefined();
    });

    it('拒绝无效 ttlMs（0、负数、非整数）', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await expect(store.register('k', 'v', { ttlMs: 0 })).rejects.toThrow(PluginStateStoreError);
      await expect(store.register('k', 'v', { ttlMs: -1 })).rejects.toThrow(PluginStateStoreError);
      await expect(store.register('k', 'v', { ttlMs: 1.5 })).rejects.toThrow(PluginStateStoreError);
    });
  });

  describe('maxEntries 淘汰', () => {
    it('超过 maxEntries 时淘汰最旧条目', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 2 });
      await store.register('a', 1);
      vi.advanceTimersByTime(10);
      await store.register('b', 2);
      vi.advanceTimersByTime(10);
      await store.register('c', 3);
      expect(await store.lookup('a')).toBeUndefined();
      expect(await store.lookup('b')).toBe(2);
      expect(await store.lookup('c')).toBe(3);
    });

    it('淘汰时保护当前正在写入的 key', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 1 });
      await store.register('a', 1);
      vi.advanceTimersByTime(10);
      await store.register('b', 2);
      expect(await store.lookup('b')).toBe(2);
      expect(await store.lookup('a')).toBeUndefined();
    });
  });

  describe('entries / clear', () => {
    it('entries 返回所有未过期条目并按 createdAt 排序', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('b', 2);
      vi.advanceTimersByTime(10);
      await store.register('a', 1);
      const entries = await store.entries();
      expect(entries.map((e) => e.key)).toEqual(['b', 'a']);
      expect(entries[0]).toHaveProperty('createdAt');
    });

    it('entries 排除已过期条目', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('expired', 'v', { ttlMs: 100 });
      vi.advanceTimersByTime(10);
      await store.register('alive', 'v');
      vi.advanceTimersByTime(91);
      const entries = await store.entries();
      expect(entries.map((e) => e.key)).toEqual(['alive']);
    });

    it('entries 包含 expiresAt 字段（若有 TTL）', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('k', 'v', { ttlMs: 1000 });
      const entries = await store.entries();
      expect(entries[0]).toHaveProperty('expiresAt');
    });

    it('clear 清空所有条目', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('a', 1);
      await store.register('b', 2);
      await store.clear();
      expect(await store.entries()).toEqual([]);
    });
  });

  describe('同步 API (createPluginStateSyncKeyedStore)', () => {
    it('register/lookup 同步执行', () => {
      const store = createPluginStateSyncKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      store.register('k', 'v');
      expect(store.lookup('k')).toBe('v');
    });

    it('consume 同步删除并返回', () => {
      const store = createPluginStateSyncKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      store.register('k', 'v');
      expect(store.consume('k')).toBe('v');
      expect(store.lookup('k')).toBeUndefined();
    });

    it('registerIfAbsent 同步返回布尔值', () => {
      const store = createPluginStateSyncKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      expect(store.registerIfAbsent('k', 'v')).toBe(true);
      expect(store.registerIfAbsent('k', 'v2')).toBe(false);
    });
  });

  describe('命名空间隔离', () => {
    it('不同 pluginId + namespace 互不干扰', async () => {
      const storeA = createPluginStateKeyedStore('p1', { namespace: 'nsA', maxEntries: 10 });
      const storeB = createPluginStateKeyedStore('p2', { namespace: 'nsB', maxEntries: 10 });
      await storeA.register('k', 'fromA');
      await storeB.register('k', 'fromB');
      expect(await storeA.lookup('k')).toBe('fromA');
      expect(await storeB.lookup('k')).toBe('fromB');
    });

    it('同 pluginId 不同 namespace 互不干扰', async () => {
      const storeA = createPluginStateKeyedStore('p1', { namespace: 'nsA', maxEntries: 10 });
      const storeB = createPluginStateKeyedStore('p1', { namespace: 'nsB', maxEntries: 10 });
      await storeA.register('k', 'fromA');
      await storeB.register('k', 'fromB');
      expect(await storeA.lookup('k')).toBe('fromA');
      expect(await storeB.lookup('k')).toBe('fromB');
    });
  });

  describe('resetPluginStateStoreForTests', () => {
    it('清空所有 store 后 lookup 返回 undefined', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('k', 'v');
      resetPluginStateStoreForTests();
      expect(await store.lookup('k')).toBeUndefined();
    });
  });

  describe('值序列化限制', () => {
    it('接受大字符串值（stub 实现未强制 value 字节数限制）', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      const big = 'x'.repeat(1024);
      await store.register('k', big);
      expect(await store.lookup('k')).toBe(big);
      expect(MAX_PLUGIN_STATE_VALUE_BYTES).toBeGreaterThan(0);
    });

    it('拒绝稀疏数组', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      const sparse: unknown[] = [];
      sparse[2] = 'x';
      await expect(store.register('k', sparse)).rejects.toThrow(PluginStateStoreError);
    });

    it('拒绝带 symbol 键的对象', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      const sym = Symbol('s');
      const obj: Record<symbol, unknown> = {};
      obj[sym] = 'v';
      await expect(store.register('k', obj)).rejects.toThrow(PluginStateStoreError);
    });

    it('拒绝非普通对象原型（类实例）', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      class Foo {
        x = 1;
      }
      await expect(store.register('k', new Foo())).rejects.toThrow(PluginStateStoreError);
    });

    it('拒绝 Infinity 数值', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await expect(store.register('k', Infinity)).rejects.toThrow(PluginStateStoreError);
    });

    it('接受 null、布尔、有限数字、字符串', async () => {
      const store = createPluginStateKeyedStore('p1', { namespace: 'ns', maxEntries: 10 });
      await store.register('n', null);
      await store.register('b', true);
      await store.register('num', 42);
      await store.register('s', 'hello');
      expect(await store.lookup('n')).toBeNull();
      expect(await store.lookup('b')).toBe(true);
      expect(await store.lookup('num')).toBe(42);
      expect(await store.lookup('s')).toBe('hello');
    });
  });

  describe('单参数重载（_legacy）', () => {
    it('仅传 options 时使用 _legacy pluginId', async () => {
      const store = createPluginStateKeyedStore({ namespace: 'ns', maxEntries: 10 });
      await store.register('k', 'v');
      expect(await store.lookup('k')).toBe('v');
    });
  });
});
