import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn(() => false),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import {
  createPluginContext,
  createPluginLogger,
  createPluginStorage,
  createPluginEventBus,
  createPluginConfigAccessor,
  createNoopPluginContext,
} from '../context.js';
import type { PluginManifest } from '../types.js';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'p1',
    name: 'P1',
    version: '1.0.0',
    ...overrides,
  };
}

describe('plugin-sdk/context', () => {
  describe('createPluginLogger', () => {
    it('返回带 4 个方法的 logger', () => {
      const logger = createPluginLogger('p1');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('调用 logger 不抛错', () => {
      const logger = createPluginLogger('p1');
      expect(() => logger.info('hello')).not.toThrow();
    });
  });

  describe('createPluginStorage', () => {
    it('set / get / delete / keys 工作', async () => {
      const storage = createPluginStorage('p1');
      await storage.set('key1', { value: 42 });
      const value = await storage.get<{ value: number }>('key1');
      expect(value?.value).toBe(42);
      const keys = await storage.keys();
      expect(keys).toEqual(['key1']);
      await storage.delete('key1');
      expect(await storage.get('key1')).toBeUndefined();
    });

    it('按 pluginId 隔离', async () => {
      const s1 = createPluginStorage('p1');
      const s2 = createPluginStorage('p2');
      await s1.set('k', 'v1');
      await s2.set('k', 'v2');
      expect(await s1.get('k')).toBe('v1');
      expect(await s2.get('k')).toBe('v2');
    });
  });

  describe('createPluginEventBus', () => {
    it('emit / on 工作', () => {
      const bus = createPluginEventBus('p1');
      const received: unknown[] = [];
      bus.on('event1', (p) => received.push(p));
      bus.emit('event1', { x: 1 });
      expect(received).toEqual([{ x: 1 }]);
    });

    it('on 返回 unsubscribe 函数', () => {
      const bus = createPluginEventBus('p1');
      const received: unknown[] = [];
      const off = bus.on('event1', (p) => received.push(p));
      off();
      bus.emit('event1', 'ignored');
      expect(received).toEqual([]);
    });

    it('off 取消订阅', () => {
      const bus = createPluginEventBus('p1');
      const received: unknown[] = [];
      const handler = (p: unknown) => received.push(p);
      bus.on('event1', handler);
      bus.off('event1', handler);
      bus.emit('event1', 'ignored');
      expect(received).toEqual([]);
    });

    it('handler 抛错时不影响其他 handler', () => {
      const bus = createPluginEventBus('p1');
      const received: unknown[] = [];
      bus.on('event1', () => {
        throw new Error('boom');
      });
      bus.on('event1', (p) => received.push(p));
      bus.emit('event1', 'payload');
      expect(received).toEqual(['payload']);
    });
  });

  describe('createPluginConfigAccessor', () => {
    it('返回只读视图', () => {
      const config = { apiKey: 'abc', port: 8080 };
      const accessor = createPluginConfigAccessor(config);
      expect(accessor.get('apiKey')).toBe('abc');
      expect(accessor.getAll()).toEqual(config);
    });

    it('getAll 返回独立副本', () => {
      const config = { apiKey: 'abc' };
      const accessor = createPluginConfigAccessor(config);
      const all = accessor.getAll();
      all.apiKey = 'changed';
      expect(accessor.get('apiKey')).toBe('abc');
    });
  });

  describe('createPluginContext', () => {
    it('组合所有上下文组件', () => {
      const ctx = createPluginContext({
        pluginId: 'p1',
        manifest: makeManifest(),
        config: { apiKey: 'abc' },
      });
      expect(ctx.pluginId).toBe('p1');
      expect(ctx.manifest.id).toBe('p1');
      expect(ctx.config.get('apiKey')).toBe('abc');
    });

    it('默认 fetch 抛错（未配置时）', async () => {
      const ctx = createPluginContext({
        pluginId: 'p1',
        manifest: makeManifest(),
      });
      await expect(ctx.fetch('https://example.com')).rejects.toThrow(/fetch 未配置/);
    });

    it('自定义 hasPermission 生效', () => {
      const ctx = createPluginContext({
        pluginId: 'p1',
        manifest: makeManifest(),
        hasPermission: () => true,
      });
      expect(ctx.hasPermission('shell')).toBe(true);
    });
  });

  describe('createNoopPluginContext', () => {
    it('返回最小化 context', () => {
      const ctx = createNoopPluginContext('p1');
      expect(ctx.pluginId).toBe('p1');
      expect(ctx.hasPermission('network')).toBe(false);
    });

    it('storage 操作为 no-op', async () => {
      const ctx = createNoopPluginContext('p1');
      await expect(ctx.storage.get('k')).resolves.toBeUndefined();
      await expect(ctx.storage.set('k', 'v')).resolves.toBeUndefined();
      await expect(ctx.storage.keys()).resolves.toEqual([]);
    });
  });
});
