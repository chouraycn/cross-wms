/**
 * 验证器模块测试
 */

import { describe, it, expect } from 'vitest';
import {
  validateSecretRef,
  validateSecretValue,
  validateKey,
  assessStrength,
  isExpired,
  isExpiringSoon,
} from '../validator.js';

describe('验证器模块', () => {
  describe('validateSecretRef', () => {
    it('合法 ref 应通过校验', () => {
      const result = validateSecretRef({ provider: 'env', key: 'API_KEY' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('不支持的 provider 应失败', () => {
      const result = validateSecretRef({ provider: 'invalid' as any, key: 'KEY' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('空 key 应失败', () => {
      const result = validateSecretRef({ provider: 'env', key: '' });
      expect(result.valid).toBe(false);
    });

    it('env provider 的 key 应符合大写下划线格式', () => {
      const ok = validateSecretRef({ provider: 'env', key: 'MY_API_KEY' });
      expect(ok.valid).toBe(true);
      const bad = validateSecretRef({ provider: 'env', key: 'my-api-key' });
      expect(bad.valid).toBe(false);
    });

    it('支持 aliyun-kms 与 tencent-kms provider', () => {
      expect(validateSecretRef({ provider: 'aliyun-kms', key: 'my-key' }).valid).toBe(true);
      expect(validateSecretRef({ provider: 'tencent-kms', key: 'my-key' }).valid).toBe(true);
    });
  });

  describe('validateKey', () => {
    it('合法 key 应通过', () => {
      expect(validateKey('my-api-key', 'encrypted').valid).toBe(true);
    });

    it('空 key 应失败', () => {
      expect(validateKey('', 'encrypted').valid).toBe(false);
    });

    it('env provider 的 key 应符合格式', () => {
      expect(validateKey('VALID_KEY', 'env').valid).toBe(true);
      expect(validateKey('invalid-key', 'env').valid).toBe(false);
    });

    it('禁止路径遍历（非 file provider）', () => {
      expect(validateKey('../etc/passwd', 'encrypted').valid).toBe(false);
      expect(validateKey('../etc/passwd', 'file').valid).toBe(true);
    });
  });

  describe('validateSecretValue', () => {
    it('api_key 类型长度应至少 8 字符', () => {
      expect(validateSecretValue('short', 'api_key').valid).toBe(false);
      expect(validateSecretValue('longenoughkey', 'api_key').valid).toBe(true);
    });

    it('token 类型长度应至少 16 字符', () => {
      expect(validateSecretValue('short', 'token').valid).toBe(false);
      expect(validateSecretValue('verylongtokenvalue123', 'token').valid).toBe(true);
    });

    it('certificate 应包含 PEM 头', () => {
      expect(validateSecretValue('no-pem-here', 'certificate').valid).toBe(false);
      expect(validateSecretValue('-----BEGIN CERTIFICATE-----\nMII...', 'certificate').valid).toBe(true);
    });

    it('ssh_key 应以 ssh- 或 ecdsa- 开头', () => {
      expect(validateSecretValue('not-a-key', 'ssh_key').valid).toBe(false);
      expect(validateSecretValue('ssh-rsa AAAAB3NzaC1...', 'ssh_key').valid).toBe(true);
    });
  });

  describe('assessStrength', () => {
    it('空值强度为 0', () => {
      const result = assessStrength('');
      expect(result.score).toBe(0);
      expect(result.level).toBe('weak');
    });

    it('短密码强度弱', () => {
      const result = assessStrength('abc');
      expect(result.score).toBeLessThan(40);
      expect(result.level).toBe('weak');
    });

    it('长随机字符串强度高', () => {
      const result = assessStrength('xY9!aB2#cD7$eF4%gH5^');
      expect(result.score).toBeGreaterThanOrEqual(60);
    });

    it('应返回 issues 数组', () => {
      const result = assessStrength('weak');
      expect(Array.isArray(result.issues)).toBe(true);
    });
  });

  describe('isExpired / isExpiringSoon', () => {
    it('无 expiresAt 应视为未过期', () => {
      expect(isExpired(undefined)).toBe(false);
      expect(isExpired(null as any)).toBe(false);
    });

    it('过期时间已过应返回 true', () => {
      const past = Date.now() - 1000;
      expect(isExpired(past)).toBe(true);
    });

    it('过期时间未到应返回 false', () => {
      const future = Date.now() + 10000;
      expect(isExpired(future)).toBe(false);
    });

    it('isExpiringSoon 在阈值内应返回 true', () => {
      const soon = Date.now() + 1000; // 1 秒后过期
      expect(isExpiringSoon(soon, 5000)).toBe(true);
    });

    it('isExpiringSoon 超出阈值应返回 false', () => {
      const far = Date.now() + 100000;
      expect(isExpiringSoon(far, 1000)).toBe(false);
    });

    it('isExpiringSoon 已过期的应返回 false', () => {
      const past = Date.now() - 1000;
      expect(isExpiringSoon(past, 5000)).toBe(false);
    });
  });
});
