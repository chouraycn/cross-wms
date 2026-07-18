import { describe, it, expect, beforeEach } from 'vitest';
import { ModelCapabilityRegistry } from '../capability-registry.js';

describe('ModelCapabilityRegistry', () => {
  let registry: ModelCapabilityRegistry;

  beforeEach(() => {
    registry = new ModelCapabilityRegistry();
  });

  // 测试 1: 注册单个能力
  it('should register a single capability', () => {
    registry.registerCapability('test-model', {
      name: 'multimodal',
      value: true,
      description: '支持多模态',
    });

    const capabilities = registry.getCapabilities('test-model');
    expect(capabilities).toHaveLength(1);
    expect(capabilities[0].name).toBe('multimodal');
    expect(capabilities[0].value).toBe(true);
  });

  // 测试 2: 注册完整模型信息
  it('should register complete model info', () => {
    registry.registerModel({
      modelId: 'gpt-4',
      name: 'GPT-4',
      provider: 'openai',
      capabilities: [
        { name: 'multimodal', value: true },
        { name: 'function_calling', value: true },
      ],
      contextWindow: 128000,
      maxTokens: 4096,
    });

    const info = registry.getModelInfo('gpt-4');
    expect(info).toBeDefined();
    expect(info?.name).toBe('GPT-4');
    expect(info?.provider).toBe('openai');
    expect(info?.contextWindow).toBe(128000);
    expect(info?.capabilities).toHaveLength(2);
  });

  // 测试 3: 检查能力是否存在
  it('should check capability correctly', () => {
    registry.registerModel({
      modelId: 'claude-3',
      name: 'Claude 3',
      provider: 'anthropic',
      capabilities: [
        { name: 'multimodal', value: true },
        { name: 'reasoning', value: false },
      ],
    });

    expect(registry.hasCapability('claude-3', 'multimodal')).toBe(true);
    expect(registry.hasCapability('claude-3', 'reasoning')).toBe(false);
    expect(registry.hasCapability('claude-3', 'unknown')).toBe(false);
  });

  // 测试 4: 列出具有特定能力的模型
  it('should list models by capability', () => {
    registry.registerModel({
      modelId: 'model-1',
      name: 'Model 1',
      provider: 'test',
      capabilities: [{ name: 'function_calling', value: true }],
    });
    registry.registerModel({
      modelId: 'model-2',
      name: 'Model 2',
      provider: 'test',
      capabilities: [{ name: 'function_calling', value: true }],
    });
    registry.registerModel({
      modelId: 'model-3',
      name: 'Model 3',
      provider: 'test',
      capabilities: [{ name: 'function_calling', value: false }],
    });

    const models = registry.listModelsByCapability('function_calling');
    expect(models).toHaveLength(2);
    expect(models).toContain('model-1');
    expect(models).toContain('model-2');
    expect(models).not.toContain('model-3');
  });

  // 测试 5: 更新已存在的能力
  it('should update existing capability', () => {
    registry.registerCapability('test-model', {
      name: 'streaming',
      value: false,
    });
    registry.registerCapability('test-model', {
      name: 'streaming',
      value: true,
    });

    const capabilities = registry.getCapabilities('test-model');
    expect(capabilities).toHaveLength(1);
    expect(capabilities[0].value).toBe(true);
  });

  // 测试 6: 合并模型信息
  it('should merge model info on re-registration', () => {
    registry.registerModel({
      modelId: 'test-model',
      name: 'Test Model',
      provider: 'test',
      capabilities: [{ name: 'streaming', value: true }],
    });
    registry.registerModel({
      modelId: 'test-model',
      name: 'Test Model Updated',
      provider: 'test',
      capabilities: [{ name: 'multimodal', value: true }],
      contextWindow: 8000,
    });

    const info = registry.getModelInfo('test-model');
    expect(info?.name).toBe('Test Model Updated');
    expect(info?.contextWindow).toBe(8000);
    expect(info?.capabilities).toHaveLength(2);
  });

  // 测试 7: 获取未注册模型的能力
  it('should return empty array for unregistered model', () => {
    const capabilities = registry.getCapabilities('unknown-model');
    expect(capabilities).toEqual([]);
  });

  // 测试 8: 列出所有模型
  it('should list all registered models', () => {
    registry.registerModel({
      modelId: 'model-a',
      name: 'Model A',
      provider: 'test',
      capabilities: [],
    });
    registry.registerModel({
      modelId: 'model-b',
      name: 'Model B',
      provider: 'test',
      capabilities: [],
    });

    const models = registry.listAllModels();
    expect(models).toHaveLength(2);
    expect(models).toContain('model-a');
    expect(models).toContain('model-b');
  });

  // 测试 9: 清除注册表
  it('should clear all registrations', () => {
    registry.registerModel({
      modelId: 'model-1',
      name: 'Model 1',
      provider: 'test',
      capabilities: [],
    });
    expect(registry.listAllModels()).toHaveLength(1);

    registry.clear();
    expect(registry.listAllModels()).toHaveLength(0);
  });

  // 测试 10: 注册默认模型
  it('should register default models', () => {
    registry.registerDefaults();

    const models = registry.listAllModels();
    expect(models.length).toBeGreaterThan(0);
    expect(registry.hasCapability('claude-3-5-sonnet-20241022', 'multimodal')).toBe(true);
    expect(registry.hasCapability('gpt-4o', 'function_calling')).toBe(true);
  });
});