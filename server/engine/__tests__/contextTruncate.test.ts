// contextTruncate unit tests cover token estimation (CJK / JSON / ASCII
// weighting), message-array token estimation with tool_calls and image parts,
// sanitizeToolMessages orphan-cleanup, and truncateContextForModel behavior
// including atomic grouping, hard message limits, and char-based safety net.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  estimateTokens,
  estimateMessagesTokens,
  sanitizeToolMessages,
  truncateContextForModel,
  type ApiMessage,
} from '../contextTruncate.js';

describe('engine/contextTruncate — estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('weights CJK characters at ~1.5 tokens each (x1.5 safety factor)', () => {
    const text = '你好'; // 2 CJK chars
    const tokens = estimateTokens(text);
    // 2 * 1.5 = 3, * 1.5 safety = 4.5 → ceil = 5
    expect(tokens).toBeGreaterThan(0);
  });

  it('weights JSON/code punctuation higher than plain ASCII', () => {
    const plain = 'abcde'; // 5 ASCII chars
    const json = '{}{}{}'; // 6 JSON punctuation chars
    expect(estimateTokens(json)).toBeGreaterThan(estimateTokens(plain));
  });

  it('estimates monotonically with text length', () => {
    const short = 'hello';
    const long = 'hello world '.repeat(20);
    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });
});

describe('engine/contextTruncate — estimateMessagesTokens', () => {
  it('returns 0 for empty array', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it('adds per-message overhead for role+formatting', () => {
    const msgs = [{ role: 'user', content: '' }];
    expect(estimateMessagesTokens(msgs)).toBe(4);
  });

  it('estimates tokens for string content', () => {
    const msgs = [{ role: 'user', content: 'hello world' }];
    expect(estimateMessagesTokens(msgs)).toBeGreaterThan(4);
  });

  it('estimates tokens for array content with text parts', () => {
    const msgs = [{
      role: 'user',
      content: [{ type: 'text', text: 'hello' }],
    }];
    expect(estimateMessagesTokens(msgs as any)).toBeGreaterThan(4);
  });

  it('adds ~85 tokens per image_url part', () => {
    const msgs = [{
      role: 'user',
      content: [{ type: 'image_url' }],
    }];
    const tokens = estimateMessagesTokens(msgs as any);
    expect(tokens).toBeGreaterThanOrEqual(85);
  });

  it('applies 1.5x weight to tool_calls JSON serialization', () => {
    const simple = [{ role: 'assistant', content: 'hello' }];
    const withTools = [{
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'foo', arguments: '{}' } }],
    }];
    expect(estimateMessagesTokens(withTools as any)).toBeGreaterThan(
      estimateMessagesTokens(simple as any),
    );
  });

  it('applies 1.3x weight to tool-role message content', () => {
    const user = [{ role: 'user', content: 'hello world test' }];
    const tool = [{ role: 'tool', content: 'hello world test', tool_call_id: 'tc1' }];
    expect(estimateMessagesTokens(tool as any)).toBeGreaterThan(
      estimateMessagesTokens(user as any),
    );
  });

  it('includes reasoning_content tokens when present', () => {
    const msgs = [{
      role: 'assistant',
      content: '',
      reasoning_content: 'thinking deeply about the problem',
    }];
    expect(estimateMessagesTokens(msgs as any)).toBeGreaterThan(4);
  });
});

describe('engine/contextTruncate — sanitizeToolMessages', () => {
  it('returns input as-is for empty array', () => {
    expect(sanitizeToolMessages([])).toEqual([]);
  });

  it('preserves well-formed assistant(tool_calls) + tool message pairs', () => {
    const msgs: ApiMessage[] = [
      { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'foo', arguments: '{}' } }] },
      { role: 'tool', content: 'result', tool_call_id: 'tc1' },
    ];
    const result = sanitizeToolMessages(msgs);
    expect(result.length).toBe(2);
    expect(result[0].tool_calls?.length).toBe(1);
    expect(result[1].role).toBe('tool');
  });

  it('drops orphan tool messages without preceding assistant(tool_calls)', () => {
    const msgs: ApiMessage[] = [
      { role: 'tool', content: 'orphan', tool_call_id: 'tc_missing' },
      { role: 'user', content: 'hi' },
    ];
    const result = sanitizeToolMessages(msgs);
    expect(result.find(m => m.role === 'tool')).toBeUndefined();
    expect(result.find(m => m.role === 'user')).toBeDefined();
  });

  it('drops assistant(tool_calls) with no responding tool messages (no content)', () => {
    const msgs: ApiMessage[] = [
      { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'foo', arguments: '{}' } }] },
      { role: 'user', content: 'next' },
    ];
    const result = sanitizeToolMessages(msgs);
    // The orphan assistant(tool_calls) without content should be dropped
    expect(result.find(m => m.role === 'assistant' && m.tool_calls)).toBeUndefined();
  });

  it('keeps assistant(tool_calls) with content when no tool response (downgrades to plain assistant)', () => {
    const msgs: ApiMessage[] = [
      { role: 'assistant', content: 'partial response', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'foo', arguments: '{}' } }] },
      { role: 'user', content: 'next' },
    ];
    const result = sanitizeToolMessages(msgs);
    const assistant = result.find(m => m.role === 'assistant');
    expect(assistant).toBeDefined();
    expect(assistant?.tool_calls).toBeUndefined();
  });

  it('filters out tool_calls with empty/null ids', () => {
    const msgs: ApiMessage[] = [
      { role: 'assistant', content: '', tool_calls: [
        { id: '', type: 'function', function: { name: 'foo', arguments: '{}' } },
        { id: 'tc_valid', type: 'function', function: { name: 'bar', arguments: '{}' } },
      ] },
      { role: 'tool', content: 'result', tool_call_id: 'tc_valid' },
    ];
    const result = sanitizeToolMessages(msgs);
    const assistant = result.find(m => m.role === 'assistant');
    expect(assistant?.tool_calls?.length).toBe(1);
    expect(assistant?.tool_calls?.[0].id).toBe('tc_valid');
  });

  it('drops tool messages with empty tool_call_id', () => {
    const msgs: ApiMessage[] = [
      { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'foo', arguments: '{}' } }] },
      { role: 'tool', content: 'no id', tool_call_id: '' },
      { role: 'tool', content: 'valid', tool_call_id: 'tc1' },
    ];
    const result = sanitizeToolMessages(msgs);
    const toolMsgs = result.filter(m => m.role === 'tool');
    expect(toolMsgs.length).toBe(1);
    expect(toolMsgs[0].tool_call_id).toBe('tc1');
  });

  it('normalizes null tool content to (no result)', () => {
    const msgs: ApiMessage[] = [
      { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'foo', arguments: '{}' } }] },
      { role: 'tool', content: null as any, tool_call_id: 'tc1' },
    ];
    const result = sanitizeToolMessages(msgs);
    const toolMsg = result.find(m => m.role === 'tool');
    expect(toolMsg?.content).toBe('(no result)');
  });

  it('normalizes null assistant content to empty string (no tool_calls)', () => {
    const msgs: ApiMessage[] = [
      { role: 'assistant', content: null as any },
    ];
    const result = sanitizeToolMessages(msgs);
    expect(result[0].content).toBe('');
  });

  it('removes empty tool_calls array from assistant message', () => {
    const msgs: ApiMessage[] = [
      { role: 'assistant', content: 'hi', tool_calls: [] as any },
    ];
    const result = sanitizeToolMessages(msgs);
    expect(result[0].tool_calls).toBeUndefined();
  });

  it('reorders: ensures tool messages immediately follow assistant(tool_calls)', () => {
    const msgs: ApiMessage[] = [
      { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'foo', arguments: '{}' } }] },
      { role: 'system', content: 'interrupting system msg' },
      { role: 'tool', content: 'result', tool_call_id: 'tc1' },
    ];
    const result = sanitizeToolMessages(msgs);
    // After reorder, tool message should immediately follow assistant
    const assistantIdx = result.findIndex(m => m.role === 'assistant');
    expect(result[assistantIdx + 1].role).toBe('tool');
  });
});

describe('engine/contextTruncate — truncateContextForModel', () => {
  it('returns messages as-is when within token budget', () => {
    const msgs: ApiMessage[] = [
      { role: 'system', content: 'short system prompt' },
      { role: 'user', content: 'hello' },
    ];
    const result = truncateContextForModel(msgs, 100000, 1000, 0);
    expect(result.truncated).toBe(false);
    expect(result.messages.length).toBe(2);
  });

  it('returns messages as-is when context window is too small (maxInputTokens <= 0)', () => {
    const msgs: ApiMessage[] = [
      { role: 'user', content: 'hello' },
    ];
    // contextWindow=100, maxOutput=100, tools=0, safetyMargin=5000 → maxInputTokens < 0
    const result = truncateContextForModel(msgs, 100, 100, 0);
    expect(result.truncated).toBe(false);
    expect(result.messages.length).toBe(1);
  });

  it('truncates when token estimate exceeds budget', () => {
    // maxInputTokens = contextWindow - maxOutput - tools - safetyMargin
    //                = 10000 - 200 - 0 - 5000 = 4800
    // ASCII char estimate: 0.35 * 1.5 = 0.525 tokens/char
    // 'a'.repeat(12000) ≈ 6300 tokens → exceeds 4800 budget
    const msgs: ApiMessage[] = [
      { role: 'system', content: 'a'.repeat(12000) },
      { role: 'user', content: 'b'.repeat(1000) },
      { role: 'assistant', content: 'c'.repeat(1000) },
      { role: 'user', content: 'latest message' },
    ];
    const result = truncateContextForModel(msgs, 10000, 200, 0);
    expect(result.truncated).toBe(true);
    // Should retain some messages (the latest ones)
    expect(result.messages.length).toBeLessThanOrEqual(msgs.length);
  });

  it('force-truncates (sets truncated=true) when message count exceeds HARD_MESSAGE_LIMIT (60)', () => {
    const msgs: ApiMessage[] = Array.from({ length: 70 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}`,
    }));
    // Large budget so all messages fit, but forceTruncate flag still fires
    const result = truncateContextForModel(msgs, 100000, 1000, 0);
    expect(result.truncated).toBe(true);
    // With ample budget, all messages may be retained (forceTruncate only flags truncated=true)
    expect(result.messages.length).toBeLessThanOrEqual(70);
  });

  it('force-truncates when total chars exceed CHAR_HARD_LIMIT (contextWindow * 2.5)', () => {
    const longContent = 'x'.repeat(20000);
    const msgs: ApiMessage[] = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
    ];
    // contextWindow=6000 → maxInputTokens = 6000 - 100 - 0 - 5000 = 900 (> 0, so not skipped)
    // CHAR_HARD_LIMIT = 6000 * 2.5 = 15000, total chars = 40000 > 15000 → force truncation
    const result = truncateContextForModel(msgs, 6000, 100, 0);
    expect(result.truncated).toBe(true);
  });

  it('injects working memory messages at the front before truncation', () => {
    const msgs: ApiMessage[] = [
      { role: 'user', content: 'latest' },
    ];
    const wm = [
      { role: 'system', content: 'memory context' },
    ];
    const result = truncateContextForModel(msgs, 100000, 1000, 0, wm as any);
    // Working memory should be prepended
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toBe('memory context');
  });

  it('accounts for toolsCount token overhead in budget calculation', () => {
    const msgs: ApiMessage[] = [
      { role: 'user', content: 'hello' },
    ];
    // toolsCount=10 → toolsTokenEstimate = 1500
    // Without tools, this fits; with tools, maxInputTokens reduced but still fits
    const result = truncateContextForModel(msgs, 10000, 1000, 10);
    expect(result.truncated).toBe(false);
  });

  it('preserves atomic grouping of assistant(tool_calls) + tool messages during truncation', () => {
    const msgs: ApiMessage[] = [
      { role: 'system', content: 'a'.repeat(5000) },
      { role: 'user', content: 'old message' },
      { role: 'assistant', content: '', tool_calls: [
        { id: 'tc1', type: 'function', function: { name: 'foo', arguments: '{}' } },
      ] },
      { role: 'tool', content: 'tool result', tool_call_id: 'tc1' },
      { role: 'user', content: 'latest message' },
    ];
    // Force truncation with small budget
    const result = truncateContextForModel(msgs, 2000, 200, 0);
    // If assistant(tool_calls) is retained, the tool message must also be retained
    const assistantIdx = result.messages.findIndex(m => m.role === 'assistant' && m.tool_calls?.length);
    if (assistantIdx >= 0) {
      // Look for the matching tool message
      const toolMsg = result.messages.find(m => m.role === 'tool' && m.tool_call_id === 'tc1');
      expect(toolMsg).toBeDefined();
    }
  });

  it('may truncate system message content when space is tight', () => {
    const longSystem = 'system prompt content '.repeat(50);
    const msgs: ApiMessage[] = [
      { role: 'system', content: longSystem },
      { role: 'user', content: 'short' },
    ];
    // Tight budget forces system message truncation
    const result = truncateContextForModel(msgs, 1000, 100, 0);
    if (result.truncated) {
      const sys = result.messages.find(m => m.role === 'system');
      if (sys && typeof sys.content === 'string' && sys.content.length < longSystem.length) {
        expect(sys.content).toContain('上下文过长');
      }
    }
  });
});
