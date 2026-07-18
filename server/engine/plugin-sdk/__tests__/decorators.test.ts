import { describe, it, expect } from 'vitest';
import {
  definePlugin,
  defineTool,
  defineCommand,
  defineHook,
  isValidPluginId,
} from '../decorators.js';

describe('plugin-sdk/decorators', () => {
  describe('definePlugin', () => {
    it('返回带 full registrationMode 的定义', () => {
      const def = definePlugin({
        id: 'my-plugin',
        name: 'My Plugin',
        description: 'd',
        version: '1.0.0',
        register: () => {},
      });
      expect(def.id).toBe('my-plugin');
      expect(def.registrationMode).toBe('full');
      expect(typeof def.register).toBe('function');
    });

    it('保留 capabilities 与 configSchema', () => {
      const def = definePlugin({
        id: 'p1',
        name: 'P1',
        capabilities: ['tool', 'hook'],
        configSchema: { type: 'object', properties: { apiKey: { type: 'string' } } },
        register: () => {},
      });
      expect(def.capabilities).toEqual(['tool', 'hook']);
      expect(def.configSchema?.properties?.apiKey).toBeDefined();
    });

    it('保留 setup 钩子', () => {
      const setup = vi.fn();
      const def = definePlugin({
        id: 'p1',
        name: 'P1',
        setup,
        register: () => {},
      });
      expect(def.setup).toBe(setup);
    });
  });

  describe('defineTool', () => {
    it('返回工具定义副本', () => {
      const input = {
        name: 'echo',
        description: 'echo tool',
        parameters: { type: 'object' as const, properties: {} },
        handler: async () => 'ok',
      };
      const tool = defineTool(input);
      expect(tool.name).toBe('echo');
      expect(tool).not.toBe(input); // 是副本
    });
  });

  describe('defineCommand', () => {
    it('返回命令定义副本', () => {
      const cmd = defineCommand({
        name: 'greet',
        description: 'greet command',
        handler: () => 'hi',
      });
      expect(cmd.name).toBe('greet');
    });
  });

  describe('defineHook', () => {
    it('返回 hook 注册对象', () => {
      const handler = () => null;
      const h = defineHook('onMessage', handler, { priority: 10 });
      expect(h.hookName).toBe('onMessage');
      expect(h.handler).toBe(handler);
      expect(h.priority).toBe(10);
    });

    it('默认 priority 为 0', () => {
      const h = defineHook('onMessage', () => null);
      expect(h.priority).toBe(0);
    });
  });

  describe('isValidPluginId', () => {
    it('接受合法 ID', () => {
      expect(isValidPluginId('my-plugin')).toBe(true);
      expect(isValidPluginId('plugin_123')).toBe(true);
      expect(isValidPluginId('abc')).toBe(true);
    });

    it('拒绝大写字母', () => {
      expect(isValidPluginId('MyPlugin')).toBe(false);
    });

    it('拒绝特殊字符', () => {
      expect(isValidPluginId('my.plugin!')).toBe(false);
      expect(isValidPluginId('my plugin')).toBe(false);
    });

    it('拒绝空字符串', () => {
      expect(isValidPluginId('')).toBe(false);
    });
  });
});

// 局部 import 避免 vitest globals 类型提示问题
import { vi } from 'vitest';
