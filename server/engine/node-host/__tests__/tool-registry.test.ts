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

import { ToolRegistry, createToolRegistry } from '../tool-registry.js';
import type { ToolDefinition, ToolHandler } from '../types.js';

function makeToolDef(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'test-tool',
    description: 'A test tool',
    category: 'general',
    version: '1.0.0',
    ...overrides,
  };
}

const mockHandler: ToolHandler = async (input) => ({ result: 'ok', input });

describe('node-host/tool-registry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  describe('register', () => {
    it('注册工具成功返回 true', () => {
      const result = registry.register(makeToolDef(), mockHandler);
      expect(result).toBe(true);
      expect(registry.size()).toBe(1);
    });

    it('重复注册返回 false', () => {
      registry.register(makeToolDef(), mockHandler);
      const result = registry.register(makeToolDef(), mockHandler);
      expect(result).toBe(false);
      expect(registry.size()).toBe(1);
    });

    it('注册多个不同工具', () => {
      registry.register(makeToolDef({ name: 'tool-a' }), mockHandler);
      registry.register(makeToolDef({ name: 'tool-b' }), mockHandler);
      registry.register(makeToolDef({ name: 'tool-c' }), mockHandler);
      expect(registry.size()).toBe(3);
    });
  });

  describe('unregister', () => {
    it('注销已存在的工具返回 true', () => {
      registry.register(makeToolDef(), mockHandler);
      const result = registry.unregister('test-tool');
      expect(result).toBe(true);
      expect(registry.size()).toBe(0);
    });

    it('注销不存在的工具返回 false', () => {
      const result = registry.unregister('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('查询', () => {
    it('get 返回工具条目', () => {
      registry.register(makeToolDef(), mockHandler);
      const entry = registry.get('test-tool');
      expect(entry).toBeDefined();
      expect(entry?.definition.name).toBe('test-tool');
    });

    it('has 检查工具是否存在', () => {
      registry.register(makeToolDef(), mockHandler);
      expect(registry.has('test-tool')).toBe(true);
      expect(registry.has('other')).toBe(false);
    });

    it('getHandler 返回处理函数', () => {
      registry.register(makeToolDef(), mockHandler);
      const handler = registry.getHandler('test-tool');
      expect(typeof handler).toBe('function');
    });

    it('getDefinition 返回工具定义', () => {
      const def = makeToolDef({ description: 'test desc' });
      registry.register(def, mockHandler);
      const result = registry.getDefinition('test-tool');
      expect(result?.description).toBe('test desc');
    });
  });

  describe('list & category', () => {
    it('list 返回所有工具定义', () => {
      registry.register(makeToolDef({ name: 'a' }), mockHandler);
      registry.register(makeToolDef({ name: 'b' }), mockHandler);
      const list = registry.list();
      expect(list.length).toBe(2);
    });

    it('listByCategory 按分类筛选', () => {
      registry.register(makeToolDef({ name: 'a', category: 'cat1' }), mockHandler);
      registry.register(makeToolDef({ name: 'b', category: 'cat2' }), mockHandler);
      registry.register(makeToolDef({ name: 'c', category: 'cat1' }), mockHandler);
      const cat1 = registry.listByCategory('cat1');
      expect(cat1.length).toBe(2);
      expect(cat1.map(t => t.name).sort()).toEqual(['a', 'c']);
    });

    it('getCategories 返回所有分类', () => {
      registry.register(makeToolDef({ name: 'a', category: 'cat1' }), mockHandler);
      registry.register(makeToolDef({ name: 'b', category: 'cat2' }), mockHandler);
      const categories = registry.getCategories();
      expect(categories).toEqual(['cat1', 'cat2']);
    });
  });

  describe('search', () => {
    it('按名称搜索工具', () => {
      registry.register(makeToolDef({ name: 'foo-bar' }), mockHandler);
      registry.register(makeToolDef({ name: 'baz-qux' }), mockHandler);
      const results = registry.search('foo');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('foo-bar');
    });

    it('按描述搜索工具', () => {
      registry.register(makeToolDef({ name: 'a', description: 'file operations' }), mockHandler);
      registry.register(makeToolDef({ name: 'b', description: 'network stuff' }), mockHandler);
      const results = registry.search('file');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('a');
    });

    it('搜索不区分大小写', () => {
      registry.register(makeToolDef({ name: 'TestTool' }), mockHandler);
      const results = registry.search('test');
      expect(results.length).toBe(1);
    });
  });

  describe('clear', () => {
    it('清空所有工具', () => {
      registry.register(makeToolDef({ name: 'a' }), mockHandler);
      registry.register(makeToolDef({ name: 'b' }), mockHandler);
      registry.clear();
      expect(registry.size()).toBe(0);
    });
  });

  describe('getToolNames', () => {
    it('返回所有工具名称', () => {
      registry.register(makeToolDef({ name: 'a' }), mockHandler);
      registry.register(makeToolDef({ name: 'b' }), mockHandler);
      expect(registry.getToolNames().sort()).toEqual(['a', 'b']);
    });
  });
});
