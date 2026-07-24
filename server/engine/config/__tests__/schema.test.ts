/**
 * schema.ts 单元测试
 *
 * 覆盖：
 * - resolveConfigSchema：基础 schema 结构与默认值
 * - validateConfig：object/array/enum/const/composition/min-max/required/additionalProperties
 * - mergeObjectSchema：properties/required/additionalProperties 合并
 * - lookupConfigSchema：根路径、嵌套路径、通配符、禁止段、最大段数、UI hint
 * - buildConfigSchema：base 缓存、plugin/channel 扩展、敏感字段标记
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveConfigSchema,
  validateConfig,
  mergeObjectSchema,
  lookupConfigSchema,
  buildConfigSchema,
  resetConfigSchemaCache,
} from '../schema.js';
import type { ConfigSchemaResponse } from '../schema.js';

// schema.ts 内部在发现校验错误时调用 logger.warn，这里模拟以避免 pino 初始化。
vi.mock('../../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('resolveConfigSchema', () => {
  it('返回包含核心顶层字段的对象 schema', () => {
    const schema = resolveConfigSchema();
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
    for (const key of ['gateway', 'models', 'plugins', 'agents', 'logging', 'skills']) {
      expect(schema.properties).toHaveProperty(key);
    }
  });

  it('gateway.auth.mode 提供 enum 与默认值', () => {
    const schema = resolveConfigSchema();
    const authMode = schema.properties!.gateway.properties!.auth.properties!.mode;
    expect(authMode.enum).toEqual(['none', 'token', 'password', 'trusted-proxy']);
    expect(authMode.default).toBe('none');
  });

  it('每次调用返回独立的新对象（互不影响）', () => {
    const a = resolveConfigSchema();
    const b = resolveConfigSchema();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    a.properties!.gateway.properties!.port.default = 9999;
    expect(b.properties!.gateway.properties!.port.default).toBe(3000);
  });
});

describe('validateConfig', () => {
  it('合法空对象不产生错误', () => {
    expect(validateConfig({})).toEqual([]);
  });

  it('非对象配置应报错', () => {
    const errors = validateConfig('not-an-object');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Expected object');
    expect(errors[0].severity).toBe('error');
  });

  it('类型不匹配应报错（数字字段传字符串）', () => {
    const errors = validateConfig({ gateway: { port: '3000' } });
    expect(errors.some((e) => e.path === 'config.gateway.port')).toBe(true);
  });

  it('enum 非法值应报错', () => {
    const errors = validateConfig({ gateway: { auth: { mode: 'invalid' } } });
    expect(
      errors.some((e) => e.path === 'config.gateway.auth.mode' && e.message.includes('enum')),
    ).toBe(true);
  });

  it('anyOf 至少匹配一个分支', () => {
    const schema = { anyOf: [{ type: 'string' }, { type: 'number' }] };
    expect(validateConfig('hello', schema)).toEqual([]);
    const errors = validateConfig(true, schema);
    expect(errors.some((e) => e.message.includes('anyOf'))).toBe(true);
  });

  it('oneOf 恰好匹配一个分支（多匹配应报错）', () => {
    const schema = {
      oneOf: [{ type: 'string', minLength: 1 }, { type: 'string', maxLength: 10 }],
    };
    const errors = validateConfig('hi', schema);
    expect(errors.some((e) => e.message.includes('oneOf'))).toBe(true);
  });

  it('allOf 所有分支都必须通过', () => {
    const schema = {
      allOf: [{ type: 'string', minLength: 3 }, { type: 'string', maxLength: 5 }],
    };
    expect(validateConfig('hi', schema).some((e) => e.message.includes('minLength'))).toBe(true);
    expect(validateConfig('hello', schema)).toEqual([]);
  });

  it('const 校验', () => {
    const schema = { const: 'fixed' };
    expect(validateConfig('fixed', schema)).toEqual([]);
    const errors = validateConfig('other', schema);
    expect(errors.some((e) => e.message.includes('const'))).toBe(true);
  });

  it('additionalProperties=false 应对未知字段发出 warning', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' } },
      additionalProperties: false,
    };
    const errors = validateConfig({ a: 'x', b: 1 }, schema);
    expect(errors.some((e) => e.path === 'config.b' && e.severity === 'warning')).toBe(true);
  });

  it('number minimum/maximum 边界校验', () => {
    const schema = { type: 'number', minimum: 1, maximum: 10 };
    expect(validateConfig(5, schema)).toEqual([]);
    expect(validateConfig(0, schema).some((e) => e.message.includes('minimum'))).toBe(true);
    expect(validateConfig(11, schema).some((e) => e.message.includes('maximum'))).toBe(true);
  });

  it('array minItems/maxItems 与 items 校验', () => {
    const schema = { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 2 };
    expect(validateConfig([1], schema)).toEqual([]);
    expect(validateConfig([], schema).some((e) => e.message.includes('minItems'))).toBe(true);
    expect(validateConfig([1, 2, 3], schema).some((e) => e.message.includes('maxItems'))).toBe(true);
    expect(validateConfig(['x'], schema).some((e) => e.path === 'config[0]')).toBe(true);
  });

  it('integer 类型拒绝浮点数', () => {
    const schema = { type: 'integer' };
    expect(validateConfig(3, schema)).toEqual([]);
    expect(validateConfig(3.5, schema).some((e) => e.message.includes('integer'))).toBe(true);
  });

  it('required 字段缺失应报错', () => {
    const schema = { type: 'object', required: ['a'], properties: { a: { type: 'string' } } };
    const errors = validateConfig({}, schema);
    expect(errors.some((e) => e.path === 'config.a' && e.message.includes('required'))).toBe(true);
  });
});

describe('mergeObjectSchema', () => {
  it('合并 properties', () => {
    const base = { type: 'object', properties: { a: { type: 'string' } } };
    const ext = { properties: { b: { type: 'number' } } };
    const merged = mergeObjectSchema(base, ext);
    expect(merged.properties).toHaveProperty('a');
    expect(merged.properties).toHaveProperty('b');
  });

  it('合并 required 并去重', () => {
    const base = { type: 'object', required: ['a', 'b'] };
    const ext = { required: ['b', 'c'] };
    const merged = mergeObjectSchema(base, ext);
    expect(merged.required?.sort()).toEqual(['a', 'b', 'c']);
  });

  it('extension properties 覆盖 base 同名字段', () => {
    const base = { type: 'object', properties: { a: { type: 'string' } } };
    const ext = { properties: { a: { type: 'number' } } };
    const merged = mergeObjectSchema(base, ext);
    expect(merged.properties.a.type).toBe('number');
  });

  it('additionalProperties 优先取 extension', () => {
    const base = { type: 'object', additionalProperties: false };
    const ext = { additionalProperties: { type: 'string' } };
    const merged = mergeObjectSchema(base, ext);
    expect(merged.additionalProperties).toEqual({ type: 'string' });
  });

  it('无 required 时不设置 required 字段', () => {
    const base = { type: 'object', properties: { a: { type: 'string' } } };
    const ext = { properties: { b: { type: 'number' } } };
    const merged = mergeObjectSchema(base, ext);
    expect(merged.required).toBeUndefined();
  });
});

describe('buildConfigSchema', () => {
  beforeEach(() => {
    resetConfigSchemaCache();
  });

  it('返回包含 schema、uiHints、version、generatedAt 的响应', () => {
    const resp = buildConfigSchema();
    expect(resp.schema).toBeDefined();
    expect(resp.uiHints).toBeDefined();
    expect(resp.version).toBe('1.0.0');
    expect(resp.generatedAt).toBeTruthy();
  });

  it('uiHints 包含来自 schemaHints 的基础提示', () => {
    const resp = buildConfigSchema();
    expect(resp.uiHints['gateway.port']).toBeDefined();
    expect(resp.uiHints['gateway.port'].label).toBe('端口');
  });

  it('无插件/频道时返回缓存的 base（同一引用）', () => {
    const a = buildConfigSchema();
    const b = buildConfigSchema();
    expect(a).toBe(b);
  });

  it('带插件时合并 plugin hints', () => {
    const resp = buildConfigSchema({
      plugins: [
        {
          id: 'demo',
          name: 'Demo',
          description: 'A demo plugin',
          configSchema: { type: 'object', properties: { apiKey: { type: 'string' } } },
          configUiHints: { apiKey: { label: 'API Key', tags: ['security'] } },
        },
      ],
    });
    expect(resp.uiHints['plugins.entries.demo']).toBeDefined();
    expect(resp.uiHints['plugins.entries.demo'].label).toBe('Demo');
    expect(resp.uiHints['plugins.entries.demo.config.apiKey']).toBeDefined();
    expect(resp.uiHints['plugins.entries.demo.config.apiKey'].label).toBe('API Key');
  });

  it('带频道时合并 channel hints', () => {
    const resp = buildConfigSchema({
      channels: [
        {
          id: 'slack',
          label: 'Slack',
          description: 'Slack channel',
          configSchema: { type: 'object', properties: { token: { type: 'string' } } },
          configUiHints: { token: { label: 'Slack Token' } },
        },
      ],
    });
    expect(resp.uiHints['channels.slack']).toBeDefined();
    expect(resp.uiHints['channels.slack'].label).toBe('Slack');
    expect(resp.uiHints['channels.slack.token']).toBeDefined();
    expect(resp.uiHints['channels.slack.token'].label).toBe('Slack Token');
  });

  it('敏感字段（含 token/password）应标记 sensitive', () => {
    const resp = buildConfigSchema();
    expect(resp.uiHints['gateway.auth.token'].sensitive).toBe(true);
    expect(resp.uiHints['gateway.auth.password'].sensitive).toBe(true);
  });
});

describe('lookupConfigSchema', () => {
  let response: ConfigSchemaResponse;

  beforeEach(() => {
    resetConfigSchemaCache();
    response = buildConfigSchema();
  });

  it('根路径 "." 返回根 schema 与子节点', () => {
    const result = lookupConfigSchema(response, '.');
    expect(result).not.toBeNull();
    expect(result!.path).toBe('.');
    expect(result!.children.length).toBeGreaterThan(0);
    expect(result!.children.map((c) => c.key)).toContain('gateway');
  });

  it('按路径查找嵌套节点 gateway.port', () => {
    const result = lookupConfigSchema(response, 'gateway.port');
    expect(result).not.toBeNull();
    expect(result!.schema.type).toBe('number');
  });

  it('查找不存在的路径返回 null', () => {
    expect(lookupConfigSchema(response, 'gateway.nonexistent')).toBeNull();
  });

  it('空路径返回 null', () => {
    expect(lookupConfigSchema(response, '')).toBeNull();
    expect(lookupConfigSchema(response, '   ')).toBeNull();
  });

  it('禁止的 prototype 段返回 null', () => {
    expect(lookupConfigSchema(response, '__proto__')).toBeNull();
    expect(lookupConfigSchema(response, 'constructor')).toBeNull();
  });

  it('路径超过最大段数返回 null', () => {
    const longPath = Array(35).fill('a').join('.');
    expect(lookupConfigSchema(response, longPath)).toBeNull();
  });

  it('查找结果附带 UI hint（若存在）', () => {
    const result = lookupConfigSchema(response, 'gateway.port');
    expect(result).not.toBeNull();
    expect(result!.hint).toBeDefined();
    expect(result!.hint!.label).toBe('端口');
  });

  it('子节点列出 properties 的 key 与 required 标记', () => {
    const customResp: ConfigSchemaResponse = {
      schema: {
        type: 'object',
        required: ['a'],
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
        },
      },
      uiHints: {},
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
    };
    const result = lookupConfigSchema(customResp, '.');
    expect(result).not.toBeNull();
    const a = result!.children.find((c) => c.key === 'a');
    const b = result!.children.find((c) => c.key === 'b');
    expect(a?.required).toBe(true);
    expect(b?.required).toBe(false);
  });
});
