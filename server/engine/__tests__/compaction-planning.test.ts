// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  BASE_CHUNK_RATIO,
  MIN_CHUNK_RATIO,
  SAFETY_MARGIN,
  SUMMARIZATION_OVERHEAD_TOKENS,
  estimateMessageTokens,
  estimateMessagesTokens,
  splitMessagesByTokenShare,
  chunkMessagesByMaxTokens,
  computeAdaptiveChunkRatio,
  isOversizedForSummary,
  buildSummaryChunks,
  buildOversizedFallbackPlan,
  buildStageSplitPlan,
  pruneHistoryForContextShare,
  normalizeCompactionParts,
} from '../compaction-planning.js';

type TestMessage = {
  role: string;
  content: string;
  toolCalls?: Array<{ id: string; name: string }>;
  toolCallId?: string;
};

function createUserMessage(content: string): TestMessage {
  return { role: 'user', content };
}

function createAssistantMessage(content: string): TestMessage {
  return { role: 'assistant', content };
}

function createToolAssistantMessage(toolId: string): TestMessage {
  return {
    role: 'assistant',
    content: '',
    toolCalls: [{ id: toolId, name: 'test_tool' }],
  };
}

function createToolResultMessage(toolId: string, content: string): TestMessage {
  return { role: 'tool', content, toolCallId: toolId };
}

describe('compaction-planning', () => {
  describe('estimateMessageTokens', () => {
    it('应该估算简单消息的 token 数', () => {
      const msg = createUserMessage('Hello, world!');
      const tokens = estimateMessageTokens(msg as unknown as Parameters<typeof estimateMessageTokens>[0]);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20);
    });

    it('应该估算长消息的 token 数', () => {
      const longContent = 'a'.repeat(1000);
      const msg = createUserMessage(longContent);
      const tokens = estimateMessageTokens(msg as unknown as Parameters<typeof estimateMessageTokens>[0]);
      expect(tokens).toBeGreaterThan(200);
      expect(tokens).toBeLessThan(300);
    });

    it('应该考虑 toolCalls 的开销', () => {
      const msg1 = createAssistantMessage('test');
      const msg2 = createToolAssistantMessage('tool_123');
      const t1 = estimateMessageTokens(msg1 as unknown as Parameters<typeof estimateMessageTokens>[0]);
      const t2 = estimateMessageTokens(msg2 as unknown as Parameters<typeof estimateMessageTokens>[0]);
      expect(t2).toBeGreaterThan(t1);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('应该估算多条消息的总 token 数', () => {
      const messages = [
        createUserMessage('Hello'),
        createAssistantMessage('Hi there'),
        createUserMessage('How are you?'),
      ];
      const total = estimateMessagesTokens(messages as unknown as Parameters<typeof estimateMessagesTokens>[0]);
      expect(total).toBeGreaterThan(0);
    });

    it('空数组应该返回 0', () => {
      const total = estimateMessagesTokens([]);
      expect(total).toBe(0);
    });
  });

  describe('normalizeCompactionParts', () => {
    it('应该规范化有效的分块数', () => {
      expect(normalizeCompactionParts(3, 10)).toBe(3);
      expect(normalizeCompactionParts(2, 100)).toBe(2);
    });

    it('不合法的分块数应该返回 1', () => {
      expect(normalizeCompactionParts(0, 10)).toBe(1);
      expect(normalizeCompactionParts(-1, 10)).toBe(1);
      expect(normalizeCompactionParts(NaN, 10)).toBe(1);
    });

    it('分块数不能超过消息数', () => {
      expect(normalizeCompactionParts(10, 5)).toBe(5);
    });
  });

  describe('splitMessagesByTokenShare', () => {
    it('空消息列表应该返回空数组', () => {
      const result = splitMessagesByTokenShare([], 2);
      expect(result).toEqual([]);
    });

    it('单条消息应该返回单个分块', () => {
      const msg = createUserMessage('test');
      const result = splitMessagesByTokenShare([msg] as unknown as Parameters<typeof splitMessagesByTokenShare>[0], 2);
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(1);
    });

    it('应该按比例分割消息', () => {
      const messages: TestMessage[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push(createUserMessage(`Message number ${i} with some content to make it longer`));
      }
      const result = splitMessagesByTokenShare(
        messages as unknown as Parameters<typeof splitMessagesByTokenShare>[0],
        2,
      );
      expect(result.length).toBe(2);
      expect(result[0].length).toBeGreaterThan(0);
      expect(result[1].length).toBeGreaterThan(0);
    });

    it('parts=1 应该返回单个分块', () => {
      const messages = [createUserMessage('a'), createUserMessage('b')];
      const result = splitMessagesByTokenShare(
        messages as unknown as Parameters<typeof splitMessagesByTokenShare>[0],
        1,
      );
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(2);
    });
  });

  describe('工具对保护', () => {
    it('应该保持工具调用和结果在同一分块', () => {
      const messages: TestMessage[] = [
        createUserMessage('Please do something'),
        createToolAssistantMessage('tool_abc'),
        createToolResultMessage('tool_abc', 'Result data here'),
        createAssistantMessage('Done!'),
      ];

      const result = splitMessagesByTokenShare(
        messages as unknown as Parameters<typeof splitMessagesByTokenShare>[0],
        2,
      );

      // 工具调用和结果应该在同一个分块中
      let foundPair = false;
      for (const chunk of result) {
        const hasToolCall = chunk.some(
          m => (m as TestMessage).role === 'assistant' && (m as TestMessage).toolCalls,
        );
        const hasToolResult = chunk.some(
          m => (m as TestMessage).role === 'tool' && (m as TestMessage).toolCallId === 'tool_abc',
        );
        if (hasToolCall && hasToolResult) {
          foundPair = true;
          break;
        }
      }
      expect(foundPair).toBe(true);
    });
  });

  describe('chunkMessagesByMaxTokens', () => {
    it('应该按最大 token 数分块', () => {
      const messages: TestMessage[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createUserMessage('x'.repeat(200)));
      }
      const chunks = chunkMessagesByMaxTokens(
        messages as unknown as Parameters<typeof chunkMessagesByMaxTokens>[0],
        100,
      );
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('空数组应该返回空', () => {
      const chunks = chunkMessagesByMaxTokens([], 100);
      expect(chunks).toEqual([]);
    });
  });

  describe('computeAdaptiveChunkRatio', () => {
    it('应该返回基础比例对于小消息', () => {
      const messages = [createUserMessage('small')];
      const ratio = computeAdaptiveChunkRatio(
        messages as unknown as Parameters<typeof computeAdaptiveChunkRatio>[0],
        8000,
      );
      expect(ratio).toBeCloseTo(BASE_CHUNK_RATIO, 2);
    });

    it('大消息应该降低比例', () => {
      const messages = [createUserMessage('x'.repeat(5000))];
      const ratio = computeAdaptiveChunkRatio(
        messages as unknown as Parameters<typeof computeAdaptiveChunkRatio>[0],
        8000,
      );
      expect(ratio).toBeLessThan(BASE_CHUNK_RATIO);
      expect(ratio).toBeGreaterThanOrEqual(MIN_CHUNK_RATIO);
    });

    it('空数组应该返回基础比例', () => {
      const ratio = computeAdaptiveChunkRatio([], 8000);
      expect(ratio).toBe(BASE_CHUNK_RATIO);
    });
  });

  describe('isOversizedForSummary', () => {
    it('小消息不应该过大', () => {
      const msg = createUserMessage('small');
      const result = isOversizedForSummary(
        msg as unknown as Parameters<typeof isOversizedForSummary>[0],
        8000,
      );
      expect(result).toBe(false);
    });

    it('非常大的消息应该过大', () => {
      const msg = createUserMessage('x'.repeat(20000));
      const result = isOversizedForSummary(
        msg as unknown as Parameters<typeof isOversizedForSummary>[0],
        8000,
      );
      expect(result).toBe(true);
    });
  });

  describe('buildSummaryChunks', () => {
    it('应该构建摘要分块', () => {
      const messages: TestMessage[] = [];
      for (let i = 0; i < 5; i++) {
        messages.push(createUserMessage(`Content ${i}: ${'x'.repeat(200)}`));
      }
      const chunks = buildSummaryChunks(
        messages as unknown as Parameters<typeof buildSummaryChunks>[0],
        100,
      );
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('buildOversizedFallbackPlan', () => {
    it('应该分离过大和正常消息', () => {
      const messages: TestMessage[] = [
        createUserMessage('small message'),
        createUserMessage('x'.repeat(20000)),
        createAssistantMessage('response'),
      ];
      const plan = buildOversizedFallbackPlan(
        messages as unknown as Parameters<typeof buildOversizedFallbackPlan>[0],
        8000,
      );
      expect(plan.smallMessages.length).toBe(2);
      expect(plan.oversizedNotes.length).toBeGreaterThan(0);
    });

    it('全部正常消息应该没有 oversized notes', () => {
      const messages = [createUserMessage('hi'), createAssistantMessage('hello')];
      const plan = buildOversizedFallbackPlan(
        messages as unknown as Parameters<typeof buildOversizedFallbackPlan>[0],
        8000,
      );
      expect(plan.smallMessages.length).toBe(2);
      expect(plan.oversizedNotes.length).toBe(0);
    });
  });

  describe('buildStageSplitPlan', () => {
    it('少量消息应该使用 single 模式', () => {
      const messages = [createUserMessage('hi')];
      const plan = buildStageSplitPlan(
        messages as unknown as Parameters<typeof buildStageSplitPlan>[0],
        1000,
        2,
      );
      expect(plan.mode).toBe('single');
    });

    it('大量消息且大 token 应该使用 split 模式', () => {
      const messages: TestMessage[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push(createUserMessage(`Message ${i}: ${'x'.repeat(200)}`));
        messages.push(createAssistantMessage(`Response ${i}: ${'x'.repeat(200)}`));
      }
      const plan = buildStageSplitPlan(
        messages as unknown as Parameters<typeof buildStageSplitPlan>[0],
        100,
        2,
      );
      expect(plan.mode).toBe('split');
      expect(plan.chunks!.length).toBeGreaterThan(1);
    });
  });

  describe('pruneHistoryForContextShare', () => {
    it('应该丢弃最旧的分块', () => {
      const messages: TestMessage[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createUserMessage(`Old message ${i}: ${'x'.repeat(100)}`));
      }
      for (let i = 0; i < 5; i++) {
        messages.push(createUserMessage(`New message ${i}: ${'x'.repeat(100)}`));
      }

      const result = pruneHistoryForContextShare(
        messages as unknown as Parameters<typeof pruneHistoryForContextShare>[0],
        200,
        0.5,
      );

      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.droppedMessagesCount).toBeGreaterThan(0);
      expect(result.droppedChunks).toBeGreaterThan(0);
    });

    it('消息适合预算时不应该丢弃', () => {
      const messages = [createUserMessage('hi'), createAssistantMessage('hello')];
      const result = pruneHistoryForContextShare(
        messages as unknown as Parameters<typeof pruneHistoryForContextShare>[0],
        1000,
      );
      expect(result.droppedMessagesCount).toBe(0);
      expect(result.messages.length).toBe(2);
    });
  });

  describe('常量', () => {
    it('BASE_CHUNK_RATIO 应该在合理范围', () => {
      expect(BASE_CHUNK_RATIO).toBeGreaterThan(0);
      expect(BASE_CHUNK_RATIO).toBeLessThanOrEqual(1);
    });

    it('MIN_CHUNK_RATIO 应该小于 BASE_CHUNK_RATIO', () => {
      expect(MIN_CHUNK_RATIO).toBeLessThan(BASE_CHUNK_RATIO);
    });

    it('SAFETY_MARGIN 应该大于等于 1', () => {
      expect(SAFETY_MARGIN).toBeGreaterThanOrEqual(1);
    });

    it('SUMMARIZATION_OVERHEAD_TOKENS 应该是正数', () => {
      expect(SUMMARIZATION_OVERHEAD_TOKENS).toBeGreaterThan(0);
    });
  });
});
