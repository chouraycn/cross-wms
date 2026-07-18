/**
 * message-transform 测试 — 不同 Provider 间的消息格式转换。
 */
import { describe, it, expect } from 'vitest';
import {
  transformMessages,
  toOpenAIMessages,
  toAnthropicMessages,
  toGeminiContents,
  fromOpenAIMessages,
  fromAnthropicMessages,
  truncateMessages,
  estimateTokens,
  countMessagesTokens,
  fromCompleteOptions,
} from '../message-transform.js';

describe('transformMessages', () => {
  it('OpenAI 兼容 API 保留 system 在 messages 数组首位', () => {
    const result = transformMessages(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'u' },
      ],
      'openai-completions',
    );
    expect(result.kind).toBe('openai');
    if (result.kind === 'openai') {
      expect(result.messages[0]).toEqual({ role: 'system', content: 'sys' });
      expect(result.messages[1]).toEqual({ role: 'user', content: 'u' });
    }
  });

  it('Anthropic API 将 system 抽到顶层', () => {
    const result = transformMessages(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'u' },
      ],
      'anthropic-messages',
    );
    expect(result.kind).toBe('anthropic');
    if (result.kind === 'anthropic') {
      expect(result.system).toBe('sys');
      expect(result.messages).toEqual([{ role: 'user', content: 'u' }]);
    }
  });

  it('Gemini API 将 system 转为 systemInstruction，assistant 转为 model', () => {
    const result = transformMessages(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'u' },
        { role: 'assistant', content: 'a' },
      ],
      'google-gemini',
    );
    expect(result.kind).toBe('gemini');
    if (result.kind === 'gemini') {
      expect(result.systemInstruction).toBe('sys');
      expect(result.contents[0].role).toBe('user');
      expect(result.contents[1].role).toBe('model');
    }
  });

  it('Bedrock 走 Anthropic 格式', () => {
    const result = transformMessages(
      [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }],
      'aws-bedrock',
    );
    expect(result.kind).toBe('bedrock-anthropic');
  });

  it('Ollama 走 OpenAI 兼容格式', () => {
    const result = transformMessages(
      [{ role: 'user', content: 'u' }],
      'ollama',
    );
    expect(result.kind).toBe('openai');
  });
});

describe('toAnthropicMessages', () => {
  it('tool 角色合并到 user', () => {
    const { system, messages } = toAnthropicMessages([
      { role: 'user', content: 'q' },
      { role: 'tool', content: 'r', toolName: 'search' },
    ]);
    expect(system).toBe('');
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('search');
    expect(messages[1].content).toContain('r');
  });

  it('多个 system 消息用双换行连接', () => {
    const { system } = toAnthropicMessages([
      { role: 'system', content: 's1' },
      { role: 'system', content: 's2' },
    ]);
    expect(system).toBe('s1\n\ns2');
  });
});

describe('toGeminiContents', () => {
  it('tool 消息转为 functionResponse 部件', () => {
    const { contents } = toGeminiContents([
      { role: 'tool', content: 'result', toolName: 'calc' },
    ]);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0]).toHaveProperty('functionResponse');
  });
});

describe('反向转换', () => {
  it('fromOpenAIMessages 还原 tool_call_id 与 name', () => {
    const msgs = fromOpenAIMessages([
      { role: 'tool', content: 'r', tool_call_id: 'tc1', name: 'search' },
    ]);
    expect(msgs[0].toolCallId).toBe('tc1');
    expect(msgs[0].toolName).toBe('search');
  });

  it('fromAnthropicMessages 将 system 前置', () => {
    const msgs = fromAnthropicMessages('sys', [{ role: 'user', content: 'u' }]);
    expect(msgs[0]).toEqual({ role: 'system', content: 'sys' });
    expect(msgs[1]).toEqual({ role: 'user', content: 'u' });
  });
});

describe('estimateTokens 与截断', () => {
  it('中英文混合 token 估算', () => {
    expect(estimateTokens('hello world')).toBeGreaterThan(0);
    expect(estimateTokens('你好世界')).toBeGreaterThan(0);
    // 中文 token 比例应高于同长度英文
    const en = estimateTokens('aaaaaaaaaa');
    const zh = estimateTokens('啊啊啊啊啊啊啊啊啊啊');
    expect(zh).toBeGreaterThan(en);
  });

  it('countMessagesTokens 汇总多条消息', () => {
    const total = countMessagesTokens([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]);
    expect(total).toBeGreaterThan(0);
  });

  it('truncateMessages 保留 system 与最近消息', () => {
    const msgs = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'a'.repeat(100) },
      { role: 'assistant', content: 'b'.repeat(100) },
      { role: 'user', content: 'c'.repeat(100) },
    ];
    const truncated = truncateMessages(msgs, 50);
    expect(truncated[0].role).toBe('system');
    // 末尾的 'c' 消息应被保留
    expect(truncated[truncated.length - 1].content).toMatch(/^c+$/);
  });

  it('fromCompleteOptions 从 CompleteOptions 提取', () => {
    const unified = fromCompleteOptions({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(unified).toEqual([{ role: 'user', content: 'hi' }]);
  });
});
