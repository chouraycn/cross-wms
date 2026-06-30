// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  sanitizeCompactionMessages,
  stripToolResultDetails,
  stripRuntimeContextMessages,
  repairOrphanToolResults,
  extractToolPairs,
  validateMessageIntegrity,
} from '../compaction-sanitize.js';

type TestMessage = {
  role: string;
  content: unknown;
  toolCalls?: Array<{ id: string; name: string; input?: Record<string, unknown> }>;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
};

function createUserMessage(content: string): TestMessage {
  return { role: 'user', content };
}

function createAssistantMessage(content: string): TestMessage {
  return { role: 'assistant', content };
}

function createToolCallMessage(toolId: string): TestMessage {
  return {
    role: 'assistant',
    content: '',
    toolCalls: [{ id: toolId, name: 'test_tool' }],
  };
}

function createToolResultMessage(toolId: string, content: unknown): TestMessage {
  return { role: 'tool', content, toolCallId: toolId };
}

function createRuntimeMessage(content: string): TestMessage {
  return {
    role: 'system',
    content: `[RUNTIME: ${content}]`,
  };
}

describe('compaction-sanitize', () => {
  describe('stripToolResultDetails', () => {
    it('应该保留非工具结果消息不变', () => {
      const messages = [
        createUserMessage('hello'),
        createAssistantMessage('hi'),
      ];
      const result = stripToolResultDetails(messages as Parameters<typeof stripToolResultDetails>[0]);
      expect(result.length).toBe(2);
      expect(result[0].content).toBe('hello');
    });

    it('应该清理工具结果中的敏感字段', () => {
      const toolResult = createToolResultMessage('tool_1', {
        data: 'sensitive data',
        response: 'sensitive response',
        status: 'ok',
      });
      const result = stripToolResultDetails([toolResult] as Parameters<typeof stripToolResultDetails>[0]);
      expect(result.length).toBe(1);

      const content = result[0].content as string;
      expect(content).toContain('status');
      expect(content).toContain('[REDACTED]');
    });

    it('字符串内容的工具结果不应该被修改', () => {
      const toolResult = createToolResultMessage('tool_1', 'simple result');
      const result = stripToolResultDetails([toolResult] as Parameters<typeof stripToolResultDetails>[0]);
      expect(result[0].content).toBe('simple result');
    });
  });

  describe('stripRuntimeContextMessages', () => {
    it('应该移除运行时上下文消息', () => {
      const messages = [
        createUserMessage('hello'),
        createRuntimeMessage('some context'),
        createAssistantMessage('hi'),
      ];
      const result = stripRuntimeContextMessages(messages as Parameters<typeof stripRuntimeContextMessages>[0]);
      expect(result.length).toBe(2);
      expect(result[0].content).toBe('hello');
      expect(result[1].content).toBe('hi');
    });

    it('应该保留正常消息', () => {
      const messages = [
        createUserMessage('hello'),
        createAssistantMessage('hi'),
      ];
      const result = stripRuntimeContextMessages(messages as Parameters<typeof stripRuntimeContextMessages>[0]);
      expect(result.length).toBe(2);
    });

    it('应该检测 metadata 中的运行时标记', () => {
      const msg = {
        role: 'system',
        content: 'internal data',
        metadata: { _runtimeContext: true },
      };
      const messages = [createUserMessage('hello'), msg];
      const result = stripRuntimeContextMessages(messages as Parameters<typeof stripRuntimeContextMessages>[0]);
      expect(result.length).toBe(1);
    });
  });

  describe('sanitizeCompactionMessages', () => {
    it('应该应用所有安全过滤', () => {
      const messages = [
        createUserMessage('hello'),
        createRuntimeMessage('context'),
        createToolResultMessage('tool_1', { data: 'secret', status: 'ok' }),
      ];
      const result = sanitizeCompactionMessages(messages as Parameters<typeof sanitizeCompactionMessages>[0]);
      expect(result.length).toBe(2);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('tool');
    });
  });

  describe('extractToolPairs', () => {
    it('应该提取完整的工具对', () => {
      const messages = [
        createToolCallMessage('tool_1'),
        createToolResultMessage('tool_1', 'result'),
      ];
      const pairs = extractToolPairs(messages as Parameters<typeof extractToolPairs>[0]);
      expect(pairs.length).toBe(1);
      expect(pairs[0].isComplete).toBe(true);
      expect(pairs[0].toolCallId).toBe('tool_1');
    });

    it('应该识别不完整的工具对', () => {
      const messages = [createToolCallMessage('tool_1')];
      const pairs = extractToolPairs(messages as Parameters<typeof extractToolPairs>[0]);
      expect(pairs.length).toBe(1);
      expect(pairs[0].isComplete).toBe(false);
    });
  });

  describe('repairOrphanToolResults', () => {
    it('应该移除孤儿工具结果', () => {
      const kept = [
        createUserMessage('hello'),
        createToolResultMessage('orphan_tool', 'result'),
        createAssistantMessage('done'),
      ];
      const dropped = [createToolCallMessage('orphan_tool')];

      const result = repairOrphanToolResults(
        kept as Parameters<typeof repairOrphanToolResults>[0],
        dropped as Parameters<typeof repairOrphanToolResults>[1],
      );

      expect(result.orphanedCount).toBe(1);
      expect(result.messages.length).toBe(2);
      expect(result.messages.some(m => (m as TestMessage).role === 'tool')).toBe(false);
    });

    it('应该保留有对应工具调用的结果', () => {
      const kept = [
        createToolCallMessage('tool_1'),
        createToolResultMessage('tool_1', 'result'),
      ];
      const dropped: TestMessage[] = [];

      const result = repairOrphanToolResults(
        kept as Parameters<typeof repairOrphanToolResults>[0],
        dropped as Parameters<typeof repairOrphanToolResults>[1],
      );

      expect(result.orphanedCount).toBe(0);
      expect(result.messages.length).toBe(2);
    });
  });

  describe('validateMessageIntegrity', () => {
    it('有效消息应该通过验证', () => {
      const messages = [createUserMessage('hello'), createAssistantMessage('hi')];
      const result = validateMessageIntegrity(messages as Parameters<typeof validateMessageIntegrity>[0]);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('缺少 role 的消息应该失败', () => {
      const messages = [{ content: 'no role' }];
      const result = validateMessageIntegrity(messages as Parameters<typeof validateMessageIntegrity>[0]);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
