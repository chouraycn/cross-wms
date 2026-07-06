/**
 * Plugin Tools & Contracts Contract 测试
 *
 * 覆盖 ToolRegistry 类的契约行为：
 * - 工具注册/注销（重复检测、plugin 归属）
 * - 工具调用（成功、错误传播、上下文）
 * - 按 plugin 过滤
 * - 事件触发
 * - 工具描述生成
 *
 * 覆盖 ContractRegistry 类的契约行为：
 * - 注册/注销/重复检测
 * - 实现注册/调用
 * - 异步/同步方法支持
 * - 事件触发
 * - 清理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ToolRegistry,
  toolRegistry,
  defineTool,
  registerTool,
  unregisterTool,
} from '../tools.js';
import { ContractRegistry, contractRegistry, defineContract, implementsContract } from '../contracts.js';
import type { ToolDefinition } from '../types.js';

const sampleTool: ToolDefinition = {
  name: 'myTool',
  description: 'My test tool',
  parameters: { type: 'object' },
  handler: async () => 'ok',
};

describe('Plugin Tools Contract', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('registerTool', () => {
    it('注册工具', () => {
      registry.registerTool(sampleTool, 'pluginA');
      expect(registry.hasTool('myTool')).toBe(true);
      expect(registry.getToolOwner('myTool')).toBe('pluginA');
    });

    it('默认 pluginId 为 system', () => {
      registry.registerTool(sampleTool);
      expect(registry.getToolOwner('myTool')).toBe('system');
    });

    it('重复注册同名工具抛错', () => {
      registry.registerTool(sampleTool);
      expect(() => registry.registerTool(sampleTool)).toThrow(/already registered/);
    });

    it('注册触发 tool_registered 事件', () => {
      const spy = vi.fn();
      registry.on('tool_registered', spy);
      registry.registerTool(sampleTool);
      expect(spy).toHaveBeenCalledWith(sampleTool);
    });
  });

  describe('unregisterTool', () => {
    it('注销存在的工具返回 true', () => {
      registry.registerTool(sampleTool);
      expect(registry.unregisterTool('myTool')).toBe(true);
      expect(registry.hasTool('myTool')).toBe(false);
    });

    it('注销不存在的工具返回 false', () => {
      expect(registry.unregisterTool('missing')).toBe(false);
    });

    it('注销触发 tool_unregistered 事件', () => {
      const spy = vi.fn();
      registry.registerTool(sampleTool);
      registry.on('tool_unregistered', spy);
      registry.unregisterTool('myTool');
      expect(spy).toHaveBeenCalledWith('myTool');
    });
  });

  describe('unregisterPluginTools', () => {
    it('按 pluginId 批量注销工具', () => {
      registry.registerTool({ ...sampleTool, name: 't1' }, 'pluginA');
      registry.registerTool({ ...sampleTool, name: 't2' }, 'pluginA');
      registry.registerTool({ ...sampleTool, name: 't3' }, 'pluginB');

      const count = registry.unregisterPluginTools('pluginA');
      expect(count).toBe(2);
      expect(registry.hasTool('t1')).toBe(false);
      expect(registry.hasTool('t2')).toBe(false);
      expect(registry.hasTool('t3')).toBe(true);
    });

    it('pluginId 无工具时返回 0', () => {
      expect(registry.unregisterPluginTools('nonexistent')).toBe(0);
    });
  });

  describe('callTool', () => {
    it('调用同步方法', async () => {
      const syncTool: ToolDefinition = {
        ...sampleTool,
        handler: () => 'sync-result',
      };
      registry.registerTool(syncTool);
      const result = await registry.callTool('myTool', {}, { sessionId: 's1' });
      expect(result).toBe('sync-result');
    });

    it('调用异步方法', async () => {
      const asyncTool: ToolDefinition = {
        ...sampleTool,
        handler: async () => 'async-result',
      };
      registry.registerTool(asyncTool);
      const result = await registry.callTool('myTool', {}, { sessionId: 's1' });
      expect(result).toBe('async-result');
    });

    it('调用不存在的工具抛错', async () => {
      await expect(registry.callTool('missing', {}, { sessionId: 's1' })).rejects.toThrow(/not found/);
    });

    it('handler 抛错时重新抛出并触发 tool_error', async () => {
      const errorTool: ToolDefinition = {
        ...sampleTool,
        handler: async () => { throw new Error('boom'); },
      };
      registry.registerTool(errorTool);
      const errorSpy = vi.fn();
      registry.on('tool_error', errorSpy);
      await expect(registry.callTool('myTool', {}, { sessionId: 's1' })).rejects.toThrow('boom');
      expect(errorSpy).toHaveBeenCalledWith('myTool', expect.any(Error));
    });

    it('调用时 context 包含 pluginId', async () => {
      let captured: unknown;
      const captureTool: ToolDefinition = {
        ...sampleTool,
        handler: async (_params, ctx) => {
          captured = ctx;
          return 'ok';
        },
      };
      registry.registerTool(captureTool, 'myPlugin');
      await registry.callTool('myTool', { x: 1 }, { sessionId: 's1' });
      expect(captured).toEqual({ sessionId: 's1', pluginId: 'myPlugin' });
    });

    it('调用触发 tool_called 事件', async () => {
      const spy = vi.fn();
      registry.registerTool(sampleTool);
      registry.on('tool_called', spy);
      await registry.callTool('myTool', { x: 1 }, { sessionId: 's1' });
      expect(spy).toHaveBeenCalledWith('myTool', { x: 1 }, expect.objectContaining({ pluginId: 'system' }));
    });
  });

  describe('listTools / listToolsByPlugin', () => {
    it('listTools 返回所有已注册工具', () => {
      registry.registerTool({ ...sampleTool, name: 't1' });
      registry.registerTool({ ...sampleTool, name: 't2' });
      expect(registry.listTools()).toHaveLength(2);
    });

    it('listToolsByPlugin 按 pluginId 过滤', () => {
      registry.registerTool({ ...sampleTool, name: 't1' }, 'pA');
      registry.registerTool({ ...sampleTool, name: 't2' }, 'pA');
      registry.registerTool({ ...sampleTool, name: 't3' }, 'pB');
      expect(registry.listToolsByPlugin('pA')).toHaveLength(2);
      expect(registry.listToolsByPlugin('pB')).toHaveLength(1);
    });
  });

  describe('getToolDescriptions', () => {
    it('返回精简的工具描述', () => {
      registry.registerTool(sampleTool);
      const descs = registry.getToolDescriptions();
      expect(descs).toHaveLength(1);
      expect(descs[0].name).toBe('myTool');
      expect(descs[0].description).toBe('My test tool');
      expect(descs[0].parameters).toEqual({ type: 'object' });
    });
  });

  describe('clear / size', () => {
    it('clear 清空所有工具和所有者记录', () => {
      registry.registerTool(sampleTool, 'pA');
      registry.clear();
      expect(registry.size()).toBe(0);
      expect(registry.hasTool('myTool')).toBe(false);
    });

    it('size 返回工具数量', () => {
      expect(registry.size()).toBe(0);
      registry.registerTool(sampleTool);
      expect(registry.size()).toBe(1);
    });
  });

  describe('defineTool / registerTool / unregisterTool (函数 API)', () => {
    it('defineTool 透传 definition', () => {
      const t = defineTool(sampleTool);
      expect(t).toEqual(sampleTool);
    });

    it('registerTool/unregisterTool 操作全局 registry', () => {
      // 清理
      if (toolRegistry.hasTool('funcTool')) {
        toolRegistry.unregisterTool('funcTool');
      }
      registerTool({ ...sampleTool, name: 'funcTool' }, 'testPlugin');
      expect(toolRegistry.hasTool('funcTool')).toBe(true);
      expect(unregisterTool('funcTool')).toBe(true);
      expect(toolRegistry.hasTool('funcTool')).toBe(false);
    });
  });
});

describe('Plugin Contracts Contract', () => {
  let registry: ContractRegistry;

  beforeEach(() => {
    registry = new ContractRegistry();
  });

  const sampleContract: ReturnType<typeof defineContract> = {
    id: 'test.contract',
    version: '1.0.0',
    description: 'Sample contract',
    methods: [
      { name: 'ping', description: 'Ping', signature: 'ping(): string' },
      { name: 'echo', description: 'Echo', signature: 'echo(x: any): any' },
    ],
  };

  describe('registerContract', () => {
    it('注册 contract 触发事件', () => {
      const spy = vi.fn();
      registry.on('contract_registered', spy);
      registry.registerContract(sampleContract);
      expect(spy).toHaveBeenCalledWith(sampleContract);
    });

    it('重复注册抛错', () => {
      registry.registerContract(sampleContract);
      expect(() => registry.registerContract(sampleContract)).toThrow(/already registered/);
    });
  });

  describe('unregisterContract', () => {
    it('注销存在的 contract 返回 true', () => {
      registry.registerContract(sampleContract);
      expect(registry.unregisterContract('test.contract')).toBe(true);
      expect(registry.hasContract('test.contract')).toBe(false);
    });

    it('注销不存在的 contract 返回 false', () => {
      expect(registry.unregisterContract('nonexistent')).toBe(false);
    });

    it('注销会清理实现', () => {
      registry.registerContract(sampleContract);
      registry.registerImplementation('test.contract', 'ping', () => 'pong');
      expect(registry.hasImplementation('test.contract', 'ping')).toBe(true);
      registry.unregisterContract('test.contract');
      expect(registry.hasImplementation('test.contract', 'ping')).toBe(false);
    });

    it('注销触发事件', () => {
      const spy = vi.fn();
      registry.registerContract(sampleContract);
      registry.on('contract_unregistered', spy);
      registry.unregisterContract('test.contract');
      expect(spy).toHaveBeenCalledWith('test.contract');
    });
  });

  describe('registerImplementation', () => {
    it('为已注册 contract 注册实现', () => {
      registry.registerContract(sampleContract);
      registry.registerImplementation('test.contract', 'ping', () => 'pong');
      expect(registry.hasImplementation('test.contract', 'ping')).toBe(true);
    });

    it('重复注册会覆盖', () => {
      registry.registerContract(sampleContract);
      registry.registerImplementation('test.contract', 'ping', () => 'first');
      registry.registerImplementation('test.contract', 'ping', () => 'second');
      expect(registry.listImplementations('test.contract')).toEqual(['ping']);
    });

    it('未注册 contract 时抛错', () => {
      expect(() => registry.registerImplementation('missing', 'x', () => {})).toThrow(/not found/);
    });

    it('contract 中不存在的 method 抛错', () => {
      registry.registerContract(sampleContract);
      expect(() => registry.registerImplementation('test.contract', 'unknown', () => {})).toThrow(/not found in contract/);
    });
  });

  describe('callMethod', () => {
    it('调用同步方法', async () => {
      registry.registerContract(sampleContract);
      registry.registerImplementation('test.contract', 'ping', () => 'pong');
      const result = await registry.callMethod('test.contract', 'ping');
      expect(result).toBe('pong');
    });

    it('调用异步方法', async () => {
      registry.registerContract(sampleContract);
      registry.registerImplementation('test.contract', 'echo', async (x: unknown) => x);
      const result = await registry.callMethod('test.contract', 'echo', 'hello');
      expect(result).toBe('hello');
    });

    it('调用不存在的 contract 抛错', async () => {
      await expect(registry.callMethod('missing', 'x')).rejects.toThrow(/not found/);
    });

    it('调用未实现的方法抛错', async () => {
      registry.registerContract(sampleContract);
      await expect(registry.callMethod('test.contract', 'ping')).rejects.toThrow(/not implemented/);
    });

    it('contract_method_called 事件在调用时触发', async () => {
      const spy = vi.fn();
      registry.registerContract(sampleContract);
      registry.registerImplementation('test.contract', 'ping', () => 'pong');
      registry.on('contract_method_called', spy);
      await registry.callMethod('test.contract', 'ping', 1, 2);
      expect(spy).toHaveBeenCalledWith('test.contract', 'ping', [1, 2]);
    });
  });

  describe('listContracts & listImplementations', () => {
    it('listContracts 返回所有已注册 contract', () => {
      registry.registerContract(sampleContract);
      registry.registerContract({ ...sampleContract, id: 'test.contract2' });
      expect(registry.listContracts()).toHaveLength(2);
    });

    it('listImplementations 返回 contract 的所有实现', () => {
      registry.registerContract(sampleContract);
      registry.registerImplementation('test.contract', 'ping', () => {});
      registry.registerImplementation('test.contract', 'echo', () => {});
      expect(registry.listImplementations('test.contract').sort()).toEqual(['echo', 'ping']);
    });
  });

  describe('clear', () => {
    it('清理所有 contract 和实现', () => {
      registry.registerContract(sampleContract);
      registry.registerImplementation('test.contract', 'ping', () => 'pong');
      registry.clear();
      expect(registry.listContracts()).toEqual([]);
    });
  });

  describe('全局 contractRegistry 单例', () => {
    it('存在全局 contractRegistry 实例', () => {
      expect(contractRegistry).toBeInstanceOf(ContractRegistry);
    });
  });
});
