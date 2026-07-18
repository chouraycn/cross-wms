import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { pluginRuntimeRegistry, createPluginRegistry } from '../registry.js';
import type { PluginInstance, PluginManifest } from '../types.js';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    ...overrides,
  };
}

function makeInstance(overrides: Partial<PluginInstance> = {}): PluginInstance {
  return {
    id: 'test-plugin',
    manifest: makeManifest(),
    loadedAt: Date.now(),
    status: 'installed',
    capabilities: [],
    ...overrides,
  };
}

describe('plugins/registry', () => {
  beforeEach(() => {
    pluginRuntimeRegistry.clear();
  });

  describe('register / unregister', () => {
    it('register 注册插件实例', () => {
      pluginRuntimeRegistry.register(makeInstance({ id: 'p1' }));
      expect(pluginRuntimeRegistry.size()).toBe(1);
      expect(pluginRuntimeRegistry.has('p1')).toBe(true);
    });

    it('registerManifest 仅注册 manifest', () => {
      pluginRuntimeRegistry.registerManifest(makeManifest({ id: 'p1' }), {
        capabilities: ['tool'],
      });
      const entry = pluginRuntimeRegistry.find('p1');
      expect(entry?.manifest.id).toBe('p1');
      expect(entry?.capabilities).toEqual(['tool']);
    });

    it('uninstall 移除插件', () => {
      pluginRuntimeRegistry.register(makeInstance({ id: 'p1' }));
      expect(pluginRuntimeRegistry.unregister('p1')).toBe(true);
      expect(pluginRuntimeRegistry.has('p1')).toBe(false);
    });

    it('unregister 不存在的插件返回 false', () => {
      expect(pluginRuntimeRegistry.unregister('nope')).toBe(false);
    });
  });

  describe('查询', () => {
    it('find 返回注册项', () => {
      pluginRuntimeRegistry.register(makeInstance({ id: 'p1' }));
      expect(pluginRuntimeRegistry.find('p1')?.pluginId).toBe('p1');
    });

    it('list 返回全部', () => {
      pluginRuntimeRegistry.register(makeInstance({ id: 'p1' }));
      pluginRuntimeRegistry.register(makeInstance({ id: 'p2' }));
      expect(pluginRuntimeRegistry.list().length).toBe(2);
    });

    it('listByStatus 按状态过滤', () => {
      pluginRuntimeRegistry.register(makeInstance({ id: 'p1', status: 'enabled' }));
      pluginRuntimeRegistry.register(makeInstance({ id: 'p2', status: 'disabled' }));
      expect(pluginRuntimeRegistry.listByStatus('enabled').length).toBe(1);
    });

    it('listByCapability 按能力过滤', () => {
      pluginRuntimeRegistry.register(makeInstance({ id: 'p1', capabilities: ['tool'] }));
      pluginRuntimeRegistry.register(makeInstance({ id: 'p2', capabilities: ['hook'] }));
      expect(pluginRuntimeRegistry.listByCapability('tool').length).toBe(1);
    });
  });

  describe('更新', () => {
    it('setStatus 更新状态', () => {
      pluginRuntimeRegistry.register(makeInstance({ id: 'p1', status: 'installed' }));
      expect(pluginRuntimeRegistry.setStatus('p1', 'enabled')).toBe(true);
      expect(pluginRuntimeRegistry.find('p1')?.status).toBe('enabled');
    });

    it('setCapabilities 更新能力', () => {
      pluginRuntimeRegistry.register(makeInstance({ id: 'p1', capabilities: [] }));
      pluginRuntimeRegistry.setCapabilities('p1', ['tool', 'hook']);
      expect(pluginRuntimeRegistry.find('p1')?.capabilities).toEqual(['tool', 'hook']);
    });

    it('setInstance 更新实例', () => {
      pluginRuntimeRegistry.register(makeInstance({ id: 'p1' }));
      const instance = { foo: 'bar' };
      pluginRuntimeRegistry.setInstance('p1', instance);
      expect(pluginRuntimeRegistry.find('p1')?.instance).toBe(instance);
    });

    it('setManifest 更新清单', () => {
      pluginRuntimeRegistry.register(makeInstance({ id: 'p1' }));
      const newManifest = makeManifest({ id: 'p1', version: '2.0.0' });
      pluginRuntimeRegistry.setManifest('p1', newManifest);
      expect(pluginRuntimeRegistry.find('p1')?.manifest.version).toBe('2.0.0');
    });
  });

  describe('snapshot', () => {
    it('返回独立副本', () => {
      pluginRuntimeRegistry.register(makeInstance({ id: 'p1', capabilities: ['tool'] }));
      const snap = pluginRuntimeRegistry.snapshot();
      snap[0].capabilities.push('hook');
      expect(pluginRuntimeRegistry.find('p1')?.capabilities).toEqual(['tool']);
    });
  });

  describe('createPluginRegistry', () => {
    it('返回独立实例', () => {
      const r1 = createPluginRegistry();
      const r2 = createPluginRegistry();
      r1.register(makeInstance({ id: 'p1' }));
      expect(r2.size()).toBe(0);
    });
  });
});
