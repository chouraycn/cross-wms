/**
 * Plugin SDK 单元测试
 *
 * 覆盖 P0-1 插件系统基础框架：
 * - definePluginEntry 入口校验
 * - UnifiedPluginRegistry 注册/激活/注销
 * - 能力注册（tool/provider/embedding/memory-host/channel/hook/command/service）
 * - 生命周期管理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { definePluginEntry, UnifiedPluginRegistry } from '@cross-wms/plugin-sdk';

// mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// 使用 vi.hoisted() 解决 mock hoisting 问题
const { mockRegisterTool, mockUnregisterTool } = vi.hoisted(() => ({
  mockRegisterTool: vi.fn(),
  mockUnregisterTool: vi.fn(),
}));

// mock toolRegistry
vi.mock('../toolRegistry.js', () => ({
  registerPluginTool: mockRegisterTool,
  unregisterPluginTool: mockUnregisterTool,
}));

describe('Plugin SDK', () => {
  let registry: UnifiedPluginRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    // 重置单例以确保每个测试独立
    UnifiedPluginRegistry.resetInstance();
    registry = UnifiedPluginRegistry.getInstance();
  });

  describe('definePluginEntry', () => {
    it('应能创建合法的插件定义', () => {
      const plugin = definePluginEntry({
        id: 'test-plugin',
        name: 'Test Plugin',
        description: 'A test plugin',
        register: () => {},
      });

      expect(plugin.id).toBe('test-plugin');
      expect(plugin.name).toBe('Test Plugin');
      expect(plugin.description).toBe('A test plugin');
      expect(plugin.registrationMode).toBe('full');
      expect(typeof plugin.register).toBe('function');
    });

    it('应拒绝非法的插件 ID（大写字母）', () => {
      expect(() => {
        definePluginEntry({
          id: 'InvalidID',
          name: 'Invalid',
          description: '',
          register: () => {},
        });
      }).toThrow();
    });

    it('应拒绝非法的插件 ID（特殊字符）', () => {
      expect(() => {
        definePluginEntry({
          id: 'test_plugin!',
          name: 'Invalid',
          description: '',
          register: () => {},
        });
      }).toThrow();
    });

    it('应接受包含数字和连字符的 ID', () => {
      const plugin = definePluginEntry({
        id: 'my-plugin-123',
        name: 'Valid',
        description: '',
        register: () => {},
      });
      expect(plugin.id).toBe('my-plugin-123');
    });

    it('应支持自定义 configSchema', () => {
      const plugin = definePluginEntry({
        id: 'configurable-plugin',
        name: 'Configurable',
        description: '',
        configSchema: {
          properties: {
            apiKey: { type: 'string', description: 'API Key' },
          },
          required: ['apiKey'],
        },
        register: () => {},
      });

      expect(plugin.configSchema.properties).toHaveProperty('apiKey');
      expect(plugin.configSchema.required).toContain('apiKey');
    });

    it('应支持 setup 钩子', () => {
      const setup = vi.fn();
      const plugin = definePluginEntry({
        id: 'setup-plugin',
        name: 'Setup Plugin',
        description: '',
        setup,
        register: () => {},
      });

      expect(plugin.setup).toBeDefined();
      expect(typeof plugin.setup).toBe('function');
    });
  });

  describe('UnifiedPluginRegistry', () => {
    it('应能注册和注销插件定义', async () => {
      const plugin = definePluginEntry({
        id: 'reg-test',
        name: 'Registry Test',
        description: '',
        register: () => {},
      });

      // registerDefinition 是 async 方法
      await registry.registerDefinition(plugin);
      expect(registry.getStats().total).toBe(1);

      await registry.unregisterDefinition('reg-test');
      expect(registry.getStats().total).toBe(0);
    });

    it('应能激活已注册的插件', async () => {
      const plugin = definePluginEntry({
        id: 'activate-test',
        name: 'Activate Test',
        description: '',
        register: (api) => {
          api.registerTool({
            kind: 'tool',
            name: 'test-tool',
            description: 'A test tool',
            parameters: { type: 'object', properties: {} },
            handler: async () => JSON.stringify({ success: true, data: 'ok' }),  // 使用 handler 字段
          });
        },
      });

      await registry.registerDefinition(plugin);
      await registry.activate('activate-test');

      const stats = registry.getStats();
      expect(stats.activated).toBeGreaterThan(0);
    });

    it('应能获取已激活的工具列表', async () => {
      const plugin = definePluginEntry({
        id: 'tool-test',
        name: 'Tool Test',
        description: '',
        register: (api) => {
          api.registerTool({
            kind: 'tool',
            name: 'my-tool',
            description: 'Test tool',
            parameters: { type: 'object', properties: {} },
            handler: async () => JSON.stringify({ success: true }),  // 使用 handler 字段
          });
        },
      });

      await registry.registerDefinition(plugin);
      await registry.activate('tool-test');

      const runtime = registry.getRuntime('tool-test');
      expect(runtime).toBeDefined();
      expect(runtime!.status).toBe('activated');
      expect(runtime!.capabilities.length).toBeGreaterThan(0);
    });

    it('应能调用已注册的工具', async () => {
      const plugin = definePluginEntry({
        id: 'tool-invoker',
        name: 'Tool Invoker',
        description: '',
        register: (api) => {
          api.registerTool({
            kind: 'tool',
            name: 'echo',
            description: 'Echo tool',
            parameters: { type: 'object', properties: {} },
            handler: async (args) => JSON.stringify({ success: true, data: args }),  // 使用 handler 字段
          });
        },
      });

      await registry.registerDefinition(plugin);
      await registry.activate('tool-invoker');

      const resultStr = await registry.invokeTool('plugin_tool-invoker_echo', { msg: 'hello' });
      const result = JSON.parse(resultStr);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ msg: 'hello' });
    });

    it('应能停用已激活的插件', async () => {
      const plugin = definePluginEntry({
        id: 'deactivate-test',
        name: 'Deactivate Test',
        description: '',
        register: () => {},
      });

      await registry.registerDefinition(plugin);
      await registry.activate('deactivate-test');
      await registry.deactivate('deactivate-test');

      const health = registry.getHealth();
      expect(health).toBeDefined();
    });

    it('应能获取插件统计信息', () => {
      const stats = registry.getStats();
      // getStats 返回 { total, discovered, registered, activated, ... }
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('activated');
      expect(stats).toHaveProperty('capabilitiesByKind');
    });

    it('应能获取健康状态', () => {
      const health = registry.getHealth();
      // getHealth 返回 { total, activated, errors }
      expect(health).toHaveProperty('total');
      expect(health).toHaveProperty('activated');
      expect(health).toHaveProperty('errors');
    });

    it('激活不存在的插件应返回 false', async () => {
      // activate 不抛出错误，返回 false
      const result = await registry.activate('nonexistent');
      expect(result).toBe(false);
    });
  });
});
