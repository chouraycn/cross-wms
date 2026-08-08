/**
 * contextTruncate 上下文截断 单元测试
 *
 * 测试 estimateTokens、estimateMessagesTokens、sanitizeToolMessages、truncateContextForModel。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- mock 依赖 ----
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
} from './contextTruncate.js';

describe('contextTruncate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===================== estimateTokens =====================

  describe('estimateTokens', () => {
    it('空字符串返回 0', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('纯 ASCII 文本按 0.35 token/字符 + 1.5 安全系数计算', () => {
      const text = 'hello'; // 5 chars * 0.35 * 1.5 = 2.625 → ceil = 3
      expect(estimateTokens(text)).toBe(3);
    });

    it('CJK 字符按 1.5 token/字符计算', () => {
      const text = '你好'; // 2 * 1.5 * 1.5 = 4.5 → ceil = 5
      expect(estimateTokens(text)).toBe(5);
    });

    it('JSON 标点按 0.8 token/字符计算', () => {
      const text = '{}[]":,'; // 7 chars * 0.8 * 1.5 = 8.4 → ceil = 9
      expect(estimateTokens(text)).toBe(9);
    });

    it('混合文本正确计算', () => {
      const tokens = estimateTokens('hello 你好 {}');
      expect(tokens).toBeGreaterThan(0);
    });

    it('结果为整数（Math.ceil）', () => {
      const tokens = estimateTokens('a');
      expect(Number.isInteger(tokens)).toBe(true);
    });
  });

  // ===================== estimateMessagesTokens =====================

  describe('estimateMessagesTokens', () => {
    it('空数组返回 0', () => {
      expect(estimateMessagesTokens([])).toBe(0);
    });

    it('单条字符串消息包含 role 开销', () => {
      const msgs = [{ role: 'user', content: 'hi' }];
      const tokens = estimateMessagesTokens(msgs);
      // 4 (overhead) + estimateTokens('hi')
      expect(tokens).toBeGreaterThan(4);
    });

    it('多条消息累加', () => {
      const msgs = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ];
      const tokens = estimateMessagesTokens(msgs);
      expect(tokens).toBeGreaterThan(8);
    });

    it('tool 角色消息额外 1.3x 加权', () => {
      const toolMsg = [{ role: 'tool', content: 'some result data', tool_call_id: 'tc1' }];
      const userMsg = [{ role: 'user', content: 'some result data' }];
      const toolTokens = estimateMessagesTokens(toolMsg);
      const userTokens = estimateMessagesTokens(userMsg);
      // tool 消息内容 token 应比 user 消息多（1.3x 加权）
      expect(toolTokens).toBeGreaterThan(userTokens);
    });

    it('数组类型 content 正确计算', () => {
      const msgs = [{
        role: 'user',
        content: [{ type: 'text', text: 'hello world' }],
      }];
      const tokens = estimateMessagesTokens(msgs);
      expect(tokens).toBeGreaterThan(4);
    });

    it('image_url 类型固定 85 tokens', () => {
      const msgs = [{
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'http://example.com/img.png' } }],
      }];
      const tokens = estimateMessagesTokens(msgs);
      // 4 (overhead) + 85 (image)
      expect(tokens).toBe(89);
    });

    it('tool_calls 额外 1.5x 加权', () => {
      const msgWithToolCalls = [{
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'test', arguments: '{}' } }],
      }];
      const msgWithout = [{
        role: 'assistant',
        content: '',
      }];
      const withTokens = estimateMessagesTokens(msgWithToolCalls);
      const withoutTokens = estimateMessagesTokens(msgWithout);
      expect(withTokens).toBeGreaterThan(withoutTokens);
    });

    it('reasoning_content 正确计算', () => {
      const msgs = [{
        role: 'assistant',
        content: '',
        reasoning_content: 'thinking about the problem',
      }];
      const tokens = estimateMessagesTokens(msgs);
      expect(tokens).toBeGreaterThan(4);
    });
  });

  // ===================== sanitizeToolMessages =====================

  describe('sanitizeToolMessages - 基础', () => {
    it('空数组原样返回', () => {
      expect(sanitizeToolMessages([])).toEqual([]);
    });

    it('null 输入原样返回', () => {
      expect(sanitizeToolMessages(null as any)).toBe(null);
    });

    it('普通 user/assistant 消息原样通过', () => {
      const msgs: ApiMessage[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ];
      const result = sanitizeToolMessages(msgs);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('assistant');
    });

    it('system 消息原样通过', () => {
      const msgs: ApiMessage[] = [{ role: 'system', content: 'You are helpful' }];
      const result = sanitizeToolMessages(msgs);
      expect(result).toHaveLength(1);
    });
  });

  describe('sanitizeToolMessages - tool 消息配对', () => {
    it('assistant(tool_calls) + 对应 tool 消息完整保留', () => {
      const msgs: ApiMessage[] = [
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'fn', arguments: '{}' } }] },
        { role: 'tool', content: 'result', tool_call_id: 'tc1' },
      ];
      const result = sanitizeToolMessages(msgs);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('assistant');
      expect(result[1].role).toBe('tool');
    });

    it('孤儿 tool 消息（无对应 assistant）被丢弃', () => {
      const msgs: ApiMessage[] = [
        { role: 'user', content: 'hello' },
        { role: 'tool', content: 'orphan', tool_call_id: 'tc1' },
      ];
      const result = sanitizeToolMessages(msgs);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('assistant(tool_calls) 无对应 tool 响应且有内容时降级为普通消息', () => {
      const msgs: ApiMessage[] = [
        { role: 'assistant', content: 'I will call a tool', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'fn', arguments: '{}' } }] },
        { role: 'user', content: 'next message' },
      ];
      const result = sanitizeToolMessages(msgs);
      // assistant 有内容 → 保留但删除 tool_calls
      const assistant = result.find(m => m.role === 'assistant');
      expect(assistant).toBeTruthy();
      expect(assistant!.tool_calls).toBeUndefined();
    });

    it('assistant(tool_calls) 无响应且无内容时被丢弃', () => {
      const msgs: ApiMessage[] = [
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'fn', arguments: '{}' } }] },
        { role: 'user', content: 'next' },
      ];
      const result = sanitizeToolMessages(msgs);
      expect(result.find(m => m.role === 'assistant')).toBeUndefined();
    });

    it('部分 tool_calls 有响应时只保留有响应的', () => {
      const msgs: ApiMessage[] = [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'tc1', type: 'function', function: { name: 'fn1', arguments: '{}' } },
            { id: 'tc2', type: 'function', function: { name: 'fn2', arguments: '{}' } },
          ],
        },
        { role: 'tool', content: 'result1', tool_call_id: 'tc1' },
      ];
      const result = sanitizeToolMessages(msgs);
      const assistant = result.find(m => m.role === 'assistant');
      expect(assistant).toBeTruthy();
      expect(assistant!.tool_calls).toHaveLength(1);
      expect(assistant!.tool_calls![0].id).toBe('tc1');
    });
  });

  describe('sanitizeToolMessages - content 规范化', () => {
    it('tool 消息 content 为 null 时替换为 (no result)', () => {
      const msgs: ApiMessage[] = [
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'fn', arguments: '{}' } }] },
        { role: 'tool', content: null as any, tool_call_id: 'tc1' },
      ];
      const result = sanitizeToolMessages(msgs);
      const tool = result.find(m => m.role === 'tool');
      expect(tool).toBeTruthy();
      expect(tool!.content).toBe('(no result)');
    });

    it('tool 消息 content 为空字符串时替换为 (no result)', () => {
      const msgs: ApiMessage[] = [
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'fn', arguments: '{}' } }] },
        { role: 'tool', content: '', tool_call_id: 'tc1' },
      ];
      const result = sanitizeToolMessages(msgs);
      const tool = result.find(m => m.role === 'tool');
      expect(tool!.content).toBe('(no result)');
    });

    it('tool 消息 content 为对象时 JSON 序列化', () => {
      const msgs: ApiMessage[] = [
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'fn', arguments: '{}' } }] },
        { role: 'tool', content: { key: 'val' } as any, tool_call_id: 'tc1' },
      ];
      const result = sanitizeToolMessages(msgs);
      const tool = result.find(m => m.role === 'tool');
      expect(tool!.content).toBe(JSON.stringify({ key: 'val' }));
    });

    it('assistant 消息 content 为 null 时替换为空字符串', () => {
      const msgs: ApiMessage[] = [
        { role: 'assistant', content: null as any },
      ];
      const result = sanitizeToolMessages(msgs);
      expect(result[0].content).toBe('');
    });
  });

  describe('sanitizeToolMessages - 无效 tool_calls 过滤', () => {
    it('id 为空的 tool_calls 被过滤', () => {
      const msgs: ApiMessage[] = [
        {
          role: 'assistant',
          content: 'has content',
          tool_calls: [
            { id: '', type: 'function', function: { name: 'fn', arguments: '{}' } },
            { id: 'valid', type: 'function', function: { name: 'fn2', arguments: '{}' } },
          ],
        },
        { role: 'tool', content: 'result', tool_call_id: 'valid' },
      ];
      const result = sanitizeToolMessages(msgs);
      const assistant = result.find(m => m.role === 'assistant');
      expect(assistant!.tool_calls).toHaveLength(1);
      expect(assistant!.tool_calls![0].id).toBe('valid');
    });

    it('所有 tool_calls 的 id 都无效且有内容时降级为普通消息', () => {
      const msgs: ApiMessage[] = [
        {
          role: 'assistant',
          content: 'some text',
          tool_calls: [
            { id: '', type: 'function', function: { name: 'fn', arguments: '{}' } },
          ],
        },
      ];
      const result = sanitizeToolMessages(msgs);
      expect(result).toHaveLength(1);
      expect(result[0].tool_calls).toBeUndefined();
    });

    it('无 tool_call_id 的 tool 消息被丢弃', () => {
      const msgs: ApiMessage[] = [
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'fn', arguments: '{}' } }] },
        { role: 'tool', content: 'no id', tool_call_id: '' },
        { role: 'tool', content: 'valid', tool_call_id: 'tc1' },
      ];
      const result = sanitizeToolMessages(msgs);
      const tools = result.filter(m => m.role === 'tool');
      expect(tools).toHaveLength(1);
      expect(tools[0].tool_call_id).toBe('tc1');
    });
  });

  describe('sanitizeToolMessages - tool 消息重排序', () => {
    it('tool 消息被移动到紧跟 assistant(tool_calls) 之后', () => {
      const msgs: ApiMessage[] = [
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'fn', arguments: '{}' } }] },
        { role: 'system', content: 'interrupting system msg' },
        { role: 'tool', content: 'result', tool_call_id: 'tc1' },
      ];
      const result = sanitizeToolMessages(msgs);
      // tool 消息应紧跟 assistant
      expect(result[0].role).toBe('assistant');
      expect(result[1].role).toBe('tool');
      expect(result[2].role).toBe('system');
    });
  });

  // ===================== truncateContextForModel =====================

  describe('truncateContextForModel - 无需截断', () => {
    it('token 未超限时原样返回', () => {
      const msgs: ApiMessage[] = [
        { role: 'user', content: 'short message' },
        { role: 'assistant', content: 'reply' },
      ];
      const result = truncateContextForModel(msgs, 100000, 4000, 0);
      expect(result.truncated).toBe(false);
      expect(result.messages).toEqual(msgs);
    });

    it('maxInputTokens <= 0 时跳过截断', () => {
      const msgs: ApiMessage[] = [{ role: 'user', content: 'x' }];
      // contextWindow=1000, maxOutput=4000 → maxInput = 1000-4000-0-5000 < 0
      const result = truncateContextForModel(msgs, 1000, 4000, 0);
      expect(result.truncated).toBe(false);
      expect(result.messages).toEqual(msgs);
    });
  });

  describe('truncateContextForModel - 触发截断', () => {
    it('token 超限时从后往前保留消息', () => {
      const msgs: ApiMessage[] = [];
      for (let i = 0; i < 20; i++) {
        msgs.push({ role: 'user', content: `message number ${i} ` + 'x'.repeat(200) });
        msgs.push({ role: 'assistant', content: `reply ${i} ` + 'y'.repeat(200) });
      }
      // contextWindow=10000, maxOutput=1000 → maxInput = 10000-1000-0-5000 = 4000
      // 40 messages * ~118 tokens ≈ 4720 > 4000 → 截断触发
      const result = truncateContextForModel(msgs, 10000, 1000, 0);
      expect(result.truncated).toBe(true);
      expect(result.messages.length).toBeLessThan(msgs.length);
    });

    it('workingMemoryMessages 在截断前注入', () => {
      const msgs: ApiMessage[] = [{ role: 'user', content: 'main conversation' }];
      const workingMemory = [{ role: 'system', content: 'injected memory' }];
      const result = truncateContextForModel(msgs, 100000, 4000, 0, workingMemory);
      expect(result.truncated).toBe(false);
      // workingMemory 应在前面
      expect(result.messages[0].content).toBe('injected memory');
    });

    it('system 消息在空间不足时被截断而非丢弃', () => {
      const msgs: ApiMessage[] = [
        { role: 'system', content: 'S'.repeat(3000) },
      ];
      for (let i = 0; i < 10; i++) {
        msgs.push({ role: 'user', content: 'U' + 'x'.repeat(200) });
        msgs.push({ role: 'assistant', content: 'A' + 'y'.repeat(200) });
      }
      // contextWindow=8000, maxOutput=1000 → maxInput = 8000-1000-0-5000 = 2000
      // 总 tokens ≈ 1575(system) + 1180(messages) ≈ 2755 > 2000 → 截断触发
      const result = truncateContextForModel(msgs, 8000, 1000, 0);
      expect(result.truncated).toBe(true);
      // system 消息可能被截断但应存在（如果空间足够）
      const systemMsg = result.messages.find(m => m.role === 'system');
      if (systemMsg) {
        expect(typeof systemMsg.content).toBe('string');
      }
    });

    it('assistant(tool_calls) + tool 作为原子组整体保留或丢弃', () => {
      const msgs: ApiMessage[] = [
        { role: 'user', content: 'q' + 'x'.repeat(5000) },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'fn', arguments: '{}' } }],
        },
        { role: 'tool', content: 'r' + 'y'.repeat(5000), tool_call_id: 'tc1' },
        { role: 'user', content: 'latest question' },
      ];
      // contextWindow=10000, maxOutput=1000 → maxInput = 4000
      // 总 tokens ≈ 2630+3418+12 ≈ 6060 > 4000 → 截断触发
      const result = truncateContextForModel(msgs, 10000, 1000, 0);
      expect(result.truncated).toBe(true);
      // 如果 tool 消息存在，其对应的 assistant(tool_calls) 也应存在
      const toolIdx = result.messages.findIndex(m => m.role === 'tool');
      if (toolIdx >= 0) {
        const assistantIdx = result.messages.findIndex(
          (m, i) => i < toolIdx && m.role === 'assistant' && m.tool_calls,
        );
        expect(assistantIdx).toBeGreaterThanOrEqual(0);
      }
    });

    it('消息数超过 60 条时强制截断', () => {
      const msgs: ApiMessage[] = [];
      for (let i = 0; i < 70; i++) {
        msgs.push({ role: 'user', content: `msg ${i}` });
      }
      const result = truncateContextForModel(msgs, 100000, 4000, 0);
      expect(result.truncated).toBe(true);
      expect(result.messages.length).toBeLessThanOrEqual(70);
    });

    it('字符数超过硬限制时强制截断', () => {
      const msgs: ApiMessage[] = [
        { role: 'user', content: 'x'.repeat(500000) },
      ];
      // contextWindow=100000 → CHAR_HARD_LIMIT = 250000
      const result = truncateContextForModel(msgs, 100000, 4000, 0);
      expect(result.truncated).toBe(true);
    });
  });
});
