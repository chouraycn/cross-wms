/**
 * 加密模块测试
 */

import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  reencrypt,
  generateKey,
  constantTimeEqual,
  shannonEntropy,
  deriveKeyWithPbkdf2,
  deriveKeyWithHkdf,
  getMasterKey,
} from '../encryption.js';

describe('加密模块', () => {
  describe('AES-256-GCM 加解密', () => {
    it('应能加密并解密字符串', () => {
      const key = generateKey();
      const plaintext = 'my-secret-api-key-12345';
      const encrypted = encrypt(plaintext, key);
      const decrypted = decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('加密结果不应等于明文', () => {
      const key = generateKey();
      const plaintext = 'sensitive-data';
      const encrypted = encrypt(plaintext, key);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain('iv');
      expect(encrypted).toContain('tag');
      expect(encrypted).toContain('ct');
    });

    it('相同明文加密两次应产生不同密文（IV 随机）', () => {
      const key = generateKey();
      const plaintext = 'same-plaintext';
      const e1 = encrypt(plaintext, key);
      const e2 = encrypt(plaintext, key);
      expect(e1).not.toBe(e2);
    });

    it('用错误密钥解密应抛出错误', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      const encrypted = encrypt('test', key1);
      expect(() => decrypt(encrypted, key2)).toThrow();
    });

    it('应支持中文/Unicode 明文', () => {
      const key = generateKey();
      const plaintext = '中文密钥内容-🚀🔥-unicode';
      const encrypted = encrypt(plaintext, key);
      expect(decrypt(encrypted, key)).toBe(plaintext);
    });
  });

  describe('密钥轮换（reencrypt）', () => {
    it('应能用新密钥重新加密密文', () => {
      const oldKey = generateKey();
      const newKey = generateKey();
      const plaintext = 'rotatable-secret';
      const oldEncrypted = encrypt(plaintext, oldKey);
      const newEncrypted = reencrypt(oldEncrypted, oldKey, newKey);
      expect(newEncrypted).not.toBe(oldEncrypted);
      expect(decrypt(newEncrypted, newKey)).toBe(plaintext);
    });
  });

  describe('恒定时间比较（constantTimeEqual）', () => {
    it('相同字符串应返回 true', () => {
      expect(constantTimeEqual('hello', 'hello')).toBe(true);
      expect(constantTimeEqual('', '')).toBe(true);
    });

    it('不同字符串应返回 false', () => {
      expect(constantTimeEqual('hello', 'world')).toBe(false);
      expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    });

    it('非字符串应返回 false', () => {
      expect(constantTimeEqual(null as any, 'test')).toBe(false);
      expect(constantTimeEqual(undefined as any, 'test')).toBe(false);
      expect(constantTimeEqual(123 as any, '123')).toBe(false);
    });

    it('应大小写敏感', () => {
      expect(constantTimeEqual('Hello', 'hello')).toBe(false);
    });
  });

  describe('香农熵（shannonEntropy）', () => {
    it('空字符串熵为 0', () => {
      expect(shannonEntropy('')).toBe(0);
    });

    it('单一字符重复熵为 0', () => {
      expect(shannonEntropy('aaaa')).toBe(0);
    });

    it('随机字符串熵较高', () => {
      const random = 'xY9!aB2#cD7$eF4%';
      const entropy = shannonEntropy(random);
      expect(entropy).toBeGreaterThan(3.5);
    });

    it('英文小写字母熵约 4.7', () => {
      const text = 'abcdefghij';
      const entropy = shannonEntropy(text);
      expect(entropy).toBeCloseTo(Math.log2(10), 1);
    });
  });

  describe('密钥派生', () => {
    it('PBKDF2 应返回 base64 密钥与 salt', () => {
      const { keyBase64, saltBase64 } = deriveKeyWithPbkdf2('password');
      expect(keyBase64).toBeTruthy();
      expect(saltBase64).toBeTruthy();
      // 256-bit 密钥 base64 编码后为 44 字符
      expect(keyBase64.length).toBe(44);
    });

    it('PBKDF2 相同 password + salt 应派生相同密钥', () => {
      const salt = Buffer.from('fixed-salt-123456');
      const r1 = deriveKeyWithPbkdf2('password', salt);
      const r2 = deriveKeyWithPbkdf2('password', salt);
      expect(r1.keyBase64).toBe(r2.keyBase64);
    });

    it('PBKDF2 不同 password 应派生不同密钥', () => {
      const r1 = deriveKeyWithPbkdf2('password1');
      const r2 = deriveKeyWithPbkdf2('password2');
      expect(r1.keyBase64).not.toBe(r2.keyBase64);
    });

    it('HKDF 应基于 info 派生不同子密钥', () => {
      const master = generateKey();
      const k1 = deriveKeyWithHkdf(master, 'module-a');
      const k2 = deriveKeyWithHkdf(master, 'module-b');
      expect(k1).not.toBe(k2);
      expect(k1.length).toBe(44);
    });
  });

  describe('getMasterKey', () => {
    it('应返回非空 base64 密钥', () => {
      const key = getMasterKey();
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
    });

    it('多次调用应返回相同密钥', () => {
      const k1 = getMasterKey();
      const k2 = getMasterKey();
      expect(k1).toBe(k2);
    });
  });
});
