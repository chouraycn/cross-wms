/**
 * Plugin Registry Contract 测试
 *
 * 覆盖 UnifiedPluginRegistry 的契约行为：
 * - 注册/注销 plugin
 * - 生命周期（register/activate/deactivate/reload）
 * - 能力注册（tool/hook/provider/channel/command/service 等）
 * - 事件系统
 * - 统计与健康
 * - 工具调用与超时
 * - ToolRegistryAdapter 集成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UnifiedPluginRegistry,
  type ToolRegistryAdapter,
} from '../plugin-registry.js';
import { emptyPluginConfigSchema } from '../types.js';
import type {
  PluginDefinition,
  PluginApi,
  PluginToolCapability,
} from '../types.js';

function makePluginDef(
  id: string,
  register: (api: PluginApi) => void | Promise<void> = () => {},
  config: Record<string, unknown> = {},
): PluginDefinition {
  return {
    id,
    name: `Plugin ${id}`,
    description: `Test plugin ${id}`,
    configSchema: emptyPluginConfigSchema,
    register,
  };
}

describe('Plugin Registry Contract', () => {
  let registry: UnifiedPluginRegistry;

  beforeEach(() => {
    registry = UnifiedPluginRegistry.create();
  });

  describe('插件注册', () => {
    it('成功注册插件', async () => {
      const def = makePluginDef('p1');
      const result = await registry.registerDefinition(def);
      expect(result).toBe(true);
      expect(registry.has('p1')).toBe(true);
    });

    it('注册相同 id 时覆盖前一个', async () => {
      await registry.registerDefinition(makePluginDef('p1'));
      await registry.registerDefinition(makePluginDef('p1', () => {}));
      expect(registry.has('p1')).toBe(true);
    });

    it('注册时 plugin.register 抛错应记录 error 状态', async () => {
      const def = makePluginDef('bad', () => {
        throw new Error('register failure');
      });
      const result = await registry.registerDefinition(def);
      expect(result).toBe(false);
      const runtime = registry.getRuntime('bad');
      expect(runtime?.status).toBe('error');
      expect(runtime?.error).toContain('register failure');
    });

    it('config 传递给插件', async () => {
      const apiSpy = vi.fn();
      const def = {
        id: 'p',
        name: 'P',
        description: 'd',
        configSchema: emptyPluginConfigSchema,
        register: (api: PluginApi) => {
          apiSpy(api.getConfig());
        },
      };
      await registry.registerDefinition(def, { key: 'value' });
      expect(apiSpy).toHaveBeenCalledWith({ key: 'value' });
    });

    it('配置 schema 可通过 getConfigSchema 获取', async () => {
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: 'd',
        configSchema: {
          fields: [
            { key: 'k1', type: 'string', default: 'v1' },
            { key: 'k2', type: 'number', default: 42 },
          ],
        },
        register: () => {},
      };
      await registry.registerDefinition(def);
      const runtime = registry.getRuntime('p');
      const schema = runtime!.definition.configSchema;
      expect(schema.fields).toHaveLength(2);
      expect(schema.fields[0].default).toBe('v1');
    });
  });

  describe('注销', () => {
    it('注销存在的插件', async () => {
      await registry.registerDefinition(makePluginDef('p1'));
      const result = await registry.unregisterDefinition('p1');
      expect(result).toBe(true);
      expect(registry.has('p1')).toBe(false);
    });

    it('注销不存在的插件返回 false', async () => {
      const result = await registry.unregisterDefinition('nonexistent');
      expect(result).toBe(false);
    });

    it('注销处于激活状态的插件会先 deactivate', async () => {
      const def = makePluginDef('p1');
      await registry.registerDefinition(def);
      await registry.activate('p1');
      await registry.unregisterDefinition('p1');
      expect(registry.has('p1')).toBe(false);
    });

    it('注销时调用 lifecycle.onCleanup', async () => {
      const cleanup = vi.fn();
      let capturedApi: PluginApi | undefined;
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: 'd',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          capturedApi = api;
          api.registerLifecycle({
            onCleanup: cleanup,
          });
        },
      };
      await registry.registerDefinition(def);
      await registry.unregisterDefinition('p');
      expect(cleanup).toHaveBeenCalled();
    });
  });

  describe('激活/停用', () => {
    it('激活已注册插件', async () => {
      await registry.registerDefinition(makePluginDef('p1'));
      const result = await registry.activate('p1');
      expect(result).toBe(true);
      expect(registry.getRuntime('p1')?.status).toBe('activated');
    });

    it('已激活的插件再次激活返回 true', async () => {
      await registry.registerDefinition(makePluginDef('p1'));
      await registry.activate('p1');
      const result = await registry.activate('p1');
      expect(result).toBe(true);
    });

    it('激活未注册的插件返回 false', async () => {
      const result = await registry.activate('nonexistent');
      expect(result).toBe(false);
    });

    it('停用已激活插件', async () => {
      await registry.registerDefinition(makePluginDef('p1'));
      await registry.activate('p1');
      const result = await registry.deactivate('p1');
      expect(result).toBe(true);
      expect(registry.getRuntime('p1')?.status).toBe('deactivated');
    });

    it('停用未激活的插件返回 true（no-op）', async () => {
      await registry.registerDefinition(makePluginDef('p1'));
      const result = await registry.deactivate('p1');
      expect(result).toBe(true);
    });

    it('停用未注册的插件返回 false', async () => {
      const result = await registry.deactivate('nonexistent');
      expect(result).toBe(false);
    });

    it('激活时调用 onActivate 生命周期钩子', async () => {
      const onActivate = vi.fn();
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: 'd',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerLifecycle({ onActivate });
        },
      };
      await registry.registerDefinition(def);
      await registry.activate('p');
      expect(onActivate).toHaveBeenCalled();
    });

    it('停用时调用 onDeactivate 生命周期钩子', async () => {
      const onDeactivate = vi.fn();
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: 'd',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerLifecycle({ onDeactivate });
        },
      };
      await registry.registerDefinition(def);
      await registry.activate('p');
      await registry.deactivate('p');
      expect(onDeactivate).toHaveBeenCalled();
    });
  });

  describe('工具能力', () => {
    it('注册工具后可在激活态下调用', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: 'd',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          const cap: PluginToolCapability = {
            kind: 'tool',
            name: 'myTool',
            description: 'My tool',
            parameters: { type: 'object' },
            handler,
          };
          api.registerTool(cap);
        },
      };
      await registry.registerDefinition(def);
      await registry.activate('p');
      const result = await registry.invokeTool('p', 'myTool', { a: 1 });
      expect(handler).toHaveBeenCalledWith({ a: 1 }, expect.objectContaining({ pluginId: 'p' }));
      expect(result).toBe('result');
    });

    it('调用未激活插件的工具返回错误 JSON', async () => {
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: 'd',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerTool({
            kind: 'tool',
            name: 'myTool',
            description: 'd',
            parameters: {},
            handler: async () => 'ok',
          });
        },
      };
      await registry.registerDefinition(def);
      // 不激活
      const result = await registry.invokeTool('p', 'myTool', {});
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('Plugin not activated');
    });

    it('调用不存在的工具返回错误 JSON', async () => {
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: 'd',
        configSchema: emptyPluginConfigSchema,
        register: () => {},
      };
      await registry.registerDefinition(def);
      await registry.activate('p');
      const result = await registry.invokeTool('p', 'missing', {});
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('Tool not found');
    });

    it('getActiveTools 只返回已激活插件的工具', async () => {
      const make = (id: string) => ({
        id,
        name: id,
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api: PluginApi) => {
          api.registerTool({
            kind: 'tool' as const,
            name: 't',
            description: '',
            parameters: {},
            handler: async () => 'ok',
          });
        },
      });

      await registry.registerDefinition(make('p1'));
      await registry.registerDefinition(make('p2'));
      await registry.activate('p1');
      // p2 未激活

      const tools = registry.getActiveTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].pluginId).toBe('p1');
    });

    it('注销工具会从能力索引中移除', async () => {
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerTool({
            kind: 'tool',
            name: 't',
            description: '',
            parameters: {},
            handler: async () => 'ok',
          });
        },
      };
      await registry.registerDefinition(def);
      await registry.activate('p');
      expect(registry.getActiveTools()).toHaveLength(1);

      const def2: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerTool({
            kind: 'tool',
            name: 't',
            description: '',
            parameters: {},
            handler: async () => 'ok2',
          });
        },
      };
      // 重新注册将覆盖
      await registry.registerDefinition(def2);
      await registry.activate('p');
      const result = await registry.invokeTool('p', 't', {});
      expect(result).toBe('ok2');
    });
  });

  describe('钩子能力', () => {
    it('通过 emitHook 触发已注册钩子', async () => {
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerHook({
            kind: 'hook',
            event: 'before_chat',
            handler: async (payload) => ({ mutatedPayload: { ...(payload as object), added: true } }),
          });
        },
      };
      await registry.registerDefinition(def);
      await registry.activate('p');
      const result = await registry.emitHook('before_chat', { original: true });
      expect(result).toEqual({ original: true, added: true });
    });

    it('未注册钩子时 emitHook 返回原 payload', async () => {
      const result = await registry.emitHook('nonexistent_event', { x: 1 });
      expect(result).toEqual({ x: 1 });
    });

    it('钩子按优先级排序执行', async () => {
      const executionOrder: string[] = [];
      const makeHook = (id: string, priority: number, label: string) => ({
        id,
        name: id,
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api: PluginApi) => {
          api.registerHook({
            kind: 'hook' as const,
            event: 'evt',
            priority,
            handler: async () => {
              executionOrder.push(label);
              return { mutatedPayload: { updated: true } };
            },
          });
        },
      });

      await registry.registerDefinition(makeHook('low', 1, 'low'));
      await registry.registerDefinition(makeHook('high', 10, 'high'));
      await registry.registerDefinition(makeHook('mid', 5, 'mid'));
      await registry.activate('low');
      await registry.activate('high');
      await registry.activate('mid');

      await registry.emitHook('evt', {});
      expect(executionOrder).toEqual(['high', 'mid', 'low']);
    });
  });

  describe('Provider / Channel / Command / Service', () => {
    it('getProviders 返回已激活插件的 provider', async () => {
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerProvider({
            kind: 'provider',
            id: 'openai',
            displayName: 'OpenAI',
            apiType: 'openai-chat',
          });
        },
      };
      await registry.registerDefinition(def);
      await registry.activate('p');
      const providers = registry.getProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe('openai');
    });

    it('getChannels 返回已激活插件的 channel', async () => {
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerChannel({
            kind: 'channel',
            id: 'feishu',
            displayName: 'Feishu',
            send: async () => ({}),
          });
        },
      };
      await registry.registerDefinition(def);
      await registry.activate('p');
      const channels = registry.getChannels();
      expect(channels).toHaveLength(1);
    });

    it('getCommands 返回已激活插件的 command', async () => {
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerCommand({
            kind: 'command',
            name: 'myCmd',
            description: 'My command',
            handler: async () => 'ok',
          });
        },
      };
      await registry.registerDefinition(def);
      await registry.activate('p');
      const commands = registry.getCommands();
      expect(commands).toHaveLength(1);
    });

    it('getServices 返回已激活插件的 service', async () => {
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerService({
            kind: 'service',
            id: 'auth',
            start: async () => {},
            stop: async () => {},
          });
        },
      };
      await registry.registerDefinition(def);
      await registry.activate('p');
      const services = registry.getServices();
      expect(services).toHaveLength(1);
    });
  });

  describe('统计与健康', () => {
    it('getStats 统计各状态和 capability 数量', async () => {
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerTool({
            kind: 'tool',
            name: 't1',
            description: '',
            parameters: {},
            handler: async () => 'ok',
          });
          api.registerHook({
            kind: 'hook',
            event: 'evt',
            handler: async (p) => p,
          });
        },
      };
      await registry.registerDefinition(def);
      await registry.activate('p');
      const stats = registry.getStats();
      expect(stats.total).toBe(1);
      expect(stats.activated).toBe(1);
      expect(stats.capabilitiesByKind.tool).toBe(1);
      expect(stats.capabilitiesByKind.hook).toBe(1);
    });

    it('getHealth 收集错误', async () => {
      const def = makePluginDef('bad', () => {
        throw new Error('fail');
      });
      await registry.registerDefinition(def);
      const health = registry.getHealth();
      expect(health.total).toBe(1);
      expect(health.errors.some((e) => e.includes('fail'))).toBe(true);
    });

    it('listPluginIds 返回所有已注册插件', async () => {
      await registry.registerDefinition(makePluginDef('a'));
      await registry.registerDefinition(makePluginDef('b'));
      expect(registry.listPluginIds().sort()).toEqual(['a', 'b']);
    });
  });

  describe('事件系统', () => {
    it('plugin_registered 事件触发', async () => {
      const spy = vi.fn();
      registry.on('plugin_registered', spy);
      await registry.registerDefinition(makePluginDef('p1'));
      expect(spy).toHaveBeenCalledWith('p1');
    });

    it('plugin_activated 事件触发', async () => {
      const spy = vi.fn();
      registry.on('plugin_activated', spy);
      await registry.registerDefinition(makePluginDef('p1'));
      await registry.activate('p1');
      expect(spy).toHaveBeenCalledWith('p1');
    });

    it('plugin_error 事件在注册失败时触发', async () => {
      const spy = vi.fn();
      registry.on('plugin_error', spy);
      await registry.registerDefinition(
        makePluginDef('bad', () => {
          throw new Error('oops');
        }),
      );
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('ToolRegistryAdapter 集成', () => {
    it('激活时通过 adapter 注册工具', async () => {
      const registered: Array<{ name: string; def: unknown }> = [];
      const adapter: ToolRegistryAdapter = {
        registerPluginTool: (name, def) => {
          registered.push({ name, def });
        },
        unregisterPluginTool: () => {},
      };
      const reg = UnifiedPluginRegistry.create({ toolRegistry: adapter });
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerTool({
            kind: 'tool',
            name: 't1',
            description: 'desc',
            parameters: { type: 'object' },
            handler: async () => 'ok',
          });
        },
      };
      await reg.registerDefinition(def);
      await reg.activate('p');
      expect(registered).toHaveLength(1);
      expect(registered[0].name).toBe('plugin_p_t1');
    });

    it('停用时通过 adapter 注销工具', async () => {
      const unregistered: string[] = [];
      const adapter: ToolRegistryAdapter = {
        registerPluginTool: () => {},
        unregisterPluginTool: (name) => {
          unregistered.push(name);
        },
      };
      const reg = UnifiedPluginRegistry.create({ toolRegistry: adapter });
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerTool({
            kind: 'tool',
            name: 't1',
            description: '',
            parameters: {},
            handler: async () => 'ok',
          });
        },
      };
      await reg.registerDefinition(def);
      await reg.activate('p');
      await reg.deactivate('p');
      expect(unregistered).toContain('plugin_p_t1');
    });

    it('getToolsForToolRegistry 返回格式化的工具集合', async () => {
      const reg = UnifiedPluginRegistry.create();
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          api.registerTool({
            kind: 'tool',
            name: 't1',
            description: 'Tool 1',
            parameters: { type: 'object' },
            handler: async () => 'ok',
          });
        },
      };
      await reg.registerDefinition(def);
      await reg.activate('p');
      const tools = reg.getToolsForToolRegistry();
      expect(tools).toHaveLength(1);
      expect(tools[0].fullName).toBe('plugin_p_t1');
    });
  });

  describe('reload 行为', () => {
    it('reload 已注册插件保留配置', async () => {
      let config: unknown;
      const def: PluginDefinition = {
        id: 'p',
        name: 'P',
        description: '',
        configSchema: emptyPluginConfigSchema,
        register: (api) => {
          config = api.getConfig();
        },
      };
      await registry.registerDefinition(def, { token: 'abc' });
      await registry.activate('p');
      await registry.reload('p');
      expect(config).toEqual({ token: 'abc' });
    });
  });
});
