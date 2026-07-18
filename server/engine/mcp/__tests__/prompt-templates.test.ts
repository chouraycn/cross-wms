/**
 * prompt-templates 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromptTemplateManager } from '../prompt-templates.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PromptTemplateManager', () => {
  let manager: PromptTemplateManager;

  beforeEach(() => {
    manager = new PromptTemplateManager();
  });

  describe('registerTemplate', () => {
    it('应该成功注册模板', () => {
      manager.registerTemplate({
        name: 'greeting',
        template: 'Hello, {{name}}!',
      });

      expect(manager.hasTemplate('greeting')).toBe(true);
      expect(manager.getTemplateCount()).toBe(1);
    });

    it('应该覆盖已存在的模板', () => {
      manager.registerTemplate({
        name: 'greeting',
        template: 'Hello, {{name}}!',
      });

      manager.registerTemplate({
        name: 'greeting',
        template: 'Hi, {{name}}!',
      });

      const template = manager.getTemplate('greeting');
      expect(template?.template).toBe('Hi, {{name}}!');
    });
  });

  describe('render', () => {
    it('应该插值简单变量', () => {
      manager.registerTemplate({
        name: 'greeting',
        template: 'Hello, {{name}}!',
      });

      const result = manager.render('greeting', { name: 'World' });
      expect(result).toBe('Hello, World!');
    });

    it('应该支持嵌套属性访问', () => {
      manager.registerTemplate({
        name: 'user-info',
        template: 'Name: {{user.name}}, Age: {{user.age}}',
      });

      const result = manager.render('user-info', {
        user: { name: 'Alice', age: 30 },
      });
      expect(result).toBe('Name: Alice, Age: 30');
    });

    it('应该处理条件块', () => {
      manager.registerTemplate({
        name: 'conditional',
        template: '{{#if show}}visible{{/if}}',
      });

      expect(manager.render('conditional', { show: true })).toBe('visible');
      expect(manager.render('conditional', { show: false })).toBe('');
    });

    it('应该处理条件块的 else 分支', () => {
      manager.registerTemplate({
        name: 'conditional-else',
        template: '{{#if show}}yes{{else}}no{{/if}}',
      });

      expect(manager.render('conditional-else', { show: true })).toBe('yes');
      expect(manager.render('conditional-else', { show: false })).toBe('no');
    });

    it('应该处理循环', () => {
      manager.registerTemplate({
        name: 'loop',
        template: '{{#each items}}{{this}},{{/each}}',
      });

      const result = manager.render('loop', { items: ['a', 'b', 'c'] });
      expect(result).toBe('a,b,c,');
    });

    it('应该处理对象数组循环', () => {
      manager.registerTemplate({
        name: 'object-loop',
        template: '{{#each users}}{{name}}:{{age}};{{/each}}',
      });

      const result = manager.render('object-loop', {
        users: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
      });
      expect(result).toBe('Alice:30;Bob:25;');
    });

    it('应该检查必需参数', () => {
      manager.registerTemplate({
        name: 'required',
        template: 'Test',
        arguments: [{ name: 'param', required: true }],
      });

      expect(() => manager.render('required')).toThrow('Missing required argument');
    });
  });

  describe('getTemplate', () => {
    it('应该返回模板定义', () => {
      manager.registerTemplate({
        name: 'test',
        template: 'Test template',
        description: 'A test template',
      });

      const template = manager.getTemplate('test');
      expect(template?.name).toBe('test');
      expect(template?.description).toBe('A test template');
    });

    it('应该返回 undefined 当模板不存在', () => {
      expect(manager.getTemplate('not-exist')).toBeUndefined();
    });
  });

  describe('listTemplates', () => {
    it('应该列出所有模板', () => {
      manager.registerTemplate({ name: 'a', template: 'A' });
      manager.registerTemplate({ name: 'b', template: 'B' });

      const list = manager.listTemplates();
      expect(list.length).toBe(2);
      expect(list.map((t) => t.name)).toContain('a');
      expect(list.map((t) => t.name)).toContain('b');
    });
  });

  describe('unregisterTemplate', () => {
    it('应该移除模板', () => {
      manager.registerTemplate({ name: 'test', template: 'Test' });
      manager.unregisterTemplate('test');
      expect(manager.hasTemplate('test')).toBe(false);
    });
  });

  describe('clear', () => {
    it('应该清空所有模板', () => {
      manager.registerTemplate({ name: 'a', template: 'A' });
      manager.registerTemplate({ name: 'b', template: 'B' });

      manager.clear();
      expect(manager.getTemplateCount()).toBe(0);
    });
  });
});