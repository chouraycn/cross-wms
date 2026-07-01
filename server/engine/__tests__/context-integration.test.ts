/**
 * 上下文系统集成测试
 *
 * 验证：
 * - historySanitizer + contextTruncate 协同工作
 * - 完整上下文处理流水线
 * - 图片消毒 + tool call 规范化 + reasoning 处理
 * - 轮次截断与 token 截断的正确交互
 */

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sanitizeHistoryMessages } from '../historySanitizer.js';
import { truncateContextForModel, estimateMessagesTokens } from '../contextTruncate.js';
import type { ApiMessage } from '../historySanitizer.js';

function makeUserMessage(content: string): ApiMessage {
  return {
    role: 'user',
    content,
  };
}

function makeAssistantMessage(content: string): ApiMessage {
  return {
    role: 'assistant',
    content,
  };
}

function makeSystemMessage(content: string): ApiMessage {
  return {
    role: 'system',
    content,
  };
}

describe('上下文系统集成测试', () => {
  describe('完整处理流水线', () => {
    it('消毒（轮次截断） + token 截断 两步协同工作', () => {
      const messages: ApiMessage[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push(makeUserMessage(`用户消息 ${i}`));
        messages.push(makeAssistantMessage(`助手回复 ${i}`));
      }

      // 第 1 步：消毒（含轮次截断）
      const sanitized = sanitizeHistoryMessages(messages, {
        maxTurns: 10,
        dedupeUserMessages: true,
        mergeConsecutiveUsers: true,
        cleanupEmptyAssistants: true,
      });

      const userCount = sanitized.filter(m => m.role === 'user').length;
      expect(userCount).toBeLessThanOrEqual(10);

      // 第 2 步：token 截断（大窗口不应再截断）
      const truncated = truncateContextForModel(sanitized as any, 32000, 2000, 0);

      expect(truncated.messages.length).toBeGreaterThan(0);
      expect(typeof truncated.truncated).toBe('boolean');
    });

    it('system 消息在轮次截断时应保留', () => {
      const messages: ApiMessage[] = [
        makeSystemMessage('你是一个助手'),
        makeSystemMessage('请礼貌回答'),
      ];
      for (let i = 0; i < 10; i++) {
        messages.push(makeUserMessage(`问题 ${i}`));
        messages.push(makeAssistantMessage(`回答 ${i}`));
      }

      const result = sanitizeHistoryMessages(messages, {
        maxTurns: 3,
      });

      const systemMsgs = result.filter(m => m.role === 'system');
      expect(systemMsgs.length).toBe(2);
    });

    it('token 估算应随消息数量增长', () => {
      const fewMsgs: ApiMessage[] = [makeUserMessage('hi'), makeAssistantMessage('hello')];
      const manyMsgs: ApiMessage[] = [];
      for (let i = 0; i < 50; i++) {
        manyMsgs.push(makeUserMessage(`长消息 ${i}，内容很长很长很长很长很长`));
        manyMsgs.push(makeAssistantMessage(`回复 ${i}，内容也很长很长很长很长很长`));
      }

      const fewTokens = estimateMessagesTokens(fewMsgs as any);
      const manyTokens = estimateMessagesTokens(manyMsgs as any);

      expect(manyTokens).toBeGreaterThan(fewTokens);
      expect(manyTokens).toBeGreaterThan(100);
    });
  });

  describe('消毒模块组合测试', () => {
    it('空消息清理 + tool 配对校验 + 去重 组合', () => {
      const messages: ApiMessage[] = [
        makeUserMessage('你好'),
        {
          role: 'assistant',
          content: '',
        },
        makeUserMessage('你好'),
        makeAssistantMessage('你好！有什么可以帮你的？'),
        {
          role: 'tool',
          tool_call_id: 'call-123',
          content: 'result',
        },
        makeUserMessage('再见'),
      ];

      const result = sanitizeHistoryMessages(messages, {
        cleanupEmptyAssistants: true,
        validateToolPairs: true,
        dedupeUserMessages: true,
      });

      const userMsgs = result.filter(m => m.role === 'user');
      expect(userMsgs.length).toBe(2);

      const orphanTools = result.filter(m => m.role === 'tool');
      expect(orphanTools.length).toBe(0);

      const emptyAssistants = result.filter(m => m.role === 'assistant' && !m.content);
      expect(emptyAssistants.length).toBe(0);
    });

    it('连续用户消息合并 + 轮次截断 组合', () => {
      const messages: ApiMessage[] = [];
      for (let i = 0; i < 5; i++) {
        messages.push(makeUserMessage(`补充 ${i}`));
      }
      messages.push(makeAssistantMessage('好的，明白了。'));
      for (let i = 0; i < 5; i++) {
        messages.push(makeUserMessage(`问题 ${i}`));
      }

      const result = sanitizeHistoryMessages(messages, {
        mergeConsecutiveUsers: true,
        maxTurns: 3,
      });

      const userMsgs = result.filter(m => m.role === 'user');
      expect(userMsgs.length).toBeLessThanOrEqual(3);
    });

    it('reasoning 内容处理：非推理模型应丢弃', () => {
      const messages: ApiMessage[] = [
        makeUserMessage('你好'),
        {
          role: 'assistant',
          content: '你好！',
          reasoning_content: '让我想想...用户在打招呼，我应该友好回应。',
        },
      ];

      const result = sanitizeHistoryMessages(messages, {
        dropReasoning: true,
      });

      const assistant = result.find(m => m.role === 'assistant');
      expect(assistant).toBeDefined();
      expect((assistant as any).reasoning_content).toBeUndefined();
    });

    it('reasoning 内容处理：推理模型应保留', () => {
      const messages: ApiMessage[] = [
        makeUserMessage('你好'),
        {
          role: 'assistant',
          content: '你好！',
          reasoning_content: '让我想想...用户在打招呼，我应该友好回应。',
        },
      ];

      const result = sanitizeHistoryMessages(messages, {
        dropReasoning: false,
      });

      const assistant = result.find(m => m.role === 'assistant');
      expect(assistant).toBeDefined();
      expect((assistant as any).reasoning_content).toBeDefined();
    });

    it('tool call 规范化：清理名称空格和校验 ID', () => {
      const messages: ApiMessage[] = [
        makeUserMessage('调用工具'),
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: '  call-123  ',
              type: 'function',
              function: { name: '  my_tool  ', arguments: '{"key": "value"}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call-123',
          content: 'result',
        },
      ];

      const result = sanitizeHistoryMessages(messages, {
        sanitizeToolCalls: true,
        validateToolPairs: false,
      });

      const assistant = result.find(m => m.role === 'assistant') as any;
      expect(assistant).toBeDefined();
      expect(assistant.tool_calls).toBeDefined();
      expect(assistant.tool_calls[0].function.name).toBe('my_tool');
      expect(assistant.tool_calls[0].id).toBe('call-123');
    });
  });

  describe('图片消毒集成测试', () => {
    it('包含图片的消息应正确处理', () => {
      const messages: ApiMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: '看这张图' },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                detail: 'high',
              },
            },
          ],
        },
        makeAssistantMessage('好的，我看到了。'),
      ];

      const result = sanitizeHistoryMessages(messages, {
        sanitizeImages: true,
        imageLimits: {
          maxDimensionPx: 1024,
          maxBytes: 100 * 1024,
        },
      });

      expect(result.length).toBe(2);
    });
  });

  describe('边界情况测试', () => {
    it('空消息数组应返回空数组', () => {
      const result = sanitizeHistoryMessages([], {
        maxTurns: 10,
        dedupeUserMessages: true,
        mergeConsecutiveUsers: true,
        cleanupEmptyAssistants: true,
        validateToolPairs: true,
      });
      expect(result).toEqual([]);
    });

    it('单条用户消息应保留', () => {
      const msg = makeUserMessage('只有一条消息');
      const result = sanitizeHistoryMessages([msg], { maxTurns: 5 });
      expect(result.length).toBe(1);
      expect(result[0].content).toBe('只有一条消息');
    });

    it('maxTurns=0 表示不限制', () => {
      const messages: ApiMessage[] = [];
      for (let i = 0; i < 100; i++) {
        messages.push(makeUserMessage(`消息 ${i}`));
        messages.push(makeAssistantMessage(`回复 ${i}`));
      }

      const result = sanitizeHistoryMessages(messages, { maxTurns: 0 });
      expect(result.length).toBe(200);
    });

    it('所有选项关闭时应原样返回', () => {
      const messages: ApiMessage[] = [
        makeUserMessage('a'),
        makeUserMessage('a'),
        makeAssistantMessage(''),
      ];

      const result = sanitizeHistoryMessages(messages, {
        cleanupEmptyAssistants: false,
        validateToolPairs: false,
        sanitizeToolCalls: false,
        dedupeUserMessages: false,
        mergeConsecutiveUsers: false,
        sanitizeImages: false,
        dropReasoning: false,
        maxTurns: 0,
      });

      expect(result.length).toBe(3);
    });
  });

  describe('truncateContextForModel 测试', () => {
    it('短上下文不截断', () => {
      const messages: ApiMessage[] = [
        makeUserMessage('你好'),
        makeAssistantMessage('你好！有什么可以帮你的？'),
      ];

      const result = truncateContextForModel(messages as any, 32000, 2000, 0);

      expect(result.messages.length).toBe(2);
      expect(result.truncated).toBe(false);
    });

    it('窗口过小应跳过截断', () => {
      const messages: ApiMessage[] = [
        makeUserMessage('你好'),
        makeAssistantMessage('你好！'),
      ];

      const result = truncateContextForModel(messages as any, 600, 100, 0);

      expect(result.messages.length).toBe(2);
      expect(result.truncated).toBe(false);
    });
  });
});
