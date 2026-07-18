import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// 由于 vitest 的模块解析问题，直接导入编译后的文件
// @ts-ignore
const providerDist = require('../../dist/provider.js');
const {
  detectProvider,
  detectProviderByModelId,
  detectProviderByEndpoint,
  CHINESE_PROVIDERS,
} = providerDist;

import type { ModelCatalogSource } from '../types';

describe('预设模型测试', () => {
  // 读取预设模型文件
  const presetModelsPath = path.join(__dirname, '../data/preset-models.json');
  let presetModels: ModelCatalogSource;

  beforeAll(() => {
    const content = fs.readFileSync(presetModelsPath, 'utf-8');
    presetModels = JSON.parse(content);
  });

  describe('preset-models.json 格式验证', () => {
    it('应该有有效的结构', () => {
      expect(presetModels.id).toBe('chinese-models');
      expect(presetModels.name).toBe('国内大模型预设');
      expect(presetModels.models).toBeDefined();
      expect(Array.isArray(presetModels.models)).toBe(true);
    });

    it('所有模型应该有必需字段', () => {
      for (const model of presetModels.models) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.kind).toBe('llm');
        expect(model.provider).toBeDefined();
        expect(model.providerModelId).toBeDefined();
        expect(model.capabilities).toBeDefined();
        expect(Array.isArray(model.capabilities)).toBe(true);
        expect(model.contextWindow).toBeDefined();
        expect(model.contextWindow.maxTokens).toBeGreaterThan(0);
      }
    });

    it('所有模型应该有定价信息（CNY）', () => {
      for (const model of presetModels.models) {
        expect(model.pricing).toBeDefined();
        expect(model.pricing.currency).toBe('CNY');
        // 至少要有 input 或 output 价格
        expect(
          model.pricing.inputPerToken !== undefined || model.pricing.outputPerToken !== undefined,
        ).toBe(true);
      }
    });
  });

  describe('Provider 检测测试', () => {
    it('应该从模型 ID 正确检测 Provider', () => {
      const testCases = [
        { modelId: 'deepseek-chat', expectedProvider: 'deepseek' },
        { modelId: 'deepseek-reasoner', expectedProvider: 'deepseek' },
        { modelId: 'qwen-turbo', expectedProvider: 'alibaba' },
        { modelId: 'qwen-max', expectedProvider: 'alibaba' },
        { modelId: 'moonshot-v1-8k', expectedProvider: 'kimi' },
        { modelId: 'kimi-v1-32k', expectedProvider: 'kimi' },
        { modelId: 'step-1-8k', expectedProvider: 'stepfun' },
        { modelId: 'step-1v-8k', expectedProvider: 'stepfun' },
        { modelId: 'doubao-pro-4k', expectedProvider: 'doubao' },
        { modelId: 'yi-large', expectedProvider: 'yi' },
        { modelId: 'yi-spark', expectedProvider: 'yi' },
        { modelId: 'Baichuan4', expectedProvider: 'baichuan' },
        { modelId: 'Baichuan3-Turbo', expectedProvider: 'baichuan' },
        { modelId: 'abab6.5-chat', expectedProvider: 'minimax' },
        { modelId: 'abab6.5s-chat', expectedProvider: 'minimax' },
      ];

      for (const { modelId, expectedProvider } of testCases) {
        const provider = detectProviderByModelId(modelId);
        expect(provider).not.toBeNull();
        expect(provider?.id).toBe(expectedProvider);
      }
    });

    it('应该从 API Endpoint 正确检测 Provider', () => {
      const testCases = [
        { endpoint: 'https://api.deepseek.com/v1/chat/completions', expectedProvider: 'deepseek' },
        {
          endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
          expectedProvider: 'alibaba',
        },
        { endpoint: 'https://api.moonshot.cn/v1/chat/completions', expectedProvider: 'kimi' },
        { endpoint: 'https://api.stepfun.com/v1/chat/completions', expectedProvider: 'stepfun' },
        {
          endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
          expectedProvider: 'doubao',
        },
        { endpoint: 'https://api.lingyiwanwu.com/v1/chat/completions', expectedProvider: 'yi' },
        { endpoint: 'https://api.baichuan-ai.com/v1/chat/completions', expectedProvider: 'baichuan' },
        { endpoint: 'https://api.minimax.chat/v1/text/chat', expectedProvider: 'minimax' },
      ];

      for (const { endpoint, expectedProvider } of testCases) {
        const provider = detectProviderByEndpoint(endpoint);
        expect(provider).not.toBeNull();
        expect(provider?.id).toBe(expectedProvider);
      }
    });

    it('应该综合检测 Provider（优先使用 endpoint）', () => {
      const provider = detectProvider(
        'some-model',
        'https://api.deepseek.com/v1/chat/completions',
      );
      expect(provider?.id).toBe('deepseek');
    });

    it('未知模型应该返回 null', () => {
      const provider = detectProviderByModelId('unknown-model-xyz');
      expect(provider).toBeNull();
    });
  });

  describe('CHINESE_PROVIDERS 配置验证', () => {
    it('应该包含所有必需的 Provider', () => {
      const expectedProviders = [
        'deepseek',
        'alibaba',
        'kimi',
        'stepfun',
        'doubao',
        'yi',
        'baichuan',
        'minimax',
      ];

      for (const providerId of expectedProviders) {
        expect(CHINESE_PROVIDERS[providerId]).toBeDefined();
        expect(CHINESE_PROVIDERS[providerId].id).toBe(providerId);
        expect(CHINESE_PROVIDERS[providerId].name).toBeDefined();
        expect(CHINESE_PROVIDERS[providerId].baseUrl).toBeDefined();
        expect(CHINESE_PROVIDERS[providerId].apiKeyEnv).toBeDefined();
        expect(CHINESE_PROVIDERS[providerId].capabilities).toBeDefined();
        expect(Array.isArray(CHINESE_PROVIDERS[providerId].capabilities)).toBe(true);
      }
    });

    it('Provider baseUrl 应该是有效的 URL', () => {
      for (const providerId of Object.keys(CHINESE_PROVIDERS)) {
        const provider = CHINESE_PROVIDERS[providerId];
        expect(() => new URL(provider.baseUrl)).not.toThrow();
      }
    });
  });

  describe('模型与 Provider 匹配验证', () => {
    it('所有模型的 Provider 都应该可识别', () => {
      const providerIds = new Set(Object.keys(CHINESE_PROVIDERS));

      for (const model of presetModels.models) {
        expect(providerIds.has(model.provider)).toBe(true);
      }
    });

    it('每个 Provider 至少应该有一个模型', () => {
      const providerModelCounts: Record<string, number> = {};

      for (const model of presetModels.models) {
        providerModelCounts[model.provider] = (providerModelCounts[model.provider] || 0) + 1;
      }

      for (const providerId of Object.keys(CHINESE_PROVIDERS)) {
        expect(providerModelCounts[providerId]).toBeGreaterThan(0);
      }
    });
  });
});