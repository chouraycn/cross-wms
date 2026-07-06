import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedModelCatalog } from '../model-catalog';

describe('UnifiedModelCatalog', () => {
  let catalog: UnifiedModelCatalog;

  beforeEach(() => {
    catalog = new UnifiedModelCatalog();
  });

  it('should add and list models', () => {
    catalog.addSource({
      id: 'test-source',
      name: 'Test Source',
      models: [
        {
          id: 'model-a',
          name: 'Model A',
          kind: 'llm',
          provider: 'openai',
          providerModelId: 'model-a',
          capabilities: ['chat', 'streaming', 'tool_calls'],
          contextWindow: { maxTokens: 4096 },
          pricing: {},
        },
      ],
      lastUpdated: Date.now(),
    });

    const models = catalog.listModels();
    expect(models.length).toBe(1);
    expect(models[0].id).toBe('model-a');
  });

  it('should get model by id', () => {
    catalog.addSource({
      id: 'source',
      name: 'Source',
      models: [
        {
          id: 'gpt-4',
          name: 'GPT-4',
          kind: 'llm',
          provider: 'openai',
          providerModelId: 'gpt-4',
          capabilities: ['chat', 'streaming'],
          contextWindow: { maxTokens: 8192 },
          pricing: {},
        },
      ],
      lastUpdated: Date.now(),
    });

    const model = catalog.getModel('gpt-4');
    expect(model).not.toBeUndefined();
    expect(model?.name).toBe('GPT-4');
  });

  it('should list providers', () => {
    catalog.addSource({
      id: 'source-a',
      name: 'Source A',
      models: [{ id: 'm1', name: 'M1', kind: 'llm', provider: 'openai', providerModelId: 'm1', capabilities: ['chat'], contextWindow: { maxTokens: 4096 }, pricing: {} }],
      lastUpdated: Date.now(),
    });
    catalog.addSource({
      id: 'source-b',
      name: 'Source B',
      models: [{ id: 'm2', name: 'M2', kind: 'llm', provider: 'anthropic', providerModelId: 'm2', capabilities: ['chat'], contextWindow: { maxTokens: 4096 }, pricing: {} }],
      lastUpdated: Date.now(),
    });

    const providers = catalog.listProviders();
    expect(providers.length).toBe(2);
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
  });

  it('should filter models by provider', () => {
    catalog.addSource({
      id: 'source',
      name: 'Source',
      models: [
        { id: 'm1', name: 'M1', kind: 'llm', provider: 'openai', providerModelId: 'm1', capabilities: ['chat'], contextWindow: { maxTokens: 4096 }, pricing: {} },
        { id: 'm2', name: 'M2', kind: 'llm', provider: 'anthropic', providerModelId: 'm2', capabilities: ['chat'], contextWindow: { maxTokens: 4096 }, pricing: {} },
      ],
      lastUpdated: Date.now(),
    });

    const openaiModels = catalog.listModels({ provider: 'openai' });
    expect(openaiModels.length).toBe(1);
    expect(openaiModels[0].provider).toBe('openai');
  });
});