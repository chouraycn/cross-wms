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
  pluginConfigManager,
  createConfigManager,
  validateConfig,
} from '../config-manager.js';
import type { PluginConfigSchema } from '../types.js';

function makeSchema(): PluginConfigSchema {
  return {
    type: 'object',
    properties: {
      apiKey: { type: 'string', description: 'API Key' },
      port: { type: 'number', default: 3000 },
      enabled: { type: 'boolean', default: true },
      tags: { type: 'array', items: { type: 'string' } },
      nested: {
        type: 'object',
        properties: {
          inner: { type: 'string' },
        },
        required: ['inner'],
      },
    },
    required: ['apiKey'],
    additionalProperties: false,
  };
}

describe('plugins/config-manager', () => {
  beforeEach(() => {
    // 单例状态无法清除 — 每个测试用新 ID
  });

  describe('registerSchema / getSchema', () => {
    it('注册并查询 schema', () => {
      const id = `test-${Date.now()}-1`;
      const schema = makeSchema();
      pluginConfigManager.registerSchema(id, schema);
      expect(pluginConfigManager.getSchema(id)).toBe(schema);
    });

    it('unregisterSchema 移除 schema', () => {
      const id = `test-${Date.now()}-2`;
      pluginConfigManager.registerSchema(id, makeSchema());
      pluginConfigManager.unregisterSchema(id);
      expect(pluginConfigManager.getSchema(id)).toBeUndefined();
    });
  });

  describe('validate', () => {
    it('合法配置返回 valid=true', () => {
      const id = `test-${Date.now()}-3`;
      pluginConfigManager.registerSchema(id, makeSchema());
      const result = pluginConfigManager.validate(id, {
        apiKey: 'abc',
        port: 8080,
        enabled: true,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('缺少必填字段返回错误', () => {
      const id = `test-${Date.now()}-4`;
      pluginConfigManager.registerSchema(id, makeSchema());
      const result = pluginConfigManager.validate(id, { port: 8080 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('apiKey'))).toBe(true);
    });

    it('类型不匹配返回错误', () => {
      const id = `test-${Date.now()}-5`;
      pluginConfigManager.registerSchema(id, makeSchema());
      const result = pluginConfigManager.validate(id, {
        apiKey: 123,
        port: 'not-a-number',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('期望 string'))).toBe(true);
      expect(result.errors.some((e) => e.includes('期望 number'))).toBe(true);
    });

    it('additionalProperties=false 时拒绝未知字段', () => {
      const id = `test-${Date.now()}-6`;
      pluginConfigManager.registerSchema(id, makeSchema());
      const result = pluginConfigManager.validate(id, {
        apiKey: 'abc',
        unknownField: 'x',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('未知字段'))).toBe(true);
    });

    it('嵌套对象校验', () => {
      const id = `test-${Date.now()}-7`;
      pluginConfigManager.registerSchema(id, makeSchema());
      const result = pluginConfigManager.validate(id, {
        apiKey: 'abc',
        nested: {},
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('inner'))).toBe(true);
    });

    it('数组元素类型校验', () => {
      const id = `test-${Date.now()}-8`;
      pluginConfigManager.registerSchema(id, makeSchema());
      const result = pluginConfigManager.validate(id, {
        apiKey: 'abc',
        tags: ['ok', 123],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('applyDefaults / merge', () => {
    it('applyDefaults 填充默认值', () => {
      const id = `test-${Date.now()}-9`;
      pluginConfigManager.registerSchema(id, makeSchema());
      const result = pluginConfigManager.applyDefaults(id, { apiKey: 'abc' });
      expect(result.port).toBe(3000);
      expect(result.enabled).toBe(true);
      expect(result.apiKey).toBe('abc');
    });

    it('merge 三层合并', () => {
      const id = `test-${Date.now()}-10`;
      pluginConfigManager.registerSchema(id, makeSchema());
      const result = pluginConfigManager.merge(
        id,
        { apiKey: 'stored', port: 4000 },
        { port: 5000 },
      );
      expect(result.apiKey).toBe('stored');
      expect(result.port).toBe(5000);
      expect(result.enabled).toBe(true);
    });
  });

  describe('validateConfig (无单例)', () => {
    it('独立校验函数', () => {
      const result = validateConfig(makeSchema(), { apiKey: 'abc' });
      expect(result.valid).toBe(true);
    });
  });

  describe('createConfigManager', () => {
    it('返回独立实例', () => {
      const m1 = createConfigManager();
      const m2 = createConfigManager();
      m1.registerSchema('x', makeSchema());
      expect(m2.getSchema('x')).toBeUndefined();
    });
  });
});
