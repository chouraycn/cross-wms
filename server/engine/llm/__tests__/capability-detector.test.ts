/**
 * capability-detector 测试 — 视觉 / 函数调用 / 思考模式 / JSON 模式检测。
 */
import { describe, it, expect } from 'vitest';
import {
  hasCapability,
  matchesVisionId,
  matchesThinkingId,
  listCapabilities,
  filterByCapability,
  apiSupportsStreaming,
  capabilityDiff,
  PROVIDER_DEFAULT_CAPABILITIES,
} from '../capability-detector.js';
import type { Model } from '../types.js';

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'test',
    name: 'Test',
    provider: 'openai',
    api: 'openai-completions',
    contextWindow: 128_000,
    cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    ...overrides,
  };
}

describe('hasCapability', () => {
  it('显式 capabilities 数组优先', () => {
    // 使用 ollama provider（默认不含 json-mode）以隔离测试
    const model = makeModel({ provider: 'ollama', capabilities: ['vision'] });
    expect(hasCapability(model, 'vision')).toBe(true);
    expect(hasCapability(model, 'json-mode')).toBe(false);
  });

  it('reasoning 模型隐含 thinking', () => {
    const model = makeModel({ provider: 'ollama', reasoning: true, capabilities: [] });
    expect(hasCapability(model, 'thinking')).toBe(true);
  });

  it('Provider 默认能力兜底', () => {
    const model = makeModel({ provider: 'openai', capabilities: [] });
    expect(hasCapability(model, 'function-calling')).toBe(true);
    expect(hasCapability(model, 'streaming')).toBe(true);
  });

  it('视觉 ID 启发式（claude-3 含视觉）', () => {
    const model = makeModel({ id: 'claude-3-5-sonnet', provider: 'anthropic', capabilities: [] });
    expect(hasCapability(model, 'vision')).toBe(true);
  });
});

describe('matchesVisionId', () => {
  it('匹配 -vl / vision / 4o 等', () => {
    expect(matchesVisionId('qwen-vl-max')).toBe(true);
    expect(matchesVisionId('gpt-4o')).toBe(true);
    expect(matchesVisionId('glm-4v')).toBe(true); // GLM-4V 是视觉模型
    expect(matchesVisionId('claude-3-5-sonnet')).toBe(true);
  });

  it('不匹配纯文本模型', () => {
    expect(matchesVisionId('deepseek-chat')).toBe(false);
    expect(matchesVisionId('qwen-max')).toBe(false);
  });
});

describe('matchesThinkingId', () => {
  it('匹配 reasoner / r1 / o1', () => {
    expect(matchesThinkingId('deepseek-reasoner')).toBe(true);
    expect(matchesThinkingId('o1')).toBe(true);
    expect(matchesThinkingId('claude-3-7-sonnet')).toBe(true);
  });

  it('不匹配非推理模型', () => {
    expect(matchesThinkingId('gpt-4o')).toBe(false);
  });
});

describe('listCapabilities', () => {
  it('合并显式声明、Provider 默认、ID 启发式', () => {
    const model = makeModel({
      id: 'claude-3-5-sonnet',
      provider: 'anthropic',
      api: 'anthropic-messages',
      capabilities: ['json-mode'],
      reasoning: true,
    });
    const caps = listCapabilities(model);
    expect(caps).toContain('json-mode');
    expect(caps).toContain('vision');
    expect(caps).toContain('thinking');
    expect(caps).toContain('function-calling');
  });
});

describe('filterByCapability', () => {
  it('筛选支持视觉的模型子集', () => {
    const models = [
      makeModel({ id: 'gpt-4o' }),
      makeModel({ id: 'gpt-4o-mini' }),
      makeModel({ id: 'text-only', capabilities: [] }),
    ];
    const vision = filterByCapability(models, 'vision');
    expect(vision.map((m) => m.id)).toContain('gpt-4o');
  });
});

describe('apiSupportsStreaming', () => {
  it('cloudflare-ai 不支持流式', () => {
    expect(apiSupportsStreaming('cloudflare-ai')).toBe(false);
  });

  it('其他 API 支持流式', () => {
    expect(apiSupportsStreaming('openai-completions')).toBe(true);
    expect(apiSupportsStreaming('anthropic-messages')).toBe(true);
    expect(apiSupportsStreaming('google-gemini')).toBe(true);
  });
});

describe('capabilityDiff', () => {
  it('比较两模型能力差异', () => {
    // 使用 ollama provider 且不在默认列表中的能力（seed/logprobs）
    const a = makeModel({ id: 'm1', provider: 'ollama', capabilities: ['seed'] });
    const b = makeModel({ id: 'm2', provider: 'ollama', capabilities: ['logprobs'] });
    const diff = capabilityDiff(a, b);
    expect(diff.added).toContain('logprobs');
    expect(diff.removed).toContain('seed');
  });
});

describe('PROVIDER_DEFAULT_CAPABILITIES', () => {
  it('包含主要 Provider 的默认能力', () => {
    expect(PROVIDER_DEFAULT_CAPABILITIES['openai']).toContain('function-calling');
    expect(PROVIDER_DEFAULT_CAPABILITIES['anthropic']).toContain('vision');
    expect(PROVIDER_DEFAULT_CAPABILITIES['ollama']).toContain('streaming');
  });
});
