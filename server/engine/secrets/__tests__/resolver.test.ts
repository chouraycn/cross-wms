/**
 * 解析器模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProviderRegistry,
  EnvProvider,
  EncryptedProvider,
} from '../provider.js';
import {
  resolveSecretRef,
  resolveSecretRefAsync,
  resolveSecretRefs,
  resolveWithFallback,
  resolveTemplate,
  extractSecretRefs,
  isTemplate,
  validateSecretRef as validateSecretRefViaProvider,
} from '../resolver.js';
import type { SecretRef } from '../types.js';

describe('解析器模块', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.register(new EnvProvider({ env: { API_KEY: 'env-api-key-123', TOKEN: 'env-token-456' } }));
    registry.register(new EncryptedProvider((key: string) => {
      if (key === 'encrypted-key') return 'decrypted-value';
      return null;
    }));
  });

  describe('resolveSecretRef', () => {
    it('应能解析 env provider', () => {
      const ref: SecretRef = { provider: 'env', key: 'API_KEY' };
      const result = resolveSecretRef(ref, registry);
      expect(result).not.toBeNull();
      expect(result?.value).toBe('env-api-key-123');
      expect(result?.source).toBe('env');
    });

    it('未定义的环境变量应返回 null', () => {
      const ref: SecretRef = { provider: 'env', key: 'UNDEFINED_VAR' };
      const result = resolveSecretRef(ref, registry);
      expect(result).toBeNull();
    });

    it('未注册的 provider 应返回 null', () => {
      const ref: SecretRef = { provider: 'file', key: 'some-key' };
      const result = resolveSecretRef(ref, registry);
      expect(result).toBeNull();
    });

    it('应能解析 encrypted provider', () => {
      const ref: SecretRef = { provider: 'encrypted', key: 'encrypted-key' };
      const result = resolveSecretRef(ref, registry);
      expect(result?.value).toBe('decrypted-value');
    });
  });

  describe('resolveSecretRefAsync', () => {
    it('应异步解析 env provider', async () => {
      const ref: SecretRef = { provider: 'env', key: 'API_KEY' };
      const result = await resolveSecretRefAsync(ref, registry);
      expect(result?.value).toBe('env-api-key-123');
    });
  });

  describe('resolveSecretRefs（批量）', () => {
    it('应批量解析多个引用', () => {
      const refs: SecretRef[] = [
        { provider: 'env', key: 'API_KEY' },
        { provider: 'env', key: 'TOKEN' },
        { provider: 'env', key: 'UNDEFINED' },
      ];
      const results = resolveSecretRefs(refs, registry);
      expect(results.size).toBe(3);
      expect(results.get('env:API_KEY')?.value).toBe('env-api-key-123');
      expect(results.get('env:TOKEN')?.value).toBe('env-token-456');
      expect(results.get('env:UNDEFINED')).toBeNull();
    });
  });

  describe('resolveWithFallback', () => {
    it('应返回首个可用的值', () => {
      const refs: SecretRef[] = [
        { provider: 'env', key: 'UNDEFINED_1' },
        { provider: 'env', key: 'API_KEY' },
        { provider: 'env', key: 'TOKEN' },
      ];
      const result = resolveWithFallback(refs, registry);
      expect(result?.value).toBe('env-api-key-123');
    });

    it('所有 ref 都失败应返回 null', () => {
      const refs: SecretRef[] = [
        { provider: 'env', key: 'UNDEFINED_1' },
        { provider: 'env', key: 'UNDEFINED_2' },
      ];
      const result = resolveWithFallback(refs, registry);
      expect(result).toBeNull();
    });

    it('空数组应返回 null', () => {
      const result = resolveWithFallback([], registry);
      expect(result).toBeNull();
    });
  });

  describe('resolveTemplate', () => {
    it('应替换模板中的密钥占位符', () => {
      const template = 'Authorization: Bearer ${secret:env:API_KEY}';
      const result = resolveTemplate(template, registry);
      expect(result).toBe('Authorization: Bearer env-api-key-123');
    });

    it('应替换多个占位符', () => {
      const template = 'api=${secret:env:API_KEY}, token=${secret:env:TOKEN}';
      const result = resolveTemplate(template, registry);
      expect(result).toBe('api=env-api-key-123, token=env-token-456');
    });

    it('无占位符的字符串应原样返回', () => {
      const template = 'no placeholders here';
      const result = resolveTemplate(template, registry);
      expect(result).toBe('no placeholders here');
    });

    it('未找到的占位符应保留原样', () => {
      const template = 'value=${secret:env:UNDEFINED}';
      const result = resolveTemplate(template, registry);
      expect(result).toBe('value=${secret:env:UNDEFINED}');
    });
  });

  describe('extractSecretRefs', () => {
    it('应从模板中提取引用', () => {
      const template = '${secret:env:API_KEY} and ${secret:env:TOKEN}';
      const refs = extractSecretRefs(template);
      expect(refs).toHaveLength(2);
      expect(refs[0].provider).toBe('env');
      expect(refs[0].key).toBe('API_KEY');
      expect(refs[1].key).toBe('TOKEN');
    });

    it('无占位符应返回空数组', () => {
      expect(extractSecretRefs('no placeholders')).toEqual([]);
    });
  });

  describe('isTemplate', () => {
    it('含占位符应返回 true', () => {
      expect(isTemplate('${secret:env:KEY}')).toBe(true);
    });

    it('不含占位符应返回 false', () => {
      expect(isTemplate('plain string')).toBe(false);
    });
  });

  describe('validateSecretRef（通过 Provider）', () => {
    it('已注册 provider 且存在的 ref 应通过', () => {
      expect(validateSecretRefViaProvider({ provider: 'env', key: 'API_KEY' }, registry)).toBe(true);
    });

    it('不存在的 key 应不通过', () => {
      expect(validateSecretRefViaProvider({ provider: 'env', key: 'UNDEFINED' }, registry)).toBe(false);
    });
  });
});
