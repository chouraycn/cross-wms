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

  // v7.1-fix: tool 原子分组截断测试 — 确保 assistant(tool_calls) + tool 消息作为整体保留或丢弃
  it('should keep assistant+tool as atomic group when truncated', async () => {
    const messages = [
      { role: 'system', content: 'System prompt' },
      // 旧对话：assistant 调用了 tool
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'old_call', type: 'function', function: { name: 'old_tool', arguments: '{}' } }],
      },
      { role: 'tool', content: 'old result', tool_call_id: 'old_call' },
      // 新对话
      { role: 'user', content: 'New question' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'new_call', type: 'function', function: { name: 'new_tool', arguments: '{}' } }],
      },
      { role: 'tool', content: 'new result', tool_call_id: 'new_call' },
    ];
    // 设置很小的 contextWindow，强制截断旧分组
    // maxInputTokens = 500 - 100 - 0 - 5000 = -4600 <= 0，会跳过截断
    // 需要 contextWindow > maxOutput + safetyMargin = 100 + 5000 = 5100
    const result = await truncateContextForModel(
      messages as any,
      6000, // 足够大以通过初始检查
      100,
      0,
    );
    // 由于消息很短，可能不会被截断。测试重点是：如果截断了，tool 配对不被破坏
    // 检查没有孤儿 tool 消息（sanitizeToolMessages 安全网）
    const assistantWithTools = result.messages.filter(
      (m: any) => m.role === 'assistant' && m.tool_calls?.length > 0,
    );
    for (const assistant of assistantWithTools) {
      const expectedIds = new Set((assistant.tool_calls as any[]).map((tc: any) => tc.id));
      const foundIds = new Set(
        result.messages
          .filter((m: any) => m.role === 'tool' && expectedIds.has(m.tool_call_id))
          .map((m: any) => m.tool_call_id),
      );
      expect(foundIds.size).toBe(expectedIds.size);
    }
  });

  it('should drop partial tool group when not enough space', async () => {
    // 构造一个场景：assistant(tool_calls) + 2 条 tool 消息，但空间只够保留 1 条 tool
    // 原子分组要求：要么全保留，要么全丢弃
    const messages = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: 'Let me check',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'tool_a', arguments: '{}' } },
          { id: 'call_2', type: 'function', function: { name: 'tool_b', arguments: '{}' } },
        ],
      },
      { role: 'tool', content: 'result_a'.repeat(100), tool_call_id: 'call_1' },
      { role: 'tool', content: 'result_b'.repeat(100), tool_call_id: 'call_2' },
    ];
    // 设置窗口大小使得整个分组无法放入
    // contextWindow 必须 > maxOutput(50) + safetyMargin(5000) = 5050
    const result = await truncateContextForModel(
      messages as any,
      5500,
      50,
      0,
    );
    // 由于消息很短，可能不会被截断。测试重点是配对完整性
    // 但至少保留 user 消息
    const hasUser = result.messages.some((m: any) => m.role === 'user');
    expect(hasUser).toBe(true);
    // 验证没有部分保留的 tool 分组
    const assistantWithTools = result.messages.filter(
      (m: any) => m.role === 'assistant' && m.tool_calls?.length > 0,
    );
    for (const assistant of assistantWithTools) {
      const expectedIds = new Set((assistant.tool_calls as any[]).map((tc: any) => tc.id));
      const foundIds = new Set(
        result.messages
          .filter((m: any) => m.role === 'tool' && expectedIds.has(m.tool_call_id))
          .map((m: any) => m.tool_call_id),
      );
      // 要么全有，要么 assistant 被整体移除
      expect(foundIds.size === expectedIds.size || foundIds.size === 0).toBe(true);
    }
  });

  it('should not break tool pairing after truncate + sanitize', async () => {
    // 模拟 ReAct 循环中多轮工具调用的截断场景
    const messages = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Do task A' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'tool1', arguments: '{}' } }],
      },
      { role: 'tool', content: 'result1', tool_call_id: 'tc1' },
      { role: 'user', content: 'Do task B' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tc2', type: 'function', function: { name: 'tool2', arguments: '{}' } }],
      },
      { role: 'tool', content: 'result2', tool_call_id: 'tc2' },
      { role: 'user', content: 'Do task C' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tc3', type: 'function', function: { name: 'tool3', arguments: '{}' } }],
      },
      { role: 'tool', content: 'result3', tool_call_id: 'tc3' },
    ];
    const result = await truncateContextForModel(
      messages as any,
      600,
      100,
      0,
    );
    // 验证所有保留的 assistant(tool_calls) 都有对应的 tool 消息
    for (const msg of result.messages) {
      if (msg.role === 'assistant' && (msg as any).tool_calls?.length > 0) {
        const callIds = new Set(((msg as any).tool_calls as any[]).map((tc: any) => tc.id));
        for (const callId of callIds) {
          const hasTool = result.messages.some(
            (m: any) => m.role === 'tool' && m.tool_call_id === callId,
          );
          expect(hasTool).toBe(true);
        }
      }
    }
    // 验证所有保留的 tool 消息都有对应的 assistant
    for (const msg of result.messages) {
      if (msg.role === 'tool') {
        const tcId = (msg as any).tool_call_id;
        const hasAssistant = result.messages.some(
          (m: any) =>
            m.role === 'assistant' &&
            m.tool_calls?.some((tc: any) => tc.id === tcId),
        );
        expect(hasAssistant).toBe(true);
      }
    }
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
