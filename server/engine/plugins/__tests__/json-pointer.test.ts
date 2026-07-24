import { describe, it, expect } from 'vitest';
import { encodeJsonPointerToken } from '../_stub_parent__secrets__json_pointer.js';

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
      // 实现先 replace ~ → ~0，再 replace / → ~1。
      // '~/': ~ → ~0, / → ~1，结果是 '~0~1'。
      expect(encodeJsonPointerToken('~/')).toBe('~0~1');
      // '/~': 第一步 / 不变（无 ~），~ → ~0，结果 '/~0'；第二步 / → ~1，结果 '~1~0'。
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
});
