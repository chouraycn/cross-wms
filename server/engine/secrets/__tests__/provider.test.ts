/**
 * Provider 模块测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ProviderRegistry,
  EnvProvider,
  EncryptedProvider,
  KeychainProvider,
  AliyunKmsProvider,
  TencentKmsProvider,
  createDefaultProviderRegistry,
  registerKmsAdapter,
  clearKmsAdapters,
} from '../provider.js';
import type { KmsAdapter } from '../provider.js';

describe('Provider 模块', () => {
  describe('EnvProvider', () => {
    it('应从自定义 env 读取值', () => {
      const provider = new EnvProvider({ env: { MY_KEY: 'my-value' } });
      expect(provider.resolve({ provider: 'env', key: 'MY_KEY' })).toBe('my-value');
    });

    it('未定义变量应返回 null', () => {
      const provider = new EnvProvider({ env: {} });
      expect(provider.resolve({ provider: 'env', key: 'UNDEFINED' })).toBeNull();
    });

    it('validate 应返回布尔值', () => {
      const provider = new EnvProvider({ env: { EXISTING: 'x' } });
      expect(provider.validate({ provider: 'env', key: 'EXISTING' })).toBe(true);
      expect(provider.validate({ provider: 'env', key: 'MISSING' })).toBe(false);
    });

    it('异步解析应与同步一致', async () => {
      const provider = new EnvProvider({ env: { KEY: 'value' } });
      const sync = provider.resolve({ provider: 'env', key: 'KEY' });
      const async = await provider.resolveAsync({ provider: 'env', key: 'KEY' });
      expect(sync).toBe(async);
    });
  });

  describe('EncryptedProvider', () => {
    it('应通过 getValue 回调获取值', () => {
      const provider = new EncryptedProvider((key: string) => key === 'my-key' ? 'decrypted' : null);
      expect(provider.resolve({ provider: 'encrypted', key: 'my-key' })).toBe('decrypted');
    });

    it('未找到的 key 应返回 null', () => {
      const provider = new EncryptedProvider(() => null);
      expect(provider.resolve({ provider: 'encrypted', key: 'missing' })).toBeNull();
    });
  });

  describe('KeychainProvider', () => {
    it('应回退到 EncryptedProvider', () => {
      const provider = new KeychainProvider((key: string) => key === 'kc-key' ? 'kc-value' : null);
      expect(provider.resolve({ provider: 'keychain', key: 'kc-key' })).toBe('kc-value');
    });
  });

  describe('ProviderRegistry', () => {
    it('register 后应能 get', () => {
      const registry = new ProviderRegistry();
      const provider = new EnvProvider({ env: { X: '1' } });
      registry.register(provider);
      expect(registry.get('env')).toBe(provider);
    });

    it('未注册的 type 应 get 返回 undefined', () => {
      const registry = new ProviderRegistry();
      expect(registry.get('file')).toBeUndefined();
    });

    it('has 应返回是否注册', () => {
      const registry = new ProviderRegistry();
      registry.register(new EnvProvider({ env: {} }));
      expect(registry.has('env')).toBe(true);
      expect(registry.has('file')).toBe(false);
    });

    it('list 应返回所有已注册 type', () => {
      const registry = new ProviderRegistry();
      registry.register(new EnvProvider({ env: {} }));
      expect(registry.list()).toEqual(['env']);
    });
  });

  describe('createDefaultProviderRegistry', () => {
    it('应注册 env 与 file provider', () => {
      const registry = createDefaultProviderRegistry();
      expect(registry.has('env')).toBe(true);
      expect(registry.has('file')).toBe(true);
    });

    it('传入 encryptedGetValue 时应注册 encrypted 与 keychain', () => {
      const registry = createDefaultProviderRegistry(() => 'value');
      expect(registry.has('encrypted')).toBe(true);
      expect(registry.has('keychain')).toBe(true);
    });
  });

  describe('KMS Provider（国内适配）', () => {
    beforeEach(() => {
      clearKmsAdapters();
    });

    afterEach(() => {
      clearKmsAdapters();
    });

    it('AliyunKmsProvider 未注册 adapter 时同步返回 null', () => {
      const provider = new AliyunKmsProvider();
      expect(provider.resolve({ provider: 'aliyun-kms', key: 'cipher' })).toBeNull();
    });

    it('AliyunKmsProvider 注册 adapter 后异步应能解密', async () => {
      const mockAdapter: KmsAdapter = {
        decrypt: async (ct: string) => `decrypted:${ct}`,
        encrypt: async (pt: string) => `encrypted:${pt}`,
      };
      registerKmsAdapter('aliyun-kms', mockAdapter);
      const provider = new AliyunKmsProvider({ keyId: 'test-key' });
      const result = await provider.resolveAsync({ provider: 'aliyun-kms', key: 'cipher-text' });
      expect(result).toBe('decrypted:cipher-text');
    });

    it('TencentKmsProvider 注册 adapter 后异步应能解密', async () => {
      const mockAdapter: KmsAdapter = {
        decrypt: async (ct: string) => `tencent-decrypted:${ct}`,
        encrypt: async (pt: string) => `tencent-encrypted:${pt}`,
      };
      registerKmsAdapter('tencent-kms', mockAdapter);
      const provider = new TencentKmsProvider({ keyId: 'test-key' });
      const result = await provider.resolveAsync({ provider: 'tencent-kms', key: 'cipher' });
      expect(result).toBe('tencent-decrypted:cipher');
    });

    it('registerKmsAdapter 仅支持 aliyun-kms / tencent-kms', () => {
      expect(() => registerKmsAdapter('env' as any, {} as KmsAdapter)).toThrow();
    });

    it('validate 在未注册 adapter 时应返回 false', () => {
      const provider = new AliyunKmsProvider();
      expect(provider.validate({ provider: 'aliyun-kms', key: 'x' })).toBe(false);
    });
  });
});
