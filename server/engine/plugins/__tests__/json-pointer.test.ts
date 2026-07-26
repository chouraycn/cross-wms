import { describe, it, expect } from 'vitest';
import {
  encodeJsonPointerToken,
  decodeJsonPointerToken,
  readJsonPointer,
} from '../_stub_parent__secrets__json_pointer.js';

describe('plugins/_stub_parent__secrets__json_pointer', () => {
  describe('encodeJsonPointerToken (RFC 6901)', () => {
    it('空字符串保持空字符串', () => {
      expect(encodeJsonPointerToken('')).toBe('');
    });

    it('普通文本不变', () => {
      expect(encodeJsonPointerToken('hello')).toBe('hello');
    });

    it('普通路径片段不变', () => {
      expect(encodeJsonPointerToken('users.42.name')).toBe('users.42.name');
    });

    it('转义单个波浪号 ~ 为 ~0', () => {
      expect(encodeJsonPointerToken('~')).toBe('~0');
    });

    it('转义单个斜杠 / 为 ~1', () => {
      expect(encodeJsonPointerToken('/')).toBe('~1');
    });

    it('转义 a/b → a~1b', () => {
      expect(encodeJsonPointerToken('a/b')).toBe('a~1b');
    });

    it('转义 a~b → a~0b', () => {
      expect(encodeJsonPointerToken('a~b')).toBe('a~0b');
    });

    it('转义多个连续波浪号 ~~ → ~0~0', () => {
      expect(encodeJsonPointerToken('~~')).toBe('~0~0');
    });

    it('转义多个连续斜杠 // → ~1~1', () => {
      expect(encodeJsonPointerToken('//')).toBe('~1~1');
    });

    it('同时包含 ~ 和 / 时按 RFC 6901 顺序转义（先 ~ 后 /）', () => {
      expect(encodeJsonPointerToken('~/')).toBe('~0~1');
      expect(encodeJsonPointerToken('/~')).toBe('~1~0');
    });

    it('转义路径 /foo/bar 中的单个 token foo/bar', () => {
      const token = 'foo/bar';
      expect(encodeJsonPointerToken(token)).toBe('foo~1bar');
    });

    it('混合复杂字符串保持非特殊字符不变', () => {
      expect(encodeJsonPointerToken('user@host.example')).toBe('user@host.example');
    });

    it('转义带特殊字符的复杂 token', () => {
      expect(encodeJsonPointerToken('a/b~c/d')).toBe('a~1b~0c~1d');
    });

    it('处理纯数字 token 不变', () => {
      expect(encodeJsonPointerToken('0')).toBe('0');
      expect(encodeJsonPointerToken('42')).toBe('42');
    });

    it('处理 unicode 字符不变', () => {
      expect(encodeJsonPointerToken('用户.名字')).toBe('用户.名字');
    });
  });

  describe('decodeJsonPointerToken (RFC 6901)', () => {
    it('空字符串保持空字符串', () => {
      expect(decodeJsonPointerToken('')).toBe('');
    });

    it('普通文本不变', () => {
      expect(decodeJsonPointerToken('hello')).toBe('hello');
    });

    it('反转 ~0 → ~', () => {
      expect(decodeJsonPointerToken('~0')).toBe('~');
    });

    it('反转 ~1 → /', () => {
      expect(decodeJsonPointerToken('~1')).toBe('/');
    });

    it('反转 a~1b → a/b', () => {
      expect(decodeJsonPointerToken('a~1b')).toBe('a/b');
    });

    it('反转 a~0b → a~b', () => {
      expect(decodeJsonPointerToken('a~0b')).toBe('a~b');
    });

    it('encode + decode 互为逆运算', () => {
      const original = 'a/b~c/d';
      const encoded = encodeJsonPointerToken(original);
      expect(decodeJsonPointerToken(encoded)).toBe(original);
    });

    it('反转复杂混合 token', () => {
      expect(decodeJsonPointerToken('a~1b~0c~1d')).toBe('a/b~c/d');
    });
  });

  describe('readJsonPointer', () => {
    const sample = {
      providers: {
        openai: { apiKey: 'sk-123', models: ['gpt-4', 'gpt-3.5'] },
        anthropic: { apiKey: 'sk-ant-456' },
      },
      version: 1,
    };

    it('读取顶层字段', () => {
      expect(readJsonPointer(sample, '/version')).toBe(1);
    });

    it('读取嵌套对象字段', () => {
      expect(readJsonPointer(sample, '/providers/openai/apiKey')).toBe('sk-123');
    });

    it('读取数组元素', () => {
      expect(readJsonPointer(sample, '/providers/openai/models/0')).toBe('gpt-4');
      expect(readJsonPointer(sample, '/providers/openai/models/1')).toBe('gpt-3.5');
    });

    it('读取完整对象', () => {
      expect(readJsonPointer(sample, '/providers/anthropic')).toEqual({ apiKey: 'sk-ant-456' });
    });

    it('非绝对路径抛错', () => {
      expect(() => readJsonPointer(sample, 'providers/openai')).toThrow();
    });

    it('不存在的字段默认抛错', () => {
      expect(() => readJsonPointer(sample, '/providers/nonexistent')).toThrow();
    });

    it('onMissing: "undefined" 时缺失返回 undefined', () => {
      expect(readJsonPointer(sample, '/providers/nonexistent', { onMissing: 'undefined' })).toBeUndefined();
    });

    it('数组越界抛错', () => {
      expect(() => readJsonPointer(sample, '/providers/openai/models/5')).toThrow();
    });

    it('非数字数组索引抛错', () => {
      expect(() => readJsonPointer(sample, '/providers/openai/models/abc')).toThrow();
    });

    it('支持含 / 的键名（RFC 6901 转义）', () => {
      const data = { 'a/b': { value: 42 } };
      expect(readJsonPointer(data, '/a~1b/value')).toBe(42);
    });

    it('支持含 ~ 的键名（RFC 6901 转义）', () => {
      const data = { 'a~b': { value: 42 } };
      expect(readJsonPointer(data, '/a~0b/value')).toBe(42);
    });

    it('空指针返回整个对象（RFC 6901 root）', () => {
      expect(readJsonPointer(sample, '')).toBe(sample);
    });
  });
});
