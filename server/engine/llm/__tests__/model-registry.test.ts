import { describe, it, expect, beforeEach } from 'vitest';
import { LlmModelRegistry } from '../model-registry.js';

describe('LlmModelRegistry', () => {
  let registry: LlmModelRegistry;

  beforeEach(() => {
    registry = new LlmModelRegistry();
  });

  describe('getAll', () => {
    it('应返回所有内置模型', () => {
      const models = registry.getAll();
      expect(models.length).toBeGreaterThan(10);
    });

    it('应包含 OpenAI 模型', () => {
      const models = registry.getAll();
      const openaiModels = models.filter((m) => m.provider === 'openai');
      expect(openaiModels.length).toBeGreaterThan(0);
      expect(openaiModels.some((m) => m.id === 'gpt-4o')).toBe(true);
    });

    it('应包含 Anthropic 模型', () => {
      const models = registry.getAll();
      const anthropicModels = models.filter((m) => m.provider === 'anthropic');
      expect(anthropicModels.length).toBeGreaterThan(0);
      expect(anthropicModels.some((m) => m.id === 'claude-3-5-sonnet')).toBe(true);
    });

    it('应包含 Google 模型', () => {
      const models = registry.getAll();
      const googleModels = models.filter((m) => m.provider === 'google');
      expect(googleModels.length).toBeGreaterThan(0);
    });
  });

  describe('find', () => {
    it('应能按 provider 和 modelId 查找', () => {
      const model = registry.find('openai', 'gpt-4o');
      expect(model).toBeDefined();
      expect(model?.name).toBe('GPT-4o');
      expect(model?.contextWindow).toBe(128000);
    });

    it('不存在的模型应返回 undefined', () => {
      expect(registry.find('unknown', 'unknown')).toBeUndefined();
    });
  });

  describe('getModelsByProvider', () => {
    it('应能按 provider 过滤', () => {
      const openaiModels = registry.getModelsByProvider('openai');
      expect(openaiModels.length).toBeGreaterThan(0);
      expect(openaiModels.every((m) => m.provider === 'openai')).toBe(true);
    });

    it('未知 provider 应返回空数组', () => {
      expect(registry.getModelsByProvider('unknown')).toEqual([]);
    });
  });

  describe('getModelsByCapability', () => {
    it('应能按能力过滤', () => {
      const visionModels = registry.getModelsByCapability('vision');
      expect(visionModels.length).toBeGreaterThan(0);
      expect(visionModels.every((m) => m.capabilities.includes('vision'))).toBe(true);
    });

    it('应能过滤 streaming 能力的模型', () => {
      const streamingModels = registry.getModelsByCapability('streaming');
      expect(streamingModels.length).toBeGreaterThan(0);
    });

    it('应能过滤 tool-calling 能力的模型', () => {
      const toolCallingModels = registry.getModelsByCapability('tool-calling');
      expect(toolCallingModels.length).toBeGreaterThan(0);
    });
  });

  describe('register', () => {
    it('应能注册自定义模型', () => {
      const customModel = {
        id: 'custom-model',
        name: 'Custom Model',
        provider: 'custom',
        apiType: 'openai-chat' as const,
        contextWindow: 32000,
        capabilities: ['streaming'],
      };

      registry.register(customModel);

      const found = registry.find('custom', 'custom-model');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Custom Model');
    });
  });

  describe('unregister', () => {
    it('应能注销模型', () => {
      registry.unregister('gpt-4o');
      expect(registry.find('openai', 'gpt-4o')).toBeUndefined();
    });

    it('注销不存在的模型应安全', () => {
      expect(() => registry.unregister('nonexistent')).not.toThrow();
    });
  });

  describe('findBestModel', () => {
    it('应能按 provider 筛选最佳模型', () => {
      const best = registry.findBestModel({ provider: 'openai' });
      expect(best).toBeDefined();
      expect(best?.provider).toBe('openai');
    });

    it('应能按最小 contextWindow 筛选', () => {
      const best = registry.findBestModel({ minContextWindow: 100000 });
      expect(best).toBeDefined();
      expect(best?.contextWindow).toBeGreaterThanOrEqual(100000);
    });

    it('应能按必需能力筛选', () => {
      const best = registry.findBestModel({
        requiredCapabilities: ['vision', 'reasoning'],
      });
      expect(best).toBeDefined();
      expect(best?.capabilities).toContain('vision');
      expect(best?.capabilities).toContain('reasoning');
    });

    it('无匹配应返回 undefined', () => {
      const best = registry.findBestModel({
        provider: 'nonexistent',
      });
      expect(best).toBeUndefined();
    });

    it('应按首选能力排序', () => {
      const best = registry.findBestModel({
        preferredCapabilities: ['reasoning', 'vision', 'tool-calling'],
      });
      expect(best).toBeDefined();
      // 最佳模型应包含尽可能多的首选能力
      const matchCount = best?.capabilities.filter((c) =>
        ['reasoning', 'vision', 'tool-calling'].includes(c),
      ).length;
      expect(matchCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('resolveApiType', () => {
    it('应能根据 provider 推断 API 类型', () => {
      expect(registry.resolveApiType('anthropic')).toBe('anthropic-messages');
      expect(registry.resolveApiType('google')).toBe('google-generative-ai');
      expect(registry.resolveApiType('deepseek')).toBe('deepseek-chat');
    });

    it('应能根据 apiEndpoint 推断 API 类型', () => {
      expect(registry.resolveApiType(undefined, 'https://api.anthropic.com')).toBe(
        'anthropic-messages',
      );
      expect(registry.resolveApiType(undefined, 'https://api.deepseek.com')).toBe('deepseek-chat');
    });

    it('无参数应返回默认 openai-chat', () => {
      expect(registry.resolveApiType()).toBe('openai-chat');
    });
  });
});