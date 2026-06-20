import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateMessagesTokens,
  truncateContextForModel,
  sanitizeToolMessages,
} from '../contextTruncate.js';

describe('estimateTokens', () => {
  it('should estimate ASCII text', () => {
    const tokens = estimateTokens('hello world');
    expect(tokens).toBeGreaterThan(0);
  });

  it('should estimate CJK text higher', () => {
    const asciiTokens = estimateTokens('hello');
    const cjkTokens = estimateTokens('你好世界');
    expect(cjkTokens).toBeGreaterThan(asciiTokens);
  });

  it('should estimate JSON punctuation higher', () => {
    const textTokens = estimateTokens('hello world');
    const jsonTokens = estimateTokens('{"key":"value"}');
    expect(jsonTokens).toBeGreaterThan(textTokens);
  });

  it('should handle empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should handle mixed content', () => {
    const tokens = estimateTokens('Hello 世界 {"key": "value"}');
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('estimateMessagesTokens', () => {
  it('should estimate basic messages', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];
    const tokens = estimateMessagesTokens(messages as any);
    expect(tokens).toBeGreaterThan(0);
  });

  it('should estimate messages with tool_calls', () => {
    const messages = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: '1', type: 'function', function: { name: 'test', arguments: '{"a":1}' } },
        ],
      },
    ];
    const tokens = estimateMessagesTokens(messages as any);
    expect(tokens).toBeGreaterThan(0);
  });

  it('should estimate tool messages', () => {
    const messages = [
      { role: 'tool', content: '{"result":"ok"}', tool_call_id: '1' },
    ];
    const tokens = estimateMessagesTokens(messages as any);
    expect(tokens).toBeGreaterThan(0);
  });

  it('should return 0 for empty messages', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});

describe('truncateContextForModel', () => {
  it('should not truncate when under limit', async () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
    ];
    const result = await truncateContextForModel(
      messages as any,
      128000,
      4096,
      0,
    );
    expect(result.messages).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it('should truncate system messages when over limit', async () => {
    // 使用 CJK 字符增加 token 密度（每个字符约 1.5 tokens）
    // 需要足够多的 tokens 来超过 maxInputTokens = contextWindow - maxOutput - safetyMargin(5000)
    const longContent = '你好世界'.repeat(15000); // ~90000 tokens
    const messages = [
      { role: 'system', content: longContent },
      { role: 'user', content: 'Hello' },
    ];
    // contextWindow 必须 > maxOutputTokens + safetyMargin(5000) 才会触发截断
    const result = await truncateContextForModel(
      messages as any,
      32000,
      4096,
      0,
    );
    expect(result.truncated).toBe(true);
    // system 消息被截断内容，但消息数不变（仍然是 2 条）
    expect(result.messages.length).toBe(2);
    expect((result.messages[0] as any).content.length).toBeLessThan(longContent.length);
  });

  it('should preserve user and assistant messages', async () => {
    const messages = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'User message' },
      { role: 'assistant', content: 'Assistant response' },
    ];
    const result = await truncateContextForModel(
      messages as any,
      128000,
      4096,
      0,
    );
    const roles = result.messages.map((m: any) => m.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
  });
});

describe('sanitizeToolMessages', () => {
  it('should pass through normal messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];
    const result = sanitizeToolMessages(messages as any);
    expect(result).toHaveLength(2);
  });

  it('should remove assistant with tool_calls but no tool responses', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: '1', type: 'function', function: { name: 'test', arguments: '{}' } }],
      },
    ];
    const result = sanitizeToolMessages(messages as any);
    expect(result.length).toBe(1);
    expect(result[0].role).toBe('user');
  });

  it('should keep assistant with tool_calls when tools respond', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: '1', type: 'function', function: { name: 'test', arguments: '{}' } }],
      },
      { role: 'tool', content: 'result', tool_call_id: '1' },
    ];
    const result = sanitizeToolMessages(messages as any);
    expect(result).toHaveLength(3);
  });

  it('should remove orphan tool messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'tool', content: 'orphan result', tool_call_id: '999' },
    ];
    const result = sanitizeToolMessages(messages as any);
    expect(result).toHaveLength(1);
  });

  it('should handle empty tool_calls array', () => {
    const messages = [
      { role: 'assistant', content: 'Hi', tool_calls: [] },
    ];
    const result = sanitizeToolMessages(messages as any);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
  });

  it('should handle assistant with content and tool_calls', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: 'Let me check',
        tool_calls: [{ id: '1', type: 'function', function: { name: 'test', arguments: '{}' } }],
      },
      { role: 'tool', content: 'result', tool_call_id: '1' },
    ];
    const result = sanitizeToolMessages(messages as any);
    expect(result).toHaveLength(3);
    expect((result[1] as any).content).toBe('Let me check');
  });
});
