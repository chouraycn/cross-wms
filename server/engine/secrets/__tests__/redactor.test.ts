/**
 * 脱敏模块测试
 */

import { describe, it, expect } from 'vitest';
import {
  SecretRedactor,
  createDefaultRedactor,
  redactPartial,
  DEFAULT_REDACTION_RULES,
} from '../redactor.js';

describe('脱敏模块', () => {
  describe('redactPartial', () => {
    it('应保留首尾字符，中间用 * 替换', () => {
      const result = redactPartial('abcdefghij', 2, 2);
      expect(result).toBe('ab******ij');
    });

    it('长度不足时应全部脱敏', () => {
      const result = redactPartial('abc', 2, 2);
      expect(result).toBe('***');
    });

    it('应至少有 4 个 * 字符', () => {
      const result = redactPartial('abcdef', 1, 1);
      // 长度 6 - 1 - 1 = 4，正好 4 个 *
      expect(result).toContain('****');
    });
  });

  describe('SecretRedactor - 已知值脱敏', () => {
    it('注册的密钥值应被脱敏', () => {
      const redactor = new SecretRedactor();
      redactor.registerSecret('my-super-secret-value-12345');
      const result = redactor.redact('使用 my-super-secret-value-12345 进行认证');
      expect(result).not.toContain('my-super-secret-value-12345');
      expect(result).toContain('***REDACTED***');
    });

    it('unregister 后应不再脱敏', () => {
      const redactor = new SecretRedactor();
      const secret = 'my-super-secret-value-12345';
      redactor.registerSecret(secret);
      redactor.unregisterSecret(secret);
      const result = redactor.redact(`使用 ${secret}`);
      expect(result).toContain(secret);
    });

    it('clear 应清空所有已注册值', () => {
      const redactor = new SecretRedactor();
      redactor.registerSecret('secret-one-1234567890');
      redactor.registerSecret('secret-two-1234567890');
      redactor.clear();
      const result = redactor.redact('secret-one-1234567890 secret-two-1234567890');
      expect(result).toContain('secret-one-1234567890');
    });
  });

  describe('SecretRedactor - 规则匹配', () => {
    it('应脱敏 Bearer Token', () => {
      const redactor = createDefaultRedactor();
      const input = 'Authorization: Bearer abcdef1234567890abcdef==';
      const result = redactor.redact(input);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('abcdef1234567890abcdef==');
    });

    it('应脱敏 AWS Access Key（AKIA 开头）', () => {
      const redactor = createDefaultRedactor();
      const input = '使用 AKIAIOSFODNN7EXAMPLE 访问 S3';
      const result = redactor.redact(input);
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('应脱敏阿里云 AccessKeyId（LTAI 开头）', () => {
      const redactor = createDefaultRedactor();
      const input = 'LTAI4Gxxxxxxxxxxxxxxxxxx';
      const result = redactor.redact(input);
      expect(result).not.toContain('LTAI4Gxxxxxxxxxxxxxxxxxx');
    });

    it('应脱敏腾讯云 SecretId（AKID 开头）', () => {
      const redactor = createDefaultRedactor();
      const input = 'AKIDfakeSecretIdForTestingOnly123';
      const result = redactor.redact(input);
      expect(result).not.toContain('AKIDfakeSecretIdForTestingOnly123');
    });

    it('应脱敏 PEM 私钥块', () => {
      const redactor = createDefaultRedactor();
      const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
      const result = redactor.redact(input);
      expect(result).toContain('PRIVATE KEY REDACTED');
    });
  });

  describe('SecretRedactor - 对象脱敏', () => {
    it('应递归脱敏对象中的字符串', () => {
      const redactor = createDefaultRedactor();
      redactor.registerSecret('my-secret-value-1234567890');
      const obj = {
        a: 'my-secret-value-1234567890',
        b: { c: 'my-secret-value-1234567890' },
        d: ['my-secret-value-1234567890', 'safe'],
      };
      const result = redactor.redactObject(obj) as any;
      expect(result.a).toBe('***REDACTED***');
      expect(result.b.c).toBe('***REDACTED***');
      expect(result.d[0]).toBe('***REDACTED***');
      expect(result.d[1]).toBe('safe');
    });

    it('非字符串应原样返回', () => {
      const redactor = createDefaultRedactor();
      expect(redactor.redactObject(123)).toBe(123);
      expect(redactor.redactObject(true)).toBe(true);
      expect(redactor.redactObject(null)).toBe(null);
    });
  });

  describe('DEFAULT_REDACTION_RULES', () => {
    it('应包含 AWS / Aliyun / Tencent 规则', () => {
      const names = DEFAULT_REDACTION_RULES.map(r => r.name);
      expect(names).toContain('aws-access-key');
      expect(names).toContain('aliyun-access-key');
      expect(names).toContain('tencent-secret-id');
    });

    it('应包含 Bearer Token 与私钥规则', () => {
      const names = DEFAULT_REDACTION_RULES.map(r => r.name);
      expect(names).toContain('bearer-token');
      expect(names).toContain('private-key');
    });
  });
});
