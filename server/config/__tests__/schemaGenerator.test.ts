/**
 * schemaGenerator 单元测试
 *
 * 覆盖：
 * - zodToJsonSchema：string/number/boolean/array/object/enum/union/optional/default/nullable
 * - generateUiHints：字段遍历、widget 推断、路径生成
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema, generateUiHints } from '../schemaGenerator.js';

describe('zodToJsonSchema', () => {
  it('应转换 string schema', () => {
    const schema = z.string();
    const json = zodToJsonSchema(schema);
    expect(json).toEqual({ type: 'string' });
  });

  it('应转换带校验的 string schema', () => {
    const schema = z.string().min(2).max(10).email();
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('string');
    expect(json.minLength).toBe(2);
    expect(json.maxLength).toBe(10);
    expect(json.format).toBe('email');
  });

  it('应转换 number schema', () => {
    const schema = z.number();
    const json = zodToJsonSchema(schema);
    expect(json).toEqual({ type: 'number' });
  });

  it('应转换 int schema', () => {
    const schema = z.int();
    const json = zodToJsonSchema(schema);
    expect(json).toEqual({ type: 'integer' });
  });

  it('应转换 boolean schema', () => {
    const schema = z.boolean();
    const json = zodToJsonSchema(schema);
    expect(json).toEqual({ type: 'boolean' });
  });

  it('应转换 array schema', () => {
    const schema = z.array(z.string());
    const json = zodToJsonSchema(schema);
    expect(json).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('应转换 array schema 带长度限制', () => {
    const schema = z.array(z.number()).min(1).max(5);
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('array');
    expect(json.items).toEqual({ type: 'number' });
    expect(json.minItems).toBe(1);
    expect(json.maxItems).toBe(5);
  });

  it('应转换 object schema', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('object');
    expect(json.properties).toEqual({
      name: { type: 'string' },
      age: { type: 'number' },
    });
    expect(json.required).toContain('name');
    expect(json.required).toContain('age');
  });

  it('应区分 required / optional 字段', () => {
    const schema = z.object({
      req: z.string(),
      opt: z.string().optional(),
      withDefault: z.boolean().default(false),
    });
    const json = zodToJsonSchema(schema);
    expect(json.required).toEqual(['req']);
    expect(json.properties?.opt).toEqual({ type: 'string' });
    expect(json.properties?.withDefault).toEqual({ type: 'boolean', default: false });
  });

  it('应转换 enum schema', () => {
    const schema = z.enum(['a', 'b', 'c']);
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('string');
    expect(json.enum).toEqual(['a', 'b', 'c']);
  });

  it('应转换 literal schema', () => {
    const schema = z.literal('hello');
    const json = zodToJsonSchema(schema);
    expect(json).toEqual({ const: 'hello' });
  });

  it('应转换 union schema', () => {
    const schema = z.union([z.string(), z.number()]);
    const json = zodToJsonSchema(schema);
    expect(json.anyOf).toEqual([{ type: 'string' }, { type: 'number' }]);
  });

  it('应转换 nullable schema', () => {
    const schema = z.string().nullable();
    const json = zodToJsonSchema(schema);
    expect(json.anyOf).toEqual([{ type: 'null' }, { type: 'string' }]);
  });

  it('应转换 default schema', () => {
    const schema = z.string().default('fallback');
    const json = zodToJsonSchema(schema);
    expect(json).toEqual({ type: 'string', default: 'fallback' });
  });

  it('应转换 record schema', () => {
    const schema = z.record(z.number());
    const json = zodToJsonSchema(schema);
    expect(json).toEqual({ type: 'object', additionalProperties: { type: 'number' } });
  });

  it('应转换 tuple schema', () => {
    const schema = z.tuple([z.string(), z.number()]);
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('array');
    expect(json.items).toEqual([{ type: 'string' }, { type: 'number' }]);
    expect(json.minItems).toBe(2);
    expect(json.maxItems).toBe(2);
  });

  it('应转换 strict object schema', () => {
    const schema = z.object({ a: z.string() }).strict();
    const json = zodToJsonSchema(schema);
    expect(json.additionalProperties).toBe(false);
  });

  it('应处理嵌套 object', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
    });
    const json = zodToJsonSchema(schema);
    expect(json.properties?.user).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
      },
      required: ['name', 'email'],
    });
  });

  it('空 schema 应返回空对象', () => {
    const json = zodToJsonSchema(null as any);
    expect(json).toEqual({});
  });
});

describe('generateUiHints', () => {
  it('应为 object 字段生成 ui hints', () => {
    const schema = z.object({
      name: z.string().optional(),
      age: z.number().default(18),
      role: z.enum(['admin', 'user']),
    });
    const hints = generateUiHints(schema);

    expect(hints['name']).toBeDefined();
    expect(hints['name'].type).toBe('string');
    expect(hints['name'].ui?.widget).toBe('text');

    expect(hints['age']).toBeDefined();
    expect(hints['age'].type).toBe('number');
    expect(hints['age'].default).toBe(18);
    expect(hints['age'].ui?.widget).toBe('number');

    expect(hints['role']).toBeDefined();
    expect(hints['role'].type).toBe('string');
    expect(hints['role'].enum).toEqual(['admin', 'user']);
    expect(hints['role'].ui?.widget).toBe('select');
  });

  it('应为嵌套 object 生成完整路径', () => {
    const schema = z.object({
      server: z.object({
        port: z.number(),
        host: z.string(),
      }),
    });
    const hints = generateUiHints(schema);
    expect(hints['server.port']).toBeDefined();
    expect(hints['server.port'].type).toBe('number');
    expect(hints['server.host']).toBeDefined();
    expect(hints['server.host'].type).toBe('string');
  });

  it('应为 array 生成 items 路径', () => {
    const schema = z.object({
      tags: z.array(z.string()),
    });
    const hints = generateUiHints(schema);
    expect(hints['tags']).toBeDefined();
    expect(hints['tags'].type).toBe('array');
    expect(hints['tags'].ui?.widget).toBe('list');
    expect(hints['tags[]']).toBeDefined();
    expect(hints['tags[]'].type).toBe('string');
  });

  it('应为 union 生成 anyOf 路径', () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]),
    });
    const hints = generateUiHints(schema);
    expect(hints['value']).toBeDefined();
    expect(hints['value'].type).toBe('union');
  });

  it('直接传入 JSON Schema 也能生成 hints', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
      },
    };
    const hints = generateUiHints(jsonSchema);
    expect(hints['enabled']).toBeDefined();
    expect(hints['enabled'].type).toBe('boolean');
    expect(hints['enabled'].ui?.widget).toBe('switch');
  });

  it('应为 email string 生成 email widget', () => {
    const schema = z.object({
      email: z.string().email(),
    });
    const hints = generateUiHints(schema);
    expect(hints['email'].ui?.widget).toBe('email');
  });

  it('应为长文本生成 textarea widget', () => {
    const schema = z.object({
      desc: z.string().max(500),
    });
    const hints = generateUiHints(schema);
    expect(hints['desc'].ui?.widget).toBe('textarea');
  });
});
