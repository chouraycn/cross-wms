/**
 * modelProviderRegistry 测试
 *
 * 测试模型提供商注册表的核心功能：
 * - 提供商注册和查询
 * - 模型查找和筛选
 * - 思考模式配置
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAllProviders,
  getProviderById,
  registerProvider,
  unregisterProvider,
  getCatalogIndex,
  getThinkingProviders,
  getChineseProviders,
  getLocalProviders,
  getAllModels,
  getModelById,
  getModelsByProvider,
  getRecommendedModels,
  getThinkingModels,
  getThinkingProfile,
  getThinkingLevels,
  getThinkingDefaultLevel,
  getProviderLabel,
  providerNeedsApiKey,
  BUILTIN_PROVIDER_IDS,
} from '../modelProviderRegistry.js';
import type { ProviderInfo, ModelInfo } from '../modelCatalog.js';

describe('modelProviderRegistry', () => {
  describe('提供商注册和查询', () => {
    it('应该返回所有内置提供商', () => {
      const providers = getAllProviders();
      expect(providers.length).toBeGreaterThan(0);

      // 检查关键提供商存在
      const providerIds = providers.map(p => p.id);
      expect(providerIds).toContain('anthropic');
      expect(providerIds).toContain('google');
      expect(providerIds).toContain('deepseek');
      expect(providerIds).toContain('openai');
      expect(providerIds).toContain('ollama');
    });

    it('应该能按 ID 获取提供商', () => {
      const anthropic = getProviderById('anthropic');
      expect(anthropic).toBeDefined();
      expect(anthropic?.name).toBe('Anthropic');
      expect(anthropic?.baseUrl).toBe('https://api.anthropic.com/v1');
      expect(anthropic?.authType).toBe('x-api-key');
    });

    it('应该返回 undefined 对于不存在的提供商', () => {
      const provider = getProviderById('nonexistent');
      expect(provider).toBeUndefined();
    });

    it('应该能动态注册新提供商', () => {
      const customProvider: ProviderInfo = {
        id: 'custom-test' as any,
        name: 'Custom Test Provider',
        baseUrl: 'https://custom.example.com/v1',
        authType: 'bearer',
        models: [
          {
            id: 'custom-model-1',
            name: 'Custom Model 1',
            provider: 'custom',
            contextWindow: 128_000,
            capabilities: ['general'],
          },
        ],
      };

      registerProvider(customProvider);
      const retrieved = getProviderById('custom-test');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Custom Test Provider');

      // 清理
      unregisterProvider('custom-test');
    });
  });

  describe('提供商分类筛选', () => {
    it('应该返回支持思考模式的提供商', () => {
      const thinkingProviders = getThinkingProviders();
      expect(thinkingProviders.length).toBeGreaterThan(0);

      // Anthropic, Google, DeepSeek 应该支持思考模式
      const ids = thinkingProviders.map(p => p.id);
      expect(ids).toContain('anthropic');
      expect(ids).toContain('google');
      expect(ids).toContain('deepseek');
    });

    it('应该返回中国提供商', () => {
      const chineseProviders = getChineseProviders();
      expect(chineseProviders.length).toBeGreaterThan(0);

      const ids = chineseProviders.map(p => p.id);
      expect(ids).toContain('bigmodel');
      expect(ids).toContain('qwen');
    });

    it('应该返回本地提供商', () => {
      const localProviders = getLocalProviders();
      expect(localProviders.length).toBeGreaterThan(0);

      const ids = localProviders.map(p => p.id);
      expect(ids).toContain('ollama');
      expect(localProviders.every(p => p.isLocal)).toBe(true);
    });
  });

  describe('模型查找', () => {
    it('应该返回所有模型列表', () => {
      const models = getAllModels();
      expect(models.length).toBeGreaterThan(50); // 至少 50 个模型

      // 检查关键模型存在
      const modelIds = models.map(m => m.id);
      expect(modelIds).toContain('claude-sonnet-4-20250514');
      expect(modelIds).toContain('gemini-2.5-pro');
      expect(modelIds).toContain('deepseek-v4-pro');
      expect(modelIds).toContain('gpt-4o');
    });

    it('应该能按 ID 获取模型', () => {
      const claude = getModelById('claude-sonnet-4-20250514');
      expect(claude).toBeDefined();
      expect(claude?.name).toBe('Claude Sonnet 4');
      expect(claude?.provider).toBe('anthropic');
      expect(claude?.reasoning).toBe(true);
    });

    it('应该能通过别名查找模型', () => {
      // deepseek-v4 是 deepseek-v4-pro 的别名
      const model = getModelById('deepseek-v4');
      expect(model).toBeDefined();
      expect(model?.id).toBe('deepseek-v4-pro');
    });

    it('应该能获取指定提供商的所有模型', () => {
      const anthropicModels = getModelsByProvider('anthropic');
      expect(anthropicModels.length).toBeGreaterThan(0);
      expect(anthropicModels.every(m => m.provider === 'anthropic')).toBe(true);
    });

    it('应该返回推荐模型列表', () => {
      const recommended = getRecommendedModels();
      expect(recommended.length).toBeGreaterThan(0);
      expect(recommended.every(m => m.isRecommended)).toBe(true);
    });

    it('应该返回支持思考模式的模型', () => {
      const thinkingModels = getThinkingModels();
      expect(thinkingModels.length).toBeGreaterThan(0);
      expect(thinkingModels.every(m => m.thinkingProfile || m.reasoning)).toBe(true);
    });
  });

  describe('思考模式配置', () => {
    it('应该返回 Claude Sonnet 4 的思考模式配置', () => {
      const profile = getThinkingProfile('claude-sonnet-4-20250514');
      expect(profile).toBeDefined();
      expect(profile?.levels.length).toBeGreaterThan(0);
      expect(profile?.defaultLevel).toBe('high');
    });

    it('应该返回思考模式级别列表', () => {
      const levels = getThinkingLevels('claude-sonnet-4-20250514');
      expect(levels).toContain('off');
      expect(levels).toContain('high');
    });

    it('应该返回思考模式默认级别', () => {
      const defaultLevel = getThinkingDefaultLevel('claude-sonnet-4-20250514');
      expect(defaultLevel).toBe('high');
    });

    it('对于不支持思考模式的模型应返回 undefined', () => {
      const profile = getThinkingProfile('gpt-4o-mini');
      expect(profile).toBeUndefined();
    });
  });

  describe('提供商快速查询', () => {
    it('应该返回提供商显示名称', () => {
      expect(getProviderLabel('anthropic')).toBe('Anthropic');
      expect(getProviderLabel('google')).toBe('Google');
      expect(getProviderLabel('deepseek')).toBe('DeepSeek');
      expect(getProviderLabel('bigmodel')).toBe('智谱 AI');
      expect(getProviderLabel('qwen')).toBe('阿里通义');
    });

    it('应该正确判断提供商是否需要 API Key', () => {
      expect(providerNeedsApiKey('anthropic')).toBe(true);
      expect(providerNeedsApiKey('google')).toBe(true);
      expect(providerNeedsApiKey('deepseek')).toBe(true);
      expect(providerNeedsApiKey('ollama')).toBe(false); // 本地提供商
    });
  });

  describe('模型目录索引', () => {
    it('应该返回有效的模型目录索引', () => {
      const catalog = getCatalogIndex();
      expect(catalog.version).toBe(1);
      expect(Object.keys(catalog.providers).length).toBeGreaterThan(0);
      expect(catalog.updatedAt).toBeDefined();
    });

    it('内置提供商 ID 列表应与实际提供商匹配', () => {
      const providers = getAllProviders();
      const ids = providers.map(p => p.id);
      expect(BUILTIN_PROVIDER_IDS.sort()).toEqual(ids.sort());
    });
  });

  describe('模型信息完整性', () => {
    it('Anthropic 模型应包含完整信息', () => {
      const claude = getModelById('claude-sonnet-4-20250514');
      expect(claude).toBeDefined();
      expect(claude?.id).toBeDefined();
      expect(claude?.name).toBeDefined();
      expect(claude?.provider).toBeDefined();
      expect(claude?.contextWindow).toBeGreaterThan(0);
      expect(claude?.capabilities?.length).toBeGreaterThan(0);
      expect(claude?.pricing?.inputPerMillion).toBeDefined();
      expect(claude?.pricing?.outputPerMillion).toBeDefined();
    });

    it('Google 模型应包含多模态输入类型', () => {
      const gemini = getModelById('gemini-2.5-pro');
      expect(gemini).toBeDefined();
      expect(gemini?.input).toContain('text');
      expect(gemini?.input).toContain('image');
      expect(gemini?.input).toContain('audio');
      expect(gemini?.input).toContain('video');
      expect(gemini?.input).toContain('pdf');
    });

    it('DeepSeek 模型应包含思考模式配置', () => {
      const deepseek = getModelById('deepseek-v4-pro');
      expect(deepseek).toBeDefined();
      expect(deepseek?.thinkingProfile).toBeDefined();
      expect(deepseek?.thinkingProfile?.levels.length).toBeGreaterThan(4);
      expect(deepseek?.reasoning).toBe(true);
    });

    it('Ollama 模型应标记为免费', () => {
      const llama = getModelById('llama3.1');
      expect(llama).toBeDefined();
      expect(llama?.pricing?.isFree).toBe(true);
    });

    it('推荐模型应正确标记', () => {
      const recommended = [
        'claude-sonnet-4-20250514',
        'gemini-2.5-flash',
        'deepseek-v4-flash',
        'gpt-4o-mini',
        'o3-mini',
        'kimi-k2.6',
      ];

      for (const modelId of recommended) {
        const model = getModelById(modelId);
        expect(model?.isRecommended).toBe(true);
      }
    });
  });
});