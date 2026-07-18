/**
 * token-counter 测试 — 不同模型族的 token 估算。
 */
import { describe, it, expect } from 'vitest';
import {
  countChars,
  estimateTokensForText,
  estimateMessageTokens,
  countMessageTokens,
  estimateTokensForModel,
  hasEnoughContext,
  remainingInputTokens,
  TOKEN_ESTIMATORS,
} from '../token-counter.js';
import type { Model } from '../types.js';

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'test',
    name: 'Test',
    provider: 'test',
    api: 'openai-completions',
    contextWindow: 4096,
    maxOutputTokens: 1024,
    cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    ...overrides,
  };
}

describe('countChars', () => {
  it('区分 CJK / latin / other', () => {
    const r = countChars('你好ab!');
    expect(r.cjk).toBe(2);
    expect(r.latin).toBe(2); // a, b
    expect(r.other).toBeGreaterThanOrEqual(1); // ! 至少 1
  });

  it('空字符串返回全零', () => {
    expect(countChars('')).toEqual({ cjk: 0, latin: 0, other: 0 });
  });
});

describe('estimateTokensForText', () => {
  it('英文按 4 字符/token 估算', () => {
    const tokens = estimateTokensForText('abcdefgh', 'openai-completions');
    // 8 latin / 4 = 2
    expect(tokens).toBe(2);
  });

  it('中文按 1.5 token/字符 估算（OpenAI 配置）', () => {
    const tokens = estimateTokensForText('你好', 'openai-completions');
    // 2 cjk * 1.5 = 3
    expect(tokens).toBe(3);
  });

  it('Qwen 配置中文比例更低（1.0 token/字符）', () => {
    const tokens = estimateTokensForText('你好', 'qwen-chat');
    expect(tokens).toBe(2);
  });

  it('未指定 API 使用默认配置', () => {
    const tokens = estimateTokensForText('hello');
    expect(tokens).toBeGreaterThan(0);
  });

  it('空字符串返回 0', () => {
    expect(estimateTokensForText('')).toBe(0);
  });
});

describe('estimateMessageTokens', () => {
  it('包含 role + content + overhead', () => {
    const tokens = estimateMessageTokens({ role: 'user', content: 'hello' }, 'openai-completions');
    // role 'user' 4 chars / 4 = 1, content 'hello' 5 chars / 4 ≈ 2, overhead 4
    expect(tokens).toBeGreaterThan(4);
  });
});

describe('countMessageTokens', () => {
  it('汇总多条消息并加 base overhead', () => {
    const total = countMessageTokens(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
      'openai-completions',
    );
    expect(total).toBeGreaterThan(5);
  });
});

describe('estimateTokensForModel', () => {
  it('根据 model.api 选择估算器', () => {
    const model = makeModel({ api: 'qwen-chat' });
    const tokens = estimateTokensForModel('你好', model);
    expect(tokens).toBe(2); // qwen 中文 1.0 token/char
  });
});

describe('hasEnoughContext', () => {
  it('小上下文 + 短消息返回 true', () => {
    const model = makeModel({ contextWindow: 4096 });
    expect(hasEnoughContext(model, [{ role: 'user', content: 'hi' }])).toBe(true);
  });

  it('上下文不足返回 false', () => {
    const model = makeModel({ contextWindow: 100, maxOutputTokens: 50 });
    const longMsg = { role: 'user', content: 'a'.repeat(1000) };
    expect(hasEnoughContext(model, [longMsg])).toBe(false);
  });
});

describe('remainingInputTokens', () => {
  it('剩余 = contextWindow - used - reservedOutput', () => {
    const model = makeModel({ contextWindow: 1000, maxOutputTokens: 200 });
    const remaining = remainingInputTokens(model, [{ role: 'user', content: 'hi' }]);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThan(800);
  });

  it('不会返回负数', () => {
    const model = makeModel({ contextWindow: 50, maxOutputTokens: 100 });
    const remaining = remainingInputTokens(model, [{ role: 'user', content: 'a'.repeat(100) }]);
    expect(remaining).toBe(0);
  });
});

describe('TOKEN_ESTIMATORS', () => {
  it('包含所有主要 API 的配置', () => {
    expect(TOKEN_ESTIMATORS['openai-completions']).toBeDefined();
    expect(TOKEN_ESTIMATORS['anthropic-messages']).toBeDefined();
    expect(TOKEN_ESTIMATORS['google-gemini']).toBeDefined();
    expect(TOKEN_ESTIMATORS['qwen-chat']?.cjkTokensPerChar).toBeLessThan(
      TOKEN_ESTIMATORS['openai-completions']!.cjkTokensPerChar,
    );
  });
});
