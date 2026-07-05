/**
 * modelConfigSchema 单元测试
 *
 * 测试模型配置 Zod Schema 的验证逻辑
 */

import { describe, it, expect } from 'vitest';
import {
  validateModelConfig,
  validateProviderConfig,
  validateModelsFile,
  formatZodErrors,
} from '../modelConfigSchema.js';
import type { ModelConfig, ProviderConfig } from '../../shared/types/models.js';

describe('modelConfigSchema', () => {
  // ==================== ModelConfig 验证 ====================
  describe('validateModelConfig', () => {
    it('应通过有效的模型配置', () => {
      const config: ModelConfig = {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        enabled: true,
        apiEndpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-test-123',
        contextWindow: 128000,
        maxTokens: 4096,
        temperature: 1,
        topP: 1,
      };

      const result = validateModelConfig(config);
      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('必填字段缺失应失败', () => {
      const config = {
        // 缺少 id
        name: 'Test',
        provider: 'openai',
        enabled: true,
      };

      const result = validateModelConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.path.includes('id'))).toBe(true);
    });

    it('contextWindow 必须为正数', () => {
      const config: ModelConfig = {
        id: 'test-model',
        name: 'Test Model',
        provider: 'openai',
        enabled: true,
        contextWindow: -100,
      };

      const result = validateModelConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.path.includes('contextWindow'))).toBe(true);
    });

    it('maxTokens 必须为正数', () => {
      const config: ModelConfig = {
        id: 'test-model',
        name: 'Test Model',
        provider: 'openai',
        enabled: true,
        maxTokens: 0,
      };

      const result = validateModelConfig(config);
      expect(result.valid).toBe(false);
    });

    it('temperature 应在 0-2 范围内', () => {
      const validConfig: ModelConfig = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        enabled: true,
        temperature: 1.5,
      };
      expect(validateModelConfig(validConfig).valid).toBe(true);

      const invalidConfig: ModelConfig = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        enabled: true,
        temperature: 3,
      };
      expect(validateModelConfig(invalidConfig).valid).toBe(false);
    });

    it('apiType 应是有效的枚举值', () => {
      const validConfig: ModelConfig = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        enabled: true,
        apiType: 'anthropic-messages',
      };
      expect(validateModelConfig(validConfig).valid).toBe(true);

      const invalidConfig = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        enabled: true,
        apiType: 'invalid-type',
      };
      expect(validateModelConfig(invalidConfig).valid).toBe(false);
    });

    it('authMode 应是有效的枚举值', () => {
      const validConfig: ModelConfig = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        enabled: true,
        authMode: 'aws-sdk',
      };
      expect(validateModelConfig(validConfig).valid).toBe(true);
    });

    it('compatConfig 应通过验证', () => {
      const config: ModelConfig = {
        id: 'test',
        name: 'Test',
        provider: 'anthropic',
        enabled: true,
        compatConfig: {
          supportsStreaming: true,
          supportsToolCalls: true,
          supportsReasoning: true,
          supportsSystemMessage: false,
          systemMessageFallback: 'merge-to-first-user',
          thinking: {
            useBudget: true,
            budgetRatio: 0.3,
          },
        },
      };

      const result = validateModelConfig(config);
      expect(result.valid).toBe(true);
    });

    it('mediaInputConfig 应通过验证', () => {
      const config: ModelConfig = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        enabled: true,
        mediaInputConfig: {
          supportedInputs: ['text', 'image'],
          image: {
            maxFileSize: 10 * 1024 * 1024,
            maxPixels: 2000000,
            formats: ['image/jpeg', 'image/png'],
            supportsDetail: true,
            detailLevels: ['auto', 'low', 'high'],
          },
        },
      };

      const result = validateModelConfig(config);
      expect(result.valid).toBe(true);
    });

    it('严格模式应拒绝额外字段', () => {
      const config = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        enabled: true,
        unknownField: 'should be rejected',
      };

      const result = validateModelConfig(config);
      expect(result.valid).toBe(false);
    });

    it('capabilities 应是有效的枚举数组', () => {
      const config: ModelConfig = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        enabled: true,
        capabilities: ['code', 'reasoning', 'multimodal'],
      };
      expect(validateModelConfig(config).valid).toBe(true);
    });

    it('thinkingLevels 应是字符串数组', () => {
      const config: ModelConfig = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        enabled: true,
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinkingLevel: 'medium',
      };
      expect(validateModelConfig(config).valid).toBe(true);
    });

    it('localService 配置应通过验证', () => {
      const config: ModelConfig = {
        id: 'test',
        name: 'Test',
        provider: 'ollama',
        enabled: true,
        localService: {
          command: 'ollama serve',
          args: ['--port', '11434'],
          healthUrl: 'http://localhost:11434/api/tags',
          readyTimeoutMs: 60000,
          idleStopMs: 300000,
        },
      };
      expect(validateModelConfig(config).valid).toBe(true);
    });
  });

  // ==================== ProviderConfig 验证 ====================
  describe('validateProviderConfig', () => {
    it('应通过有效的 Provider 配置', () => {
      const config: ProviderConfig = {
        id: 'openai-provider',
        name: 'OpenAI',
        provider: 'openai',
        apiEndpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        authMode: 'api-key',
        enabled: true,
      };

      const result = validateProviderConfig(config);
      expect(result.valid).toBe(true);
    });

    it('必填字段缺失应失败', () => {
      const config = {
        name: 'Test',
        provider: 'openai',
      };

      const result = validateProviderConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.path.includes('id'))).toBe(true);
    });

    it('应支持 compatConfig 和 mediaInputConfig', () => {
      const config: ProviderConfig = {
        id: 'test-provider',
        name: 'Test Provider',
        provider: 'custom',
        apiType: 'openai-chat',
        compatConfig: {
          supportsStreaming: true,
        },
        mediaInputConfig: {
          supportedInputs: ['text'],
        },
      };

      const result = validateProviderConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  // ==================== ModelsFile 验证 ====================
  describe('validateModelsFile', () => {
    it('应通过有效的模型文件', () => {
      const file = {
        version: 1,
        models: [
          {
            id: 'gpt-4o',
            name: 'GPT-4o',
            provider: 'openai',
            enabled: true,
          },
        ],
        defaultModelId: 'gpt-4o',
        updatedAt: new Date().toISOString(),
      };

      const result = validateModelsFile(file);
      expect(result.valid).toBe(true);
    });

    it('缺少 defaultModelId 应失败', () => {
      const file = {
        version: 1,
        models: [],
        updatedAt: new Date().toISOString(),
      };

      const result = validateModelsFile(file);
      expect(result.valid).toBe(false);
    });
  });

  // ==================== formatZodErrors ====================
  describe('formatZodErrors', () => {
    it('应格式化错误为人类可读字符串', () => {
      const config = {
        // 缺少必要字段
        name: 'Test',
      };

      const result = validateModelConfig(config);
      expect(result.valid).toBe(false);

      const formatted = formatZodErrors(result.errors!);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
      expect(formatted).toContain('[');
    });
  });
});
