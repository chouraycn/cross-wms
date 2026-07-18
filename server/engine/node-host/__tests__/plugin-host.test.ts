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

import { PluginHost, createPluginHost } from '../plugin-host.js';
import type { PluginDefinition, ToolHandler } from '../types.js';

const mockHandler: ToolHandler = async (input) => ({ result: 'ok', input });

function makePluginDef(overrides: Partial<PluginDefinition> = {}): PluginDefinition {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    tools: [
      { name: 'tool1', description: 'Tool 1' },
      { name: 'tool2', description: 'Tool 2' },
    ],
    ...overrides,
  };
}

describe('node-host/plugin-host', () => {
  let host: PluginHost;

  beforeEach(() => {
    host = createPluginHost({ autoActivate: false });
  });

  describe('load / unload', () => {
    it('加载插件成功', () => {
      const instance = host.load(makePluginDef());
      expect(instance).toBeDefined();
      expect(instance.definition.id).toBe('test-plugin');
      expect(instance.status).toBe('loaded');
      expect(host.size()).toBe(1);
    });

    it('重复加载抛出错误', () => {
      host.load(makePluginDef());
      expect(() => host.load(makePluginDef())).toThrow('Plugin already loaded');
    });

    it('卸载插件', () => {
      host.load(makePluginDef());
      expect(host.unload('test-plugin')).toBe(true);
      expect(host.size()).toBe(0);
    });

    it('卸载不存在的插件返回 false', () => {
      expect(host.unload('nonexistent')).toBe(false);
    });
  });

  describe('activate / deactivate', () => {
    it('激活插件', () => {
      host.load(makePluginDef());
      const result = host.activate('test-plugin');
      expect(result).toBe(true);
      expect(host.getStatus('test-plugin')).toBe('active');
    });

    it('激活已激活的插件返回 true', () => {
      host = createPluginHost({ autoActivate: true });
      host.load(makePluginDef());
      expect(host.activate('test-plugin')).toBe(true);
    });

    it('激活不存在的插件返回 false', () => {
      expect(host.activate('nonexistent')).toBe(false);
    });

    it('停用插件', () => {
      host = createPluginHost({ autoActivate: true });
      const handlers = new Map([['tool1', mockHandler]]);
      host.load(makePluginDef(), handlers);
      expect(host.deactivate('test-plugin')).toBe(true);
      expect(host.getStatus('test-plugin')).toBe('disabled');
    });

    it('停用不存在的插件返回 false', () => {
      expect(host.deactivate('nonexistent')).toBe(false);
    });
  });

  describe('查询', () => {
    it('get 返回插件实例', () => {
      host.load(makePluginDef());
      const instance = host.get('test-plugin');
      expect(instance?.definition.name).toBe('Test Plugin');
    });

    it('get 返回 undefined 当不存在时', () => {
      expect(host.get('nonexistent')).toBeUndefined();
    });

    it('has 检查是否存在', () => {
      host.load(makePluginDef());
      expect(host.has('test-plugin')).toBe(true);
      expect(host.has('other')).toBe(false);
    });

    it('list 返回所有插件定义', () => {
      host.load(makePluginDef({ id: 'p1' }));
      host.load(makePluginDef({ id: 'p2' }));
      const list = host.list();
      expect(list.length).toBe(2);
    });

    it('listActive 只返回激活的插件', () => {
      host = createPluginHost({ autoActivate: false });
      host.load(makePluginDef({ id: 'p1' }));
      host.load(makePluginDef({ id: 'p2' }));
      host.activate('p1');
      expect(host.listActive().length).toBe(1);
      expect(host.listActive()[0].id).toBe('p1');
    });

    it('getStatus 返回状态', () => {
      host.load(makePluginDef());
      expect(host.getStatus('test-plugin')).toBe('loaded');
    });

    it('getStatus 不存在时返回 null', () => {
      expect(host.getStatus('nonexistent')).toBeNull();
    });

    it('getPluginIds 返回所有 id', () => {
      host.load(makePluginDef({ id: 'a' }));
      host.load(makePluginDef({ id: 'b' }));
      expect(host.getPluginIds().sort()).toEqual(['a', 'b']);
    });
  });

  describe('工具管理', () => {
    it('setToolHandler 设置工具处理函数', () => {
      host = createPluginHost({ autoActivate: true });
      host.load(makePluginDef());
      const result = host.setToolHandler('test-plugin', 'tool1', mockHandler);
      expect(result).toBe(true);
    });

    it('setToolHandler 对不存在的插件返回 false', () => {
      expect(host.setToolHandler('nonexistent', 'tool', mockHandler)).toBe(false);
    });

    it('getPluginTools 返回插件工具列表', () => {
      host.load(makePluginDef());
      const tools = host.getPluginTools('test-plugin');
      expect(tools.length).toBe(2);
      expect(tools[0].name).toBe('tool1');
    });

    it('getPluginTools 不存在时返回空数组', () => {
      expect(host.getPluginTools('nonexistent')).toEqual([]);
    });
  });

  describe('autoActivate', () => {
    it('autoActivate 为 true 时自动激活', () => {
      host = createPluginHost({ autoActivate: true });
      const handlers = new Map([['tool1', mockHandler]]);
      host.load(makePluginDef(), handlers);
      expect(host.getStatus('test-plugin')).toBe('active');
    });
  });

  describe('clear', () => {
    it('clear 清空所有插件', () => {
      host.load(makePluginDef({ id: 'a' }));
      host.load(makePluginDef({ id: 'b' }));
      host.clear();
      expect(host.size()).toBe(0);
    });
  });

  describe('toolRegistry', () => {
    it('getToolRegistry 返回工具注册表', () => {
      const registry = host.getToolRegistry();
      expect(registry).toBeDefined();
    });
  });
});
