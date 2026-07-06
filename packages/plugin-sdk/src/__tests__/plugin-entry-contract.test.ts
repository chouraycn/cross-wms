/**
 * Plugin Entry Contract 测试
 *
 * 覆盖 definePluginEntry 的契约行为：
 * - 基本定义（id/name/description/register/setup）
 * - id 校验（非空、格式）
 * - register 必须为函数
 * - configSchema 默认值（emptyPluginConfigSchema）
 * - configSchema 懒加载（函数形式）
 * - registrationMode 默认值（full）
 * - 可选的 setup 函数
 * - lazy evaluate（多次访问 configSchema 只计算一次）
 */

import { describe, it, expect, vi } from 'vitest';
import { definePluginEntry } from '../plugin-entry.js';

describe('definePluginEntry Contract', () => {
  describe('基础定义', () => {
    it('返回 PluginDefinition', () => {
      const entry = definePluginEntry({
        id: 'my-plugin',
        name: 'My Plugin',
        description: 'A test plugin',
        register: () => {},
      });
      expect(entry.id).toBe('my-plugin');
      expect(entry.name).toBe('My Plugin');
      expect(entry.description).toBe('A test plugin');
      expect(typeof entry.register).toBe('function');
    });

    it('默认 configSchema 为空 schema', () => {
      const entry = definePluginEntry({
        id: 'p',
        name: 'P',
        description: 'd',
        register: () => {},
      });
      expect(entry.configSchema).toEqual({ fields: [] });
    });

    it('默认 registrationMode 为 full', () => {
      const entry = definePluginEntry({
        id: 'p',
        name: 'P',
        description: 'd',
        register: () => {},
      });
      expect(entry.registrationMode).toBe('full');
    });

    it('自定义 registrationMode 被保留', () => {
      const entry = definePluginEntry({
        id: 'p',
        name: 'P',
        description: 'd',
        register: () => {},
        registrationMode: 'lazy',
      });
      expect(entry.registrationMode).toBe('lazy');
    });
  });

  describe('id 校验', () => {
    it('空 id 抛错', () => {
      expect(() => definePluginEntry({
        id: '',
        name: 'P',
        description: 'd',
        register: () => {},
      })).toThrow(/id is required/);
    });

    it('非字符串 id 抛错', () => {
      expect(() => definePluginEntry({
        id: 123 as unknown as string,
        name: 'P',
        description: 'd',
        register: () => {},
      })).toThrow(/id is required/);
    });

    it('大写字母 id 抛错', () => {
      expect(() => definePluginEntry({
        id: 'InvalidId',
        name: 'P',
        description: 'd',
        register: () => {},
      })).toThrow(/id must match/);
    });

    it('下划线 id 抛错', () => {
      expect(() => definePluginEntry({
        id: 'invalid_id',
        name: 'P',
        description: 'd',
        register: () => {},
      })).toThrow(/id must match/);
    });

    it('带空格 id 抛错', () => {
      expect(() => definePluginEntry({
        id: 'invalid id',
        name: 'P',
        description: 'd',
        register: () => {},
      })).toThrow(/id must match/);
    });

    it('小写字母+数字+中划线 id 通过', () => {
      expect(() => definePluginEntry({
        id: 'valid-plugin-123',
        name: 'P',
        description: 'd',
        register: () => {},
      })).not.toThrow();
    });
  });

  describe('register 必须为函数', () => {
    it('register 非函数抛错', () => {
      expect(() => definePluginEntry({
        id: 'p',
        name: 'P',
        description: 'd',
        register: 'not a function' as unknown as () => void,
      })).toThrow(/register must be a function/);
    });

    it('register 为 undefined 抛错', () => {
      expect(() => definePluginEntry({
        id: 'p',
        name: 'P',
        description: 'd',
        register: undefined as unknown as () => void,
      })).toThrow(/register must be a function/);
    });
  });

  describe('configSchema', () => {
    it('直接传入对象', () => {
      const schema = { fields: [{ key: 'k', type: 'string' as const }] };
      const entry = definePluginEntry({
        id: 'p',
        name: 'P',
        description: 'd',
        configSchema: schema,
        register: () => {},
      });
      expect(entry.configSchema).toBe(schema);
    });

    it('接受函数形式懒加载', () => {
      const factory = vi.fn().mockReturnValue({
        fields: [{ key: 'lazy', type: 'string' as const, default: 'lazy-value' }],
      });
      const entry = definePluginEntry({
        id: 'p',
        name: 'P',
        description: 'd',
        configSchema: factory,
        register: () => {},
      });

      // 第一次访问触发 factory
      const schema1 = entry.configSchema;
      expect(factory).toHaveBeenCalledOnce();
      expect(schema1.fields[0].default).toBe('lazy-value');

      // 第二次访问使用缓存
      const schema2 = entry.configSchema;
      expect(factory).toHaveBeenCalledOnce();
      expect(schema2).toBe(schema1);
    });
  });

  describe('setup 函数', () => {
    it('不传 setup 时 entry 不包含 setup', () => {
      const entry = definePluginEntry({
        id: 'p',
        name: 'P',
        description: 'd',
        register: () => {},
      });
      expect(entry.setup).toBeUndefined();
    });

    it('传 setup 时 entry.setup 等于传入函数', () => {
      const setup = vi.fn();
      const entry = definePluginEntry({
        id: 'p',
        name: 'P',
        description: 'd',
        register: () => {},
        setup,
      });
      expect(entry.setup).toBe(setup);
    });
  });

  describe('register 调用', () => {
    it('entry 的 register 函数等于传入函数', () => {
      const register = vi.fn();
      const entry = definePluginEntry({
        id: 'p',
        name: 'P',
        description: 'd',
        register,
      });
      expect(entry.register).toBe(register);
    });

    it('可以直接调用 entry.register', () => {
      const register = vi.fn();
      const entry = definePluginEntry({
        id: 'p',
        name: 'P',
        description: 'd',
        register,
      });
      entry.register();
      expect(register).toHaveBeenCalledOnce();
    });
  });
});
