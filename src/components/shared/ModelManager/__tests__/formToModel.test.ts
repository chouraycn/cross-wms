import { describe, it, expect } from 'vitest';
import { modelToForm, formToModel } from '../modelFormUtils';
import type { ModelConfig } from '../../../../types/models';

describe('modelToForm', () => {
  it('should convert ModelConfig to ModelFormState', () => {
    const model: ModelConfig = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      apiEndpoint: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      enabled: true,
      contextWindow: 128000,
      temperature: 0.7,
      capabilities: ['general', 'multimodal'],
    };
    const form = modelToForm(model);
    expect(form.id).toBe('gpt-4o');
    expect(form.name).toBe('GPT-4o');
    expect(form.provider).toBe('openai');
    expect(form.apiEndpoint).toBe('https://api.openai.com/v1');
    expect(form.apiKey).toBe('sk-test');
    expect(form.enabled).toBe(true);
    expect(form.contextWindow).toBe('128000');
    expect(form.temperature).toBe('0.7');
    expect(form.capabilities).toEqual(['general', 'multimodal']);
  });

  it('should handle undefined fields', () => {
    const model: ModelConfig = {
      id: 'test',
      name: 'Test',
      provider: 'custom',
      enabled: false,
    };
    const form = modelToForm(model);
    expect(form.apiEndpoint).toBe('');
    expect(form.apiKey).toBe('');
    expect(form.contextWindow).toBe('');
    expect(form.capabilities).toEqual([]);
  });

  it('should generate _uid for apiKeys', () => {
    const model: ModelConfig = {
      id: 'test',
      name: 'Test',
      provider: 'openai',
      enabled: true,
      apiKeys: [
        { key: 'key1', label: 'Key 1', enabled: true },
        { key: 'key2', label: 'Key 2', enabled: false },
      ],
    };
    const form = modelToForm(model);
    expect(form.apiKeys).toHaveLength(2);
    expect(form.apiKeys[0]._uid).toBeDefined();
    expect(form.apiKeys[0].key).toBe('key1');
    expect(form.apiKeys[1].enabled).toBe(false);
  });
});

describe('formToModel', () => {
  it('should convert ModelFormState to ModelConfig', () => {
    const form = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai' as const,
      apiEndpoint: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      apiKeyRef: '',
      apiKeys: [],
      apiKeyRefs: [],
      keyStrategy: 'round-robin' as const,
      enabled: true,
      description: 'A test model',
      contextWindow: '128000',
      maxTokens: '4096',
      temperature: '0.7',
      topP: '1',
      capabilities: ['general'],
    };
    const model = formToModel(form);
    expect(model.id).toBe('gpt-4o');
    expect(model.name).toBe('GPT-4o');
    expect(model.apiEndpoint).toBe('https://api.openai.com/v1');
    expect(model.apiKey).toBe('sk-test');
    expect(model.contextWindow).toBe(128000);
    expect(model.maxTokens).toBe(4096);
    expect(model.temperature).toBe(0.7);
    expect(model.topP).toBe(1);
    expect(model.capabilities).toEqual(['general']);
  });

  it('should trim whitespace from fields', () => {
    const form = {
      id: '  test  ',
      name: '  Test  ',
      provider: 'custom' as const,
      apiEndpoint: '  ',
      apiKey: '  ',
      apiKeyRef: '',
      apiKeys: [],
      apiKeyRefs: [],
      keyStrategy: 'round-robin' as const,
      enabled: true,
      description: '  ',
      contextWindow: '',
      maxTokens: '',
      temperature: '',
      topP: '',
      capabilities: [],
    };
    const model = formToModel(form);
    expect(model.id).toBe('test');
    expect(model.name).toBe('Test');
    expect(model.apiEndpoint).toBeUndefined();
    expect(model.apiKey).toBeUndefined();
    expect(model.description).toBeUndefined();
  });

  it('should preserve originalModel apiKeyRef when no new key', () => {
    const original: ModelConfig = {
      id: 'test',
      name: 'Test',
      provider: 'openai',
      enabled: true,
      apiKeyRef: 'keychain:test-model',
    };
    const form = {
      id: 'test',
      name: 'Test',
      provider: 'openai' as const,
      apiEndpoint: '',
      apiKey: '',
      apiKeyRef: '',
      apiKeys: [],
      apiKeyRefs: [],
      keyStrategy: 'round-robin' as const,
      enabled: true,
      description: '',
      contextWindow: '',
      maxTokens: '',
      temperature: '',
      topP: '',
      capabilities: [],
    };
    const model = formToModel(form, original);
    expect(model.apiKeyRef).toBe('keychain:test-model');
  });

  it('should handle multi-key configuration', () => {
    const form = {
      id: 'test',
      name: 'Test',
      provider: 'openai' as const,
      apiEndpoint: '',
      apiKey: '',
      apiKeyRef: '',
      apiKeys: [
        { key: 'key1', label: 'Key 1', enabled: true, _uid: '1' },
        { key: 'key2', label: 'Key 2', enabled: true, _uid: '2' },
      ],
      apiKeyRefs: [],
      keyStrategy: 'failover' as const,
      enabled: true,
      description: '',
      contextWindow: '',
      maxTokens: '',
      temperature: '',
      topP: '',
      capabilities: [],
    };
    const model = formToModel(form);
    expect(model.apiKeys).toHaveLength(2);
    expect(model.keyStrategy).toBe('failover');
    expect(model.apiKey).toBeUndefined();
  });
});
