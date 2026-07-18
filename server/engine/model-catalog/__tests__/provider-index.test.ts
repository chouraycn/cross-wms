import { describe, expect, it } from 'vitest';
import { normalizeProviderIndex } from '../provider-index/normalize';
import { loadProviderIndex } from '../provider-index/load';
import type { ProviderIndex } from '../provider-index/types';

describe('provider-index', () => {
  describe('normalizeProviderIndex', () => {
    it('应该返回 undefined 对于空输入', () => {
      expect(normalizeProviderIndex(null)).toBeUndefined();
      expect(normalizeProviderIndex(undefined)).toBeUndefined();
      expect(normalizeProviderIndex('')).toBeUndefined();
    });

    it('应该返回 undefined 当版本不匹配时', () => {
      const result = normalizeProviderIndex({ version: 2, providers: {} });
      expect(result).toBeUndefined();
    });

    it('应该返回 undefined 当 providers 不是对象时', () => {
      const result = normalizeProviderIndex({ version: 1, providers: 'not-an-object' });
      expect(result).toBeUndefined();
    });

    it('应该规范化有效的 provider 索引', () => {
      const input = {
        version: 1,
        providers: {
          'test-provider': {
            id: 'test-provider',
            name: 'Test Provider',
            plugin: {
              id: 'test-plugin',
              package: '@test/provider',
            },
          },
        },
      };
      const result = normalizeProviderIndex(input);
      expect(result).toBeDefined();
      expect(result?.version).toBe(1);
      expect(result?.providers['test-provider']).toBeDefined();
      expect(result?.providers['test-provider']?.name).toBe('Test Provider');
    });

    it('应该跳过无效的 provider 条目', () => {
      const input = {
        version: 1,
        providers: {
          valid: {
            id: 'valid',
            name: 'Valid Provider',
            plugin: { id: 'valid-plugin' },
          },
          invalid: {
            id: 'invalid',
            name: '',
            plugin: { id: 'invalid-plugin' },
          },
        },
      };
      const result = normalizeProviderIndex(input);
      expect(result).toBeDefined();
      expect(Object.keys(result?.providers ?? {})).toEqual(['valid']);
    });

    it('应该跳过没有 plugin 的 provider', () => {
      const input = {
        version: 1,
        providers: {
          'no-plugin': {
            id: 'no-plugin',
            name: 'No Plugin',
          },
        },
      };
      const result = normalizeProviderIndex(input);
      expect(result).toBeDefined();
      expect(Object.keys(result?.providers ?? {})).toHaveLength(0);
    });

    it('应该按字母顺序排序 provider', () => {
      const input = {
        version: 1,
        providers: {
          'z-provider': {
            id: 'z-provider',
            name: 'Z Provider',
            plugin: { id: 'z-plugin' },
          },
          'a-provider': {
            id: 'a-provider',
            name: 'A Provider',
            plugin: { id: 'a-plugin' },
          },
        },
      };
      const result = normalizeProviderIndex(input);
      expect(result).toBeDefined();
      const keys = Object.keys(result?.providers ?? {});
      expect(keys).toEqual(['a-provider', 'z-provider']);
    });

    it('应该规范化 preview catalog 模型', () => {
      const input = {
        version: 1,
        providers: {
          test: {
            id: 'test',
            name: 'Test',
            plugin: { id: 'test-plugin' },
            previewCatalog: {
              models: [
                { id: 'model-1', name: 'Model 1', contextWindow: 128000 },
                { id: 'model-2', name: 'Model 2' },
              ],
            },
          },
        },
      };
      const result = normalizeProviderIndex(input);
      const provider = result?.providers['test'];
      expect(provider?.previewCatalog).toBeDefined();
      expect(provider?.previewCatalog?.models).toHaveLength(2);
      expect(provider?.previewCatalog?.models[0]?.status).toBe('preview');
    });

    it('应该跳过无效的模型条目', () => {
      const input = {
        version: 1,
        providers: {
          test: {
            id: 'test',
            name: 'Test',
            plugin: { id: 'test-plugin' },
            previewCatalog: {
              models: [
                { id: 'valid-model', name: 'Valid Model' },
                { id: '', name: 'Invalid Model' },
              ],
            },
          },
        },
      };
      const result = normalizeProviderIndex(input);
      const provider = result?.providers['test'];
      expect(provider?.previewCatalog?.models).toHaveLength(1);
    });

    it('应该规范化 auth choices', () => {
      const input = {
        version: 1,
        providers: {
          test: {
            id: 'test',
            name: 'Test Provider',
            plugin: { id: 'test-plugin' },
            authChoices: [
              {
                method: 'api-key',
                choiceId: 'env-var',
                choiceLabel: 'Environment Variable',
              },
            ],
          },
        },
      };
      const result = normalizeProviderIndex(input);
      const provider = result?.providers['test'];
      expect(provider?.authChoices).toBeDefined();
      expect(provider?.authChoices).toHaveLength(1);
      expect(provider?.authChoices?.[0]?.method).toBe('api-key');
    });

    it('应该跳过无效的 auth choices', () => {
      const input = {
        version: 1,
        providers: {
          test: {
            id: 'test',
            name: 'Test',
            plugin: { id: 'test-plugin' },
            authChoices: [
              { method: '', choiceId: '', choiceLabel: '' },
            ],
          },
        },
      };
      const result = normalizeProviderIndex(input);
      const provider = result?.providers['test'];
      expect(provider?.authChoices).toBeUndefined();
    });

    it('应该规范化 categories', () => {
      const input = {
        version: 1,
        providers: {
          test: {
            id: 'test',
            name: 'Test',
            plugin: { id: 'test-plugin' },
            categories: [' chat ', 'vision', 'chat'],
          },
        },
      };
      const result = normalizeProviderIndex(input);
      const provider = result?.providers['test'];
      expect(provider?.categories).toEqual(['chat', 'vision']);
    });
  });

  describe('loadProviderIndex', () => {
    it('应该加载默认的内置索引', () => {
      const index = loadProviderIndex();
      expect(index).toBeDefined();
      expect(index.version).toBe(1);
      expect(Object.keys(index.providers).length).toBeGreaterThan(0);
    });

    it('应该包含已知的内置 providers', () => {
      const index = loadProviderIndex();
      expect(index.providers['anthropic']).toBeDefined();
      expect(index.providers['openai']).toBeDefined();
      expect(index.providers['deepseek']).toBeDefined();
      expect(index.providers['google']).toBeDefined();
    });

    it('当输入无效时应该回退到空索引', () => {
      const index = loadProviderIndex(null);
      expect(index).toBeDefined();
      expect(index.version).toBe(1);
      expect(Object.keys(index.providers)).toHaveLength(0);
    });

    it('应该加载自定义索引', () => {
      const customIndex = {
        version: 1,
        providers: {
          custom: {
            id: 'custom',
            name: 'Custom Provider',
            plugin: { id: 'custom-plugin' },
          },
        },
      };
      const index = loadProviderIndex(customIndex);
      expect(index.providers['custom']).toBeDefined();
      expect(Object.keys(index.providers)).toHaveLength(1);
    });
  });
});
