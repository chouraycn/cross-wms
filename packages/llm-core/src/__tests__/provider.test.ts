import { describe, it, expect, vi } from 'vitest';
import { ProviderRegistry } from '../provider';
import type { LlmProvider } from '../provider';

function makeProvider(id: string, modelIds: string[]): LlmProvider {
  return {
    type: 'llm',
    id,
    name: id,
    models: modelIds.map((m) => ({ id: m, name: m, kind: 'llm', capabilities: [] })),
    complete: async () => ({ content: '' }),
    stream: async function* () {},
  };
}

describe('ProviderRegistry', () => {
  it('should register and retrieve a provider', () => {
    const reg = new ProviderRegistry();
    const p = makeProvider('openai', ['gpt-4']);
    reg.registerProvider(p);
    expect(reg.getProvider('openai')).toBe(p);
    expect(reg.hasProvider('openai')).toBe(true);
    expect(reg.size()).toBe(1);
  });

  it('should throw on duplicate registration', () => {
    const reg = new ProviderRegistry();
    reg.registerProvider(makeProvider('openai', ['gpt-4']));
    expect(() => reg.registerProvider(makeProvider('openai', ['gpt-4']))).toThrow(/already registered/);
  });

  it('should unregister a provider', () => {
    const reg = new ProviderRegistry();
    reg.registerProvider(makeProvider('openai', ['gpt-4']));
    expect(reg.unregisterProvider('openai')).toBe(true);
    expect(reg.unregisterProvider('openai')).toBe(false);
    expect(reg.hasProvider('openai')).toBe(false);
  });

  it('should list providers and all models', () => {
    const reg = new ProviderRegistry();
    reg.registerProvider(makeProvider('openai', ['gpt-4', 'gpt-3.5']));
    reg.registerProvider(makeProvider('anthropic', ['claude']));
    expect(reg.listProviders().length).toBe(2);
    expect(reg.listAllModels().length).toBe(3);
  });

  it('should find provider for a model by id or name', () => {
    const reg = new ProviderRegistry();
    reg.registerProvider(makeProvider('openai', ['gpt-4']));
    expect(reg.findProviderForModel('gpt-4')?.id).toBe('openai');
    expect(reg.findProviderForModel('missing')).toBeUndefined();
  });

  it('should emit provider_registered event', () => {
    const reg = new ProviderRegistry();
    const handler = vi.fn();
    reg.on('provider_registered', handler);
    reg.registerProvider(makeProvider('openai', ['gpt-4']));
    expect(handler).toHaveBeenCalled();
  });

  it('should clear all providers', () => {
    const reg = new ProviderRegistry();
    reg.registerProvider(makeProvider('openai', ['gpt-4']));
    reg.clear();
    expect(reg.size()).toBe(0);
  });
});
