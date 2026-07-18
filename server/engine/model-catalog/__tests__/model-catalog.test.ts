import { describe, expect, it, beforeEach } from 'vitest';
import { ModelCatalog } from '../index';

describe('ModelCatalog', () => {
  let catalog: ModelCatalog;

  beforeEach(() => {
    catalog = new ModelCatalog();
  });

  describe('初始化', () => {
    it('应该用内置模型初始化', () => {
      const models = catalog.listModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('应该包含已知的内置模型', () => {
      const models = catalog.listModels();
      const modelIds = models.map((m) => m.id);
      expect(modelIds).toContain('claude-3-5-sonnet');
      expect(modelIds).toContain('gpt-4o');
      expect(modelIds).toContain('deepseek-chat');
    });

    it('应该包含多个 providers', () => {
      const providers = catalog.listProviders();
      expect(providers.length).toBeGreaterThanOrEqual(4);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('deepseek');
      expect(providers).toContain('google');
    });
  });

  describe('getModel', () => {
    it('应该通过 id 获取模型', () => {
      const model = catalog.getModel('claude-3-5-sonnet');
      expect(model).toBeDefined();
      expect(model?.id).toBe('claude-3-5-sonnet');
      expect(model?.provider).toBe('anthropic');
    });

    it('当模型不存在时应该返回 undefined', () => {
      const model = catalog.getModel('nonexistent-model');
      expect(model).toBeUndefined();
    });

    it('应该不区分大小写地查找模型', () => {
      const model = catalog.getModel('Claude-3-5-Sonnet');
      expect(model).toBeDefined();
      expect(model?.id).toBe('claude-3-5-sonnet');
    });
  });

  describe('getModelByProvider', () => {
    it('应该通过 provider 和 model id 获取模型', () => {
      const model = catalog.getModelByProvider('anthropic', 'claude-3-5-sonnet');
      expect(model).toBeDefined();
      expect(model?.name).toBe('Claude 3.5 Sonnet');
    });

    it('当模型不在该 provider 下时应该返回 undefined', () => {
      const model = catalog.getModelByProvider('openai', 'claude-3-5-sonnet');
      expect(model).toBeUndefined();
    });
  });

  describe('listModels', () => {
    it('应该返回所有模型', () => {
      const models = catalog.listModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('每个模型应该有必要的字段', () => {
      const models = catalog.listModels();
      for (const model of models) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.provider).toBeDefined();
        expect(model.type).toBeDefined();
        expect(model.capabilities).toBeDefined();
        expect(model.contextWindow).toBeDefined();
        expect(model.status).toBeDefined();
        expect(model.source).toBeDefined();
        expect(model.authStatus).toBeDefined();
        expect(typeof model.available).toBe('boolean');
      }
    });
  });

  describe('search', () => {
    it('应该按查询字符串搜索', () => {
      const result = catalog.search({ query: 'gpt' });
      expect(result.total).toBeGreaterThan(0);
      expect(result.models.every((m) => m.id.includes('gpt') || m.name.toLowerCase().includes('gpt'))).toBe(true);
    });

    it('应该按 provider 过滤', () => {
      const result = catalog.search({ provider: 'anthropic' });
      expect(result.total).toBeGreaterThan(0);
      expect(result.models.every((m) => m.provider === 'anthropic')).toBe(true);
    });

    it('应该按能力过滤', () => {
      const result = catalog.search({ capability: 'vision' });
      expect(result.total).toBeGreaterThan(0);
      expect(result.models.every((m) => m.capabilities.includes('vision'))).toBe(true);
    });

    it('应该按可用状态过滤', () => {
      const result = catalog.search({ availableOnly: true });
      expect(result.models.every((m) => m.available)).toBe(true);
    });

    it('应该按最小上下文窗口过滤', () => {
      const result = catalog.search({ minContextWindow: 500000 });
      expect(result.models.every((m) => m.contextWindow >= 500000)).toBe(true);
    });

    it('应该组合多个过滤条件', () => {
      const result = catalog.search({
        provider: 'anthropic',
        capability: 'vision',
        availableOnly: true,
      });
      expect(result.total).toBeGreaterThan(0);
      expect(result.models.every((m) => m.provider === 'anthropic')).toBe(true);
      expect(result.models.every((m) => m.capabilities.includes('vision'))).toBe(true);
      expect(result.models.every((m) => m.available)).toBe(true);
    });

    it('当没有匹配时应该返回空结果', () => {
      const result = catalog.search({ query: 'nonexistent-model-xyz' });
      expect(result.total).toBe(0);
      expect(result.models).toEqual([]);
    });
  });

  describe('findBestModel', () => {
    it('应该找到具有指定能力的最佳模型', () => {
      const model = catalog.findBestModel({ capability: 'vision' });
      expect(model).toBeDefined();
      expect(model?.capabilities.includes('vision')).toBe(true);
    });

    it('应该按 provider 过滤', () => {
      const model = catalog.findBestModel({ provider: 'deepseek' });
      expect(model).toBeDefined();
      expect(model?.provider).toBe('deepseek');
    });

    it('应该找到满足上下文窗口要求的模型', () => {
      const model = catalog.findBestModel({ contextWindow: 100000 });
      expect(model).toBeDefined();
      expect(model?.contextWindow).toBeGreaterThanOrEqual(100000);
    });

    it('当没有匹配时应该返回 undefined', () => {
      const model = catalog.findBestModel({
        contextWindow: 10000000,
        provider: 'nonexistent',
      });
      expect(model).toBeUndefined();
    });

    it('应该优先选择推荐的模型', () => {
      const model = catalog.findBestModel({
        provider: 'anthropic',
        preferRecommended: true,
      });
      expect(model).toBeDefined();
      expect(model?.isRecommended).toBe(true);
    });
  });

  describe('listProviders', () => {
    it('应该返回所有唯一的 providers', () => {
      const providers = catalog.listProviders();
      expect(providers.length).toBeGreaterThan(0);
      expect(providers).toEqual([...new Set(providers)]);
    });

    it('应该按字母顺序排序 providers', () => {
      const providers = catalog.listProviders();
      expect(providers).toEqual([...providers].sort());
    });
  });

  describe('getModelTypes', () => {
    it('应该返回所有模型类型', () => {
      const types = catalog.getModelTypes();
      expect(types).toContain('chat');
      expect(types).toContain('completion');
      expect(types).toContain('embedding');
      expect(types).toContain('vision');
      expect(types).toContain('tts');
      expect(types).toContain('speech');
    });
  });

  describe('getCapabilities', () => {
    it('应该返回所有能力', () => {
      const capabilities = catalog.getCapabilities();
      expect(capabilities.length).toBeGreaterThan(0);
      expect(capabilities).toContain('vision');
      expect(capabilities).toContain('json');
      expect(capabilities).toContain('tool_use');
      expect(capabilities).toContain('code');
    });
  });

  describe('updateModelAuthStatus', () => {
    it('应该更新模型认证状态', () => {
      catalog.updateModelAuthStatus('openai', 'gpt-4o', 'authenticated');
      const status = catalog.getModelAuthStatus('openai', 'gpt-4o');
      expect(status).toBe('authenticated');
    });

    it('应该影响模型的可用状态', () => {
      catalog.updateModelAuthStatus('openai', 'gpt-4o', 'authenticated');
      const model = catalog.getModelByProvider('openai', 'gpt-4o');
      expect(model?.available).toBe(true);
    });
  });

  describe('registerModel', () => {
    it('应该注册新模型', () => {
      const before = catalog.listModels().length;
      catalog.registerModel({
        id: 'custom-model',
        name: 'Custom Model',
        provider: 'custom-provider',
        type: 'chat',
        capabilities: ['json'],
        contextWindow: 8000,
      });
      const after = catalog.listModels().length;
      expect(after).toBe(before + 1);
      expect(catalog.getModel('custom-model')).toBeDefined();
    });
  });

  describe('unregisterModel', () => {
    it('应该注销模型', () => {
      catalog.registerModel({
        id: 'temp-model',
        name: 'Temp Model',
        provider: 'temp-provider',
        type: 'chat',
        capabilities: ['json'],
        contextWindow: 8000,
      });
      expect(catalog.getModel('temp-model')).toBeDefined();
      catalog.unregisterModel('temp-provider', 'temp-model');
      expect(catalog.getModel('temp-model')).toBeUndefined();
    });
  });

  describe('getProviderIndex', () => {
    it('应该返回 provider 索引', () => {
      const index = catalog.getProviderIndex();
      expect(index).toBeDefined();
      expect(index.version).toBe(1);
      expect(Object.keys(index.providers).length).toBeGreaterThan(0);
    });
  });

  describe('getRegistry', () => {
    it('应该返回模型注册表', () => {
      const registry = catalog.getRegistry();
      expect(registry).toBeDefined();
      expect(registry.size()).toBeGreaterThan(0);
    });
  });
});
