import { describe, it, expect } from 'vitest';
import { modelToForm, formToModel } from '../modelFormUtils';
import type { ModelConfig } from '../../../../types/models';
import type { ModelFormState } from '../types';

function makeForm(overrides: Partial<ModelFormState> = {}): ModelFormState {
  return {
    id: 'test',
    name: 'Test',
    provider: 'openai',
    apiType: 'auto',
    apiEndpoint: '',
    apiKey: '',
    apiKeyRef: '',
    apiKeys: [],
    apiKeyRefs: [],
    keyStrategy: 'round-robin',
    enabled: true,
    description: '',
    contextWindow: '',
    contextTokens: '',
    maxTokens: '',
    temperature: '1',
    topP: '1',
    capabilities: [],
    thinkingLevels: [],
    defaultThinkingLevel: '',
    authMode: 'api-key',
    costInput: '',
    costOutput: '',
    costCacheRead: '',
    costCacheWrite: '',
    localServiceEnabled: false,
    localServiceCommand: '',
    localServiceArgs: '',
    localServiceCwd: '',
    localServiceEnv: '',
    localServiceHealthUrl: '',
    localServiceReadyTimeoutMs: '',
    localServiceIdleStopMs: '',
    ...overrides,
  };
}

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

  it('should convert thinking fields', () => {
    const model: ModelConfig = {
      id: 'o3',
      name: 'o3',
      provider: 'openai',
      enabled: true,
      thinkingLevels: ['low', 'medium', 'high'],
      defaultThinkingLevel: 'medium',
    };
    const form = modelToForm(model);
    expect(form.thinkingLevels).toEqual(['low', 'medium', 'high']);
    expect(form.defaultThinkingLevel).toBe('medium');
  });

  it('should convert cost fields', () => {
    const model: ModelConfig = {
      id: 'test',
      name: 'Test',
      provider: 'openai',
      enabled: true,
      cost: { input: 5, output: 15, cacheRead: 2.5, cacheWrite: 10 },
    };
    const form = modelToForm(model);
    expect(form.costInput).toBe('5');
    expect(form.costOutput).toBe('15');
    expect(form.costCacheRead).toBe('2.5');
    expect(form.costCacheWrite).toBe('10');
  });

  it('should convert localService fields', () => {
    const model: ModelConfig = {
      id: 'local',
      name: 'Local Model',
      provider: 'ollama',
      enabled: true,
      localService: {
        command: 'ollama',
        args: ['serve'],
        cwd: '/tmp',
        env: { OLLAMA_HOST: '0.0.0.0' },
        healthUrl: 'http://localhost:11434/api/tags',
        readyTimeoutMs: 30000,
        idleStopMs: 600000,
      },
    };
    const form = modelToForm(model);
    expect(form.localServiceEnabled).toBe(true);
    expect(form.localServiceCommand).toBe('ollama');
    expect(form.localServiceArgs).toBe('serve');
    expect(form.localServiceCwd).toBe('/tmp');
    expect(form.localServiceEnv).toContain('OLLAMA_HOST=0.0.0.0');
    expect(form.localServiceHealthUrl).toBe('http://localhost:11434/api/tags');
    expect(form.localServiceReadyTimeoutMs).toBe('30000');
    expect(form.localServiceIdleStopMs).toBe('600000');
  });
});

describe('formToModel', () => {
  it('should convert ModelFormState to ModelConfig', () => {
    const form = makeForm({
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      apiEndpoint: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      description: 'A test model',
      contextWindow: '128000',
      maxTokens: '4096',
      temperature: '0.7',
      topP: '1',
      capabilities: ['general'],
    });
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
    const form = makeForm({
      id: '  test  ',
      name: '  Test  ',
      provider: 'custom',
      apiEndpoint: '  ',
      apiKey: '  ',
      description: '  ',
    });
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
    const form = makeForm({ id: 'test', name: 'Test' });
    const model = formToModel(form, original);
    expect(model.apiKeyRef).toBe('keychain:test-model');
  });

  it('should handle multi-key configuration', () => {
    const form = makeForm({
      apiKeys: [
        { key: 'key1', label: 'Key 1', enabled: true, _uid: '1' },
        { key: 'key2', label: 'Key 2', enabled: true, _uid: '2' },
      ],
      keyStrategy: 'failover',
    });
    const model = formToModel(form);
    expect(model.apiKeys).toHaveLength(2);
    expect(model.keyStrategy).toBe('failover');
    expect(model.apiKey).toBeUndefined();
  });

  it('should convert contextTokens', () => {
    const form = makeForm({ contextTokens: '100000' });
    const model = formToModel(form);
    expect(model.contextTokens).toBe(100000);
  });

  it('should convert thinking fields', () => {
    const form = makeForm({
      thinkingLevels: ['low', 'medium', 'high'],
      defaultThinkingLevel: 'medium',
    });
    const model = formToModel(form);
    expect(model.thinkingLevels).toEqual(['low', 'medium', 'high']);
    expect(model.defaultThinkingLevel).toBe('medium');
  });

  it('should convert cost fields', () => {
    const form = makeForm({
      costInput: '5',
      costOutput: '15',
      costCacheRead: '2.5',
      costCacheWrite: '10',
    });
    const model = formToModel(form);
    expect(model.cost?.input).toBe(5);
    expect(model.cost?.output).toBe(15);
    expect(model.cost?.cacheRead).toBe(2.5);
    expect(model.cost?.cacheWrite).toBe(10);
  });

  it('should convert localService fields', () => {
    const form = makeForm({
      localServiceEnabled: true,
      localServiceCommand: 'ollama',
      localServiceArgs: 'serve --port 11434',
      localServiceCwd: '/opt/ollama',
      localServiceEnv: 'OLLAMA_HOST=0.0.0.0\nOLLAMA_MODELS=/data',
      localServiceHealthUrl: 'http://localhost:11434/api/tags',
      localServiceReadyTimeoutMs: '30000',
      localServiceIdleStopMs: '600000',
    });
    const model = formToModel(form);
    expect(model.localService?.command).toBe('ollama');
    expect(model.localService?.args).toEqual(['serve', '--port', '11434']);
    expect(model.localService?.cwd).toBe('/opt/ollama');
    expect(model.localService?.env?.OLLAMA_HOST).toBe('0.0.0.0');
    expect(model.localService?.env?.OLLAMA_MODELS).toBe('/data');
    expect(model.localService?.healthUrl).toBe('http://localhost:11434/api/tags');
    expect(model.localService?.readyTimeoutMs).toBe(30000);
    expect(model.localService?.idleStopMs).toBe(600000);
  });

  it('should not include localService when disabled', () => {
    const form = makeForm({
      localServiceEnabled: false,
      localServiceCommand: 'ollama',
    });
    const model = formToModel(form);
    expect(model.localService).toBeUndefined();
  });
});
