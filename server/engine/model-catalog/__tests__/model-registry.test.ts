import { describe, expect, it, beforeEach } from 'vitest';
import { ModelRegistry } from '../model-registry';
import type { ModelManifest } from '../types';

function createTestModel(overrides: Partial<ModelManifest> = {}): ModelManifest {
  return {
    id: 'test-model',
    name: 'Test Model',
    provider: 'test-provider',
    type: 'chat',
    capabilities: ['json', 'tool_use'],
    contextWindow: 128000,
    ...overrides,
  };
}

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  describe('register', () => {
    it('应该成功注册新模型', () => {
      const model = createTestModel();
      const result = registry.register(model);
      expect(result).toBe(true);
      expect(registry.size()).toBe(1);
    });

    it('应该注册具有不同 provider 的同名模型', () => {
      const model1 = createTestModel({ id: 'model-a', provider: 'provider-1' });
      const model2 = createTestModel({ id: 'model-a', provider: 'provider-2' });
      registry.register(model1);
      registry.register(model2);
      expect(registry.size()).toBe(2);
    });

    it('当更高优先级源存在时不应该覆盖', () => {
      const builtinModel = createTestModel({ name: 'Builtin Model' });
      const runtimeModel = createTestModel({ name: 'Runtime Model' });
      registry.register(builtinModel, 'builtin');
      const result = registry.register(runtimeModel, 'runtime');
      expect(result).toBe(false);
      const entry = registry.get('test-provider', 'test-model');
      expect(entry?.model.name).toBe('Builtin Model');
    });

    it('当更高优先级源时应该覆盖', () => {
      const runtimeModel = createTestModel({ name: 'Runtime Model' });
      const configModel = createTestModel({ name: 'Config Model' });
      registry.register(runtimeModel, 'runtime');
      const result = registry.register(configModel, 'config');
      expect(result).toBe(true);
      const entry = registry.get('test-provider', 'test-model');
      expect(entry?.model.name).toBe('Config Model');
    });

    it('应该设置 registeredAt 和 updatedAt 时间戳', () => {
      const before = Date.now();
      registry.register(createTestModel());
      const after = Date.now();
      const entry = registry.get('test-provider', 'test-model');
      expect(entry).toBeDefined();
      expect(entry!.registeredAt).toBeGreaterThanOrEqual(before);
      expect(entry!.registeredAt).toBeLessThanOrEqual(after);
      expect(entry!.updatedAt).toBeGreaterThanOrEqual(before);
      expect(entry!.updatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('unregister', () => {
    it('应该成功注销已注册的模型', () => {
      registry.register(createTestModel());
      const result = registry.unregister('test-provider', 'test-model');
      expect(result).toBe(true);
      expect(registry.size()).toBe(0);
    });

    it('当模型不存在时应该返回 false', () => {
      const result = registry.unregister('nonexistent', 'model');
      expect(result).toBe(false);
    });

    it('应该从 provider 映射中移除模型', () => {
      registry.register(createTestModel({ id: 'model-1' }));
      registry.register(createTestModel({ id: 'model-2' }));
      registry.unregister('test-provider', 'model-1');
      expect(registry.listByProvider('test-provider')).toHaveLength(1);
    });

    it('当 provider 没有模型时应该移除 provider', () => {
      registry.register(createTestModel());
      registry.unregister('test-provider', 'test-model');
      expect(registry.listProviders()).not.toContain('test-provider');
    });
  });

  describe('get', () => {
    it('应该通过 provider 和 modelId 获取模型', () => {
      const model = createTestModel();
      registry.register(model);
      const entry = registry.get('test-provider', 'test-model');
      expect(entry).toBeDefined();
      expect(entry?.model.id).toBe('test-model');
      expect(entry?.provider).toBe('test-provider');
    });

    it('当模型不存在时应该返回 undefined', () => {
      const entry = registry.get('nonexistent', 'model');
      expect(entry).toBeUndefined();
    });
  });

  describe('getById', () => {
    it('应该通过 modelId 查找模型', () => {
      registry.register(createTestModel());
      const entry = registry.getById('test-model');
      expect(entry).toBeDefined();
      expect(entry?.model.id).toBe('test-model');
    });

    it('应该通过别名查找模型', () => {
      registry.register(createTestModel({ aliases: ['alias-1', 'alias-2'] }));
      const entry = registry.getById('alias-1');
      expect(entry).toBeDefined();
      expect(entry?.model.id).toBe('test-model');
    });

    it('当找不到模型时应该返回 undefined', () => {
      const entry = registry.getById('nonexistent');
      expect(entry).toBeUndefined();
    });
  });

  describe('list', () => {
    it('应该返回所有注册的模型', () => {
      registry.register(createTestModel({ id: 'model-1', provider: 'provider-1' }));
      registry.register(createTestModel({ id: 'model-2', provider: 'provider-2' }));
      const entries = registry.list();
      expect(entries).toHaveLength(2);
    });

    it('应该按 provider 和 id 排序', () => {
      registry.register(createTestModel({ id: 'model-b', provider: 'provider-b' }));
      registry.register(createTestModel({ id: 'model-a', provider: 'provider-a' }));
      const entries = registry.list();
      expect(entries[0].provider).toBe('provider-a');
      expect(entries[1].provider).toBe('provider-b');
    });
  });

  describe('listByProvider', () => {
    it('应该返回指定 provider 的所有模型', () => {
      registry.register(createTestModel({ id: 'model-1', provider: 'provider-1' }));
      registry.register(createTestModel({ id: 'model-2', provider: 'provider-1' }));
      registry.register(createTestModel({ id: 'model-3', provider: 'provider-2' }));
      const entries = registry.listByProvider('provider-1');
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.provider === 'provider-1')).toBe(true);
    });

    it('当 provider 不存在时应该返回空数组', () => {
      const entries = registry.listByProvider('nonexistent');
      expect(entries).toEqual([]);
    });
  });

  describe('listProviders', () => {
    it('应该返回所有唯一的 provider', () => {
      registry.register(createTestModel({ id: 'm1', provider: 'p1' }));
      registry.register(createTestModel({ id: 'm2', provider: 'p2' }));
      registry.register(createTestModel({ id: 'm3', provider: 'p1' }));
      const providers = registry.listProviders();
      expect(providers).toEqual(['p1', 'p2']);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      registry.register(
        createTestModel({
          id: 'gpt-4o',
          name: 'GPT-4o',
          provider: 'openai',
          capabilities: ['vision', 'json', 'tool_use'],
        }),
      );
      registry.register(
        createTestModel({
          id: 'claude-sonnet',
          name: 'Claude Sonnet',
          provider: 'anthropic',
          capabilities: ['vision', 'code'],
        }),
      );
      registry.register(
        createTestModel({
          id: 'deepseek-chat',
          name: 'DeepSeek Chat',
          provider: 'deepseek',
          type: 'chat',
          capabilities: ['json', 'tool_use'],
        }),
      );
    });

    it('应该按查询字符串搜索', () => {
      const results = registry.search({ query: 'gpt' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].model.id).toBe('gpt-4o');
    });

    it('应该按 provider 过滤', () => {
      const results = registry.search({ provider: 'openai' });
      expect(results.length).toBe(1);
      expect(results[0].provider).toBe('openai');
    });

    it('应该按能力过滤', () => {
      const results = registry.search({ capability: 'vision' });
      expect(results.length).toBe(2);
      expect(results.every((r) => r.model.capabilities.includes('vision'))).toBe(true);
    });

    it('应该按类型过滤', () => {
      const results = registry.search({ type: 'chat' });
      expect(results.length).toBe(3);
    });

    it('应该组合多个过滤条件', () => {
      const results = registry.search({ provider: 'openai', capability: 'vision' });
      expect(results.length).toBe(1);
      expect(results[0].provider).toBe('openai');
      expect(results[0].model.capabilities.includes('vision')).toBe(true);
    });
  });

  describe('has', () => {
    it('当模型已注册时应该返回 true', () => {
      registry.register(createTestModel());
      expect(registry.has('test-provider', 'test-model')).toBe(true);
    });

    it('当模型未注册时应该返回 false', () => {
      expect(registry.has('test-provider', 'test-model')).toBe(false);
    });
  });

  describe('size', () => {
    it('应该返回正确的模型数量', () => {
      expect(registry.size()).toBe(0);
      registry.register(createTestModel({ id: 'm1' }));
      expect(registry.size()).toBe(1);
      registry.register(createTestModel({ id: 'm2' }));
      expect(registry.size()).toBe(2);
    });
  });

  describe('clear', () => {
    it('应该清空所有模型', () => {
      registry.register(createTestModel({ id: 'm1' }));
      registry.register(createTestModel({ id: 'm2' }));
      registry.clear();
      expect(registry.size()).toBe(0);
      expect(registry.listProviders()).toEqual([]);
    });
  });
});
