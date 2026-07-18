/**
 * pluginSchemaMerge 单元测试
 *
 * 覆盖：
 * - mergePluginSchema：单插件、多插件、字段覆盖、嵌套 object 合并、strict 保留
 * - validatePluginConfig：合法配置、非法配置、错误路径与信息
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { mergePluginSchema, validatePluginConfig } from '../pluginSchemaMerge.js';

describe('mergePluginSchema', () => {
  it('无插件时应返回原 schema', () => {
    const base = z.object({ a: z.string() });
    const merged = mergePluginSchema(base, []);
    expect(merged).toBe(base);
  });

  it('单插件字段应合并到基础 schema', () => {
    const base = z.object({ a: z.string() });
    const plugin = z.object({ b: z.number() });
    const merged = mergePluginSchema(base, [plugin]);

    const result = merged.safeParse({ a: 'hello', b: 42 });
    expect(result.success).toBe(true);
  });

  it('多插件字段应全部合并', () => {
    const base = z.object({ a: z.string() });
    const p1 = z.object({ b: z.number() });
    const p2 = z.object({ c: z.boolean() });
    const merged = mergePluginSchema(base, [p1, p2]);

    const result = merged.safeParse({ a: 'x', b: 1, c: true });
    expect(result.success).toBe(true);
  });

  it('插件字段应覆盖基础 schema 同名字段', () => {
    const base = z.object({ a: z.string() });
    const plugin = z.object({ a: z.number() });
    const merged = mergePluginSchema(base, [plugin]);

    const result = merged.safeParse({ a: 42 });
    expect(result.success).toBe(true);
  });

  it('后加载插件应覆盖先加载插件的同名字段', () => {
    const base = z.object({});
    const p1 = z.object({ a: z.string() });
    const p2 = z.object({ a: z.number() });
    const merged = mergePluginSchema(base, [p1, p2]);

    const result = merged.safeParse({ a: 99 });
    expect(result.success).toBe(true);
  });

  it('嵌套 object 应递归合并', () => {
    const base = z.object({
      config: z.object({ host: z.string() }),
    });
    const plugin = z.object({
      config: z.object({ port: z.number() }),
    });
    const merged = mergePluginSchema(base, [plugin]);

    const result = merged.safeParse({ config: { host: 'localhost', port: 3001 } });
    expect(result.success).toBe(true);
  });

  it('嵌套 object 同名字段应以后者为准', () => {
    const base = z.object({
      config: z.object({ host: z.string(), port: z.number() }),
    });
    const plugin = z.object({
      config: z.object({ port: z.string() }),
    });
    const merged = mergePluginSchema(base, [plugin]);

    const result = merged.safeParse({ config: { host: 'localhost', port: '3001' } });
    expect(result.success).toBe(true);
  });

  it('strict schema 应保持 strict', () => {
    const base = z.object({ a: z.string() }).strict();
    const plugin = z.object({ b: z.number() });
    const merged = mergePluginSchema(base, [plugin]);

    const bad = merged.safeParse({ a: 'x', b: 1, extra: true });
    expect(bad.success).toBe(false);
  });
});

describe('validatePluginConfig', () => {
  it('合法配置应返回 valid=true', () => {
    const schema = z.object({ name: z.string(), count: z.number() });
    const result = validatePluginConfig('test-plugin', { name: 'hello', count: 3 }, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('非法配置应返回 valid=false 并附带错误信息', () => {
    const schema = z.object({ name: z.string() });
    const result = validatePluginConfig('test-plugin', { name: 123 }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toContain('test-plugin');
    expect(result.errors![0]).toContain('name');
  });

  it('缺少必填字段应报错', () => {
    const schema = z.object({ required: z.string() });
    const result = validatePluginConfig('p1', {}, schema);
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.includes('required'))).toBe(true);
  });

  it('多个错误应全部收集', () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const result = validatePluginConfig('multi', { a: 1, b: 'two' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThanOrEqual(2);
  });
});
