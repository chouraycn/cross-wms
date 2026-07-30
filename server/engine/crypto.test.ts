/**
 * crypto AES-256-GCM 加解密 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock db 依赖
const mockGet = vi.fn();
const mockRun = vi.fn();
const mockExec = vi.fn();
const mockPrepare = vi.fn(() => ({
  get: mockGet,
  run: mockRun,
}));
const mockDb = { exec: mockExec, prepare: mockPrepare };

vi.mock('../db.js', () => ({
  initDb: vi.fn(() => mockDb),
}));

import {
  generateEncryptionKey,
  encrypt,
  decrypt,
  ensureEncryptionKey,
} from './crypto.js';
import { initDb } from '../db.js';

describe('crypto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepare.mockReturnValue({ get: mockGet, run: mockRun });
  });

  describe('generateEncryptionKey', () => {
    it('生成 base64 编码的 32 字节密钥', () => {
      const key = generateEncryptionKey();
      const decoded = Buffer.from(key, 'base64');
      expect(decoded.length).toBe(32);
    });

    it('每次生成不同的密钥', () => {
      const k1 = generateEncryptionKey();
      const k2 = generateEncryptionKey();
      expect(k1).not.toBe(k2);
    });
  });

  describe('encrypt / decrypt', () => {
    const validKey = Buffer.alloc(32, 7).toString('base64');

    it('加密后能正确解密还原明文', () => {
      const plaintext = '这是一段需要加密的敏感数据 secret 123';
      const encrypted = encrypt(plaintext, validKey);
      const decrypted = decrypt(encrypted, validKey);
      expect(decrypted).toBe(plaintext);
    });

    it('加密结果为 JSON 字符串且含 iv/tag/ciphertext', () => {
      const encrypted = encrypt('hello', validKey);
      const obj = JSON.parse(encrypted);
      expect(obj).toHaveProperty('iv');
      expect(obj).toHaveProperty('tag');
      expect(obj).toHaveProperty('ciphertext');
      expect(typeof obj.iv).toBe('string');
      expect(typeof obj.tag).toBe('string');
      expect(typeof obj.ciphertext).toBe('string');
    });

    it('每次加密产生不同的 iv（密文不同）', () => {
      const e1 = encrypt('same', validKey);
      const e2 = encrypt('same', validKey);
      expect(JSON.parse(e1).iv).not.toBe(JSON.parse(e2).iv);
      expect(JSON.parse(e1).ciphertext).not.toBe(JSON.parse(e2).ciphertext);
    });

    it('加密空字符串可正常往返', () => {
      const encrypted = encrypt('', validKey);
      expect(decrypt(encrypted, validKey)).toBe('');
    });

    it('加密 unicode 字符串可正常往返', () => {
      const plaintext = '中文测试 🚀 emoji';
      const encrypted = encrypt(plaintext, validKey);
      expect(decrypt(encrypted, validKey)).toBe(plaintext);
    });

    it('密钥长度不正确时 encrypt 抛出错误', () => {
      const badKey = Buffer.alloc(16, 1).toString('base64'); // 16 字节
      expect(() => encrypt('test', badKey)).toThrow(/Invalid key length/);
    });

    it('密钥长度不正确时 decrypt 抛出错误', () => {
      const badKey = Buffer.alloc(10, 1).toString('base64');
      const encrypted = encrypt('test', validKey);
      expect(() => decrypt(encrypted, badKey)).toThrow(/Invalid key length/);
    });

    it('用错误密钥解密抛出错误（认证失败）', () => {
      const encrypted = encrypt('secret', validKey);
      const wrongKey = Buffer.alloc(32, 9).toString('base64');
      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    it('篡改密文后解密抛出错误', () => {
      const encrypted = encrypt('secret', validKey);
      const obj = JSON.parse(encrypted);
      // 篡改 ciphertext
      obj.ciphertext = Buffer.from('tampered').toString('base64');
      expect(() => decrypt(JSON.stringify(obj), validKey)).toThrow();
    });

    it('解密非法 JSON 抛出错误', () => {
      expect(() => decrypt('not-a-json', validKey)).toThrow();
    });
  });

  describe('ensureEncryptionKey', () => {
    it('已存在密钥时直接返回数据库中的值', () => {
      const existingKey = 'existing-base64-key';
      mockGet.mockReturnValueOnce({ value: existingKey });

      const result = ensureEncryptionKey();

      expect(initDb).toHaveBeenCalledTimes(1);
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('app_settings'),
      );
      expect(mockGet).toHaveBeenCalledWith('engine_encryption_key');
      expect(result).toBe(existingKey);
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('不存在密钥时生成新密钥并写入数据库', () => {
      mockGet.mockReturnValueOnce(undefined);

      const result = ensureEncryptionKey();

      expect(result).toBeTruthy();
      // 应为合法的 32 字节 base64
      expect(Buffer.from(result, 'base64').length).toBe(32);
      expect(mockRun).toHaveBeenCalledWith(
        'engine_encryption_key',
        result,
      );
    });

    it('多次调用 ensureEncryptionKey 在无密钥时只写入一次', () => {
      mockGet.mockReturnValue(undefined);
      ensureEncryptionKey();
      expect(mockRun).toHaveBeenCalledTimes(1);
    });
  });
});
