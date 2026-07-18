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

import {
  createPluginApi,
  getPluginTools,
  listAllPluginTools,
  resetPluginApiForTests,
} from '../api.js';
import { pluginRuntimeRegistry } from '../registry.js';
import {
  resetPermissionStateForTests,
  grantPluginPermission,
  denyPluginPermission,
} from '../permissions.js';
import type { PluginManifest } from '../types.js';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'p1',
    name: 'P1',
    version: '1.0.0',
    ...overrides,
  };
}

describe('plugins/api', () => {
  beforeEach(() => {
    resetPluginApiForTests();
    resetPermissionStateForTests();
    pluginRuntimeRegistry.clear();
  });

  describe('createPluginApi', () => {
    it('返回带 pluginId 与 manifest 的 api', () => {
      const api = createPluginApi({
        pluginId: 'p1',
        manifest: makeManifest(),
      });
      expect(api.pluginId).toBe('p1');
      expect(api.manifest.id).toBe('p1');
    });

    it('getConfig 返回注入的配置', () => {
      const api = createPluginApi({
        pluginId: 'p1',
        manifest: makeManifest(),
        config: { apiKey: 'abc', port: 8080 },
      });
      expect(api.getConfig('apiKey')).toBe('abc');
      expect(api.getConfig('port')).toBe(8080);
      expect(api.getAllConfig()).toEqual({ apiKey: 'abc', port: 8080 });
    });

    it('registerTool 在有权限时成功', () => {
      grantPluginPermission('p1', 'tool.register');
      const api = createPluginApi({
        pluginId: 'p1',
        manifest: makeManifest(),
      });
      api.registerTool({
        name: 'echo',
        description: 'echo tool',
        parameters: { type: 'object', properties: {} },
        handler: async (args) => args,
      });
      const tools = getPluginTools('p1');
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('echo');
    });

    it('registerTool 在无权限时抛错', () => {
      const api = createPluginApi({
        pluginId: 'p1',
        manifest: makeManifest(),
      });
      expect(() =>
        api.registerTool({
          name: 'echo',
          description: 'echo',
          parameters: { type: 'object', properties: {} },
          handler: async () => null,
        }),
      ).toThrow(/tool.register/);
    });

    it('registerHook / unregisterHook 工作', () => {
      grantPluginPermission('p1', 'event.emit');
      const api = createPluginApi({
        pluginId: 'p1',
        manifest: makeManifest(),
      });
      const id = api.registerHook('onMessage', () => null);
      expect(typeof id).toBe('string');
      expect(api.unregisterHook(id)).toBe(true);
    });

    it('hasPermission 反映权限状态', () => {
      grantPluginPermission('p1', 'network');
      const api = createPluginApi({
        pluginId: 'p1',
        manifest: makeManifest(),
      });
      expect(api.hasPermission('network')).toBe(true);
      expect(api.hasPermission('shell')).toBe(false);
    });

    it('requestPermission 委托到 permissions 模块', async () => {
      grantPluginPermission('p1', 'memory.read');
      const api = createPluginApi({
        pluginId: 'p1',
        manifest: makeManifest(),
      });
      const granted = await api.requestPermission('memory.read');
      expect(granted).toBe(true);
    });

    it('emit / on 事件总线', () => {
      const api = createPluginApi({
        pluginId: 'p1',
        manifest: makeManifest(),
      });
      const received: unknown[] = [];
      api.on('test-event', (payload) => received.push(payload));
      api.emit('test-event', { hello: 'world' });
      expect(received.length).toBe(1);
      expect(received[0]).toEqual({ hello: 'world' });
    });
  });

  describe('listAllPluginTools', () => {
    it('汇总所有插件工具', () => {
      grantPluginPermission('p1', 'tool.register');
      grantPluginPermission('p2', 'tool.register');
      const api1 = createPluginApi({ pluginId: 'p1', manifest: makeManifest({ id: 'p1' }) });
      const api2 = createPluginApi({ pluginId: 'p2', manifest: makeManifest({ id: 'p2' }) });
      api1.registerTool({
        name: 'tool1',
        description: 'd',
        parameters: { type: 'object', properties: {} },
        handler: async () => null,
      });
      api2.registerTool({
        name: 'tool2',
        description: 'd',
        parameters: { type: 'object', properties: {} },
        handler: async () => null,
      });
      const all = listAllPluginTools();
      expect(all.length).toBe(2);
    });
  });

  describe('deny 权限场景', () => {
    it('deny 后 requestPermission 返回 false', async () => {
      denyPluginPermission('p1', 'shell');
      const api = createPluginApi({
        pluginId: 'p1',
        manifest: makeManifest(),
      });
      const granted = await api.requestPermission('shell');
      expect(granted).toBe(false);
    });
  });
});
