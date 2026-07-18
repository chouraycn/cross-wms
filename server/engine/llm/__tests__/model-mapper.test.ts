/**
 * model-mapper 测试 — 别名 / 版本 / 区域映射。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveAlias,
  resolveVersion,
  stripRegionSuffix,
  mapModelId,
  registerAlias,
  registerVersionFallback,
  resolveCustomAlias,
  resolveCustomVersion,
  findModelByReference,
  listBuiltinAliases,
  listBuiltinVersionFallbacks,
  clearCustomMappings,
} from '../model-mapper.js';
import type { Model } from '../types.js';

describe('resolveAlias', () => {
  it('解析 OpenAI 别名', () => {
    expect(resolveAlias('gpt4')).toBe('gpt-4o');
    expect(resolveAlias('gpt4o')).toBe('gpt-4o');
    expect(resolveAlias('gpt-4')).toBe('gpt-4o');
    expect(resolveAlias('gpt3.5')).toBe('gpt-4o-mini');
  });

  it('解析 Anthropic 别名', () => {
    expect(resolveAlias('claude')).toBe('claude-3-5-sonnet-20241022');
    expect(resolveAlias('claude-sonnet')).toBe('claude-3-5-sonnet-20241022');
    expect(resolveAlias('claude-haiku')).toBe('claude-3-5-haiku-20241022');
  });

  it('解析国内模型别名', () => {
    expect(resolveAlias('qwen')).toBe('qwen-max');
    expect(resolveAlias('glm')).toBe('glm-4-plus');
    expect(resolveAlias('deepseek')).toBe('deepseek-chat');
    expect(resolveAlias('kimi')).toBe('kimi-k2-0905-preview');
  });

  it('未知别名原样返回', () => {
    expect(resolveAlias('unknown-model')).toBe('unknown-model');
  });

  it('大小写不敏感', () => {
    expect(resolveAlias('GPT4')).toBe('gpt-4o');
    expect(resolveAlias('CLAUDE')).toBe('claude-3-5-sonnet-20241022');
  });
});

describe('resolveVersion', () => {
  it('旧版本映射到当前版本', () => {
    expect(resolveVersion('gpt-4-0613')).toBe('gpt-4o');
    expect(resolveVersion('claude-2')).toBe('claude-3-5-sonnet-20241022');
  });

  it('当前版本原样返回', () => {
    expect(resolveVersion('gpt-4o')).toBe('gpt-4o');
  });
});

describe('stripRegionSuffix', () => {
  it('去除 -cn / -us / -eu 后缀', () => {
    expect(stripRegionSuffix('gpt-4-cn')).toBe('gpt-4');
    expect(stripRegionSuffix('gpt-4-us')).toBe('gpt-4');
    expect(stripRegionSuffix('claude-3-eu')).toBe('claude-3');
  });

  it('无后缀原样返回', () => {
    expect(stripRegionSuffix('gpt-4o')).toBe('gpt-4o');
  });
});

describe('mapModelId', () => {
  it('组合别名 + 版本 + 后缀解析', () => {
    expect(mapModelId('gpt4')).toBe('gpt-4o');
    expect(mapModelId('gpt-4-0613')).toBe('gpt-4o');
    expect(mapModelId('claude-cn')).toBe('claude-3-5-sonnet-20241022');
  });

  it('解析国内新 Provider 别名（ernie / spark / yi）', () => {
    expect(mapModelId('ernie')).toBe('ernie-4.0-8k-latest');
    expect(mapModelId('文心')).toBe('ernie-4.0-8k-latest');
    expect(mapModelId('spark')).toBe('4.0Ultra');
    expect(mapModelId('星火')).toBe('4.0Ultra');
    expect(mapModelId('yi')).toBe('yi-lightning');
    expect(mapModelId('零一万物')).toBe('yi-lightning');
  });
});

describe('自定义映射', () => {
  beforeEach(() => {
    clearCustomMappings();
  });

  it('registerAlias 注册自定义别名', () => {
    registerAlias('my-model', 'gpt-4o');
    expect(resolveCustomAlias('my-model')).toBe('gpt-4o');
    expect(resolveCustomAlias('MY-MODEL')).toBe('gpt-4o'); // 大小写不敏感
  });

  it('registerVersionFallback 注册自定义版本映射', () => {
    registerVersionFallback('old-v1', 'new-v2');
    expect(resolveCustomVersion('old-v1')).toBe('new-v2');
  });

  it('clearCustomMappings 清空自定义映射', () => {
    registerAlias('temp', 'gpt-4o');
    clearCustomMappings();
    expect(resolveCustomAlias('temp')).toBeUndefined();
  });
});

describe('findModelByReference', () => {
  function makeRegistry(models: Model[]) {
    return {
      find: (pred: (m: Model) => boolean) => models.find(pred),
      list: () => models,
    };
  }

  it('直接匹配 provider/id', () => {
    const reg = makeRegistry([
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', api: 'openai-completions', contextWindow: 128000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
    ]);
    const m = findModelByReference('openai/gpt-4o', reg);
    expect(m?.id).toBe('gpt-4o');
  });

  it('通过别名解析', () => {
    const reg = makeRegistry([
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', api: 'openai-completions', contextWindow: 128000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
    ]);
    const m = findModelByReference('gpt4', reg);
    expect(m?.id).toBe('gpt-4o');
  });

  it('通过 aliases 数组匹配', () => {
    const reg = makeRegistry([
      { id: 'custom', name: 'Custom', provider: 'x', api: 'openai-completions', contextWindow: 128000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, aliases: ['alias1', 'alias2'] },
    ]);
    const m = findModelByReference('alias2', reg);
    expect(m?.id).toBe('custom');
  });

  it('未找到返回 undefined', () => {
    const reg = makeRegistry([]);
    expect(findModelByReference('nonexistent', reg)).toBeUndefined();
  });
});

describe('listBuiltinAliases / listBuiltinVersionFallbacks', () => {
  it('返回内置别名映射表', () => {
    const aliases = listBuiltinAliases();
    expect(aliases['gpt4']).toBe('gpt-4o');
    expect(aliases['claude']).toBeTruthy();
  });

  it('返回内置版本映射表', () => {
    const versions = listBuiltinVersionFallbacks();
    expect(versions['gpt-4-0613']).toBe('gpt-4o');
  });
});
