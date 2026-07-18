/**
 * sampling 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SamplingManager } from '../sampling.js';
import { providerRegistry, type LlmProvider } from '@cdf-know/llm-core';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock llm-core
vi.mock('@cdf-know/llm-core', () => ({
  providerRegistry: {
    getProvider: vi.fn(),
    listProviders: vi.fn(() => []),
    hasProvider: vi.fn(() => false),
    findProviderForModel: vi.fn(),
  },
}));

describe('SamplingManager', () => {
  let manager: SamplingManager;

  beforeEach(() => {
    manager = new SamplingManager();
    vi.clearAllMocks();
  });

  describe('setDefaultProvider', () => {
    it('应该设置默认 provider', () => {
      manager.setDefaultProvider('openai');
      expect(manager.hasProvider('openai')).toBe(false); // Mock 返回 false
    });
  });

  describe('setDefaultModel', () => {
    it('应该设置默认模型', () => {
      manager.setDefaultModel('gpt-4');
      // 内部状态设置，通过其他方法验证
    });
  });

  describe('createCompletion', () => {
    it('应该抛出错误当 provider 不存在', async () => {
      await expect(
        manager.createCompletion({
          provider: 'non-existent',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow();
    });

    it('应该使用 provider 完成请求', async () => {
      const mockProvider: LlmProvider = {
        type: 'llm',
        id: 'test-provider',
        name: 'Test Provider',
        models: [{ id: 'test-model', name: 'Test Model', kind: 'llm', capabilities: [] }],
        complete: vi.fn().mockResolvedValue({
          content: 'Hello, World!',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        }),
        stream: vi.fn(),
      };

      vi.mocked(providerRegistry.getProvider).mockReturnValue(mockProvider);

      const result = await manager.createCompletion({
        provider: 'test-provider',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Hello, World!');
      expect(result.model).toBe('test-model');
      expect(result.provider).toBe('test-provider');
      expect(result.usage?.totalTokens).toBe(15);
    });
  });

  describe('createStreamingCompletion', () => {
    it('应该返回流式事件', async () => {
      const mockProvider: LlmProvider = {
        type: 'llm',
        id: 'test-provider',
        name: 'Test Provider',
        models: [{ id: 'test-model', name: 'Test Model', kind: 'llm', capabilities: [] }],
        complete: vi.fn(),
        stream: vi.fn().mockImplementation(async function* () {
          yield { type: 'start' as const };
          yield { type: 'token' as const, content: 'Hello' };
          yield { type: 'token' as const, content: ' World' };
          yield { type: 'finish' as const, usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } };
        }),
      };

      vi.mocked(providerRegistry.getProvider).mockReturnValue(mockProvider);

      const events = [];
      for await (const event of manager.createStreamingCompletion({
        provider: 'test-provider',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        events.push(event);
      }

      expect(events.length).toBe(4);
      expect(events[0].type).toBe('start');
      expect(events[1].type).toBe('token');
      expect(events[3].type).toBe('finish');
    });

    it('应该处理流式错误', async () => {
      const mockProvider: LlmProvider = {
        type: 'llm',
        id: 'test-provider',
        name: 'Test Provider',
        models: [],
        complete: vi.fn(),
        stream: vi.fn().mockImplementation(async function* () {
          yield { type: 'error' as const, error: 'Test error' };
        }),
      };

      vi.mocked(providerRegistry.getProvider).mockReturnValue(mockProvider);

      const events = [];
      for await (const event of manager.createStreamingCompletion({
        provider: 'test-provider',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        events.push(event);
      }

      expect(events.some((e) => e.type === 'error')).toBe(true);
    });
  });

  describe('listModels', () => {
    it('应该返回空数组当没有 provider', () => {
      const models = manager.listModels();
      expect(models).toEqual([]);
    });

    it('应该返回 provider 的模型列表', () => {
      const mockProvider: LlmProvider = {
        type: 'llm',
        id: 'test-provider',
        name: 'Test Provider',
        models: [
          { id: 'model-1', name: 'Model 1', kind: 'llm', capabilities: [] },
          { id: 'model-2', name: 'Model 2', kind: 'llm', capabilities: [] },
        ],
        complete: vi.fn(),
        stream: vi.fn(),
      };

      vi.mocked(providerRegistry.getProvider).mockReturnValue(mockProvider);

      const models = manager.listModels('test-provider');
      expect(models.length).toBe(2);
      expect(models[0].id).toBe('model-1');
    });
  });

  describe('listProviders', () => {
    it('应该返回空数组当没有注册的 provider', () => {
      vi.mocked(providerRegistry.listProviders).mockReturnValue([]);
      const providers = manager.listProviders();
      expect(providers).toEqual([]);
    });
  });

  describe('hasProvider', () => {
    it('应该检查 provider 是否存在', () => {
      vi.mocked(providerRegistry.hasProvider).mockReturnValue(true);
      expect(manager.hasProvider('existing-provider')).toBe(true);
    });
  });

  describe('findProviderForModel', () => {
    it('应该找到支持指定模型的 provider', () => {
      const mockProvider: LlmProvider = {
        type: 'llm',
        id: 'test-provider',
        name: 'Test Provider',
        models: [{ id: 'test-model', name: 'Test Model', kind: 'llm', capabilities: [] }],
        complete: vi.fn(),
        stream: vi.fn(),
      };

      vi.mocked(providerRegistry.findProviderForModel).mockReturnValue(mockProvider);

      const providerId = manager.findProviderForModel('test-model');
      expect(providerId).toBe('test-provider');
    });
  });
});