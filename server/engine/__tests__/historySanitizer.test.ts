import { describe, it, expect } from 'vitest';
import {
  sanitizeHistoryMessages,
  mergeConsecutiveUserMessages,
  cleanupEmptyAssistantTurns,
  validateToolResultPairs,
  dedupeUserMessages,
  limitHistoryTurns,
  type ApiMessage,
} from '../historySanitizer.js';

describe('historySanitizer', () => {
  describe('mergeConsecutiveUserMessages', () => {
    it('should merge consecutive user messages with string content', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'World' },
        { role: 'assistant', content: 'Hi there' },
      ];
      const result = mergeConsecutiveUserMessages(messages);
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Hello\n\nWorld');
    });

    it('should not merge non-consecutive user messages', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'World' },
      ];
      const result = mergeConsecutiveUserMessages(messages);
      expect(result).toHaveLength(3);
    });

    it('should handle empty array', () => {
      const result = mergeConsecutiveUserMessages([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('cleanupEmptyAssistantTurns', () => {
    it('should remove empty assistant messages', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '' },
        { role: 'assistant', content: 'Hi there' },
      ];
      const result = cleanupEmptyAssistantTurns(messages);
      expect(result).toHaveLength(2);
      expect(result[1].content).toBe('Hi there');
    });

    it('should remove assistant message with only whitespace', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '   \n  ' },
      ];
      const result = cleanupEmptyAssistantTurns(messages);
      expect(result).toHaveLength(1);
    });
  });

  describe('validateToolResultPairs', () => {
    it('should remove orphan tool results', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'tool', content: 'result', tool_call_id: 'call_123' },
        { role: 'assistant', content: 'Done' },
      ];
      const result = validateToolResultPairs(messages);
      expect(result).toHaveLength(2);
      expect(result[1].role).toBe('assistant');
    });

    it('should keep valid tool call and result pairs', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'test', arguments: '{}' } }],
        },
        { role: 'tool', content: 'result', tool_call_id: 'call_1' },
      ];
      const result = validateToolResultPairs(messages);
      expect(result).toHaveLength(3);
    });
  });

  describe('dedupeUserMessages', () => {
    it('should remove duplicate consecutive user messages', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Hello' },
      ];
      const result = dedupeUserMessages(messages);
      expect(result).toHaveLength(3);
    });
  });

  describe('limitHistoryTurns', () => {
    it('should keep system messages and limit conversation turns', () => {
      const messages: ApiMessage[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q2' },
        { role: 'assistant', content: 'A2' },
        { role: 'user', content: 'Q3' },
        { role: 'assistant', content: 'A3' },
      ];
      const result = limitHistoryTurns(messages, 2);
      expect(result.filter(m => m.role === 'system')).toHaveLength(1);
      const userMsgs = result.filter(m => m.role === 'user');
      expect(userMsgs).toHaveLength(2);
      expect(userMsgs[0].content).toBe('Q2');
      expect(userMsgs[1].content).toBe('Q3');
    });

    it('should return all messages when maxTurns is 0', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q2' },
      ];
      const result = limitHistoryTurns(messages, 0);
      expect(result).toHaveLength(3);
    });
  });

  describe('sanitizeHistoryMessages', () => {
    it('should run all sanitization steps', () => {
      const messages: ApiMessage[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: "I'm fine" },
      ];
      const result = sanitizeHistoryMessages(messages, { maxTurns: 0 });
      expect(result.length).toBeLessThan(messages.length);
    });

    it('should respect maxTurns option', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q2' },
        { role: 'assistant', content: 'A2' },
        { role: 'user', content: 'Q3' },
        { role: 'assistant', content: 'A3' },
      ];
      const result = sanitizeHistoryMessages(messages, { maxTurns: 1 });
      const userMsgs = result.filter(m => m.role === 'user');
      expect(userMsgs).toHaveLength(1);
      expect(userMsgs[0].content).toBe('Q3');
    });

    it('should include reasoning_content in messages', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi', reasoning_content: 'Let me think...' },
      ];
      const result = sanitizeHistoryMessages(messages);
      expect(result).toHaveLength(2);
      expect((result[1] as ApiMessage).reasoning_content).toBe('Let me think...');
    });

    it('should drop reasoning_content when dropReasoning is true', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi', reasoning_content: 'Let me think...' },
      ];
      const result = sanitizeHistoryMessages(messages, { dropReasoning: true });
      expect(result).toHaveLength(2);
      expect((result[1] as ApiMessage).reasoning_content).toBeUndefined();
    });
  });

  describe('sanitizeToolCallInputs', () => {
    it('should trim tool call names', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'test' },
        {
          role: 'assistant',
          content: 'OK',
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: '  my_tool  ', arguments: '{}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'result' },
      ];
      const result = sanitizeHistoryMessages(messages, { sanitizeToolCalls: true });
      const assistantMsg = result.find(m => m.role === 'assistant');
      const tc = assistantMsg?.tool_calls?.[0];
      expect(tc?.function.name).toBe('my_tool');
    });

    it('should normalize JSON arguments', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'test' },
        {
          role: 'assistant',
          content: 'OK',
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'test', arguments: '{  "key":  "value"  }' } },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'result' },
      ];
      const result = sanitizeHistoryMessages(messages, { sanitizeToolCalls: true });
      const assistantMsg = result.find(m => m.role === 'assistant');
      const tc = assistantMsg?.tool_calls?.[0];
      const args = JSON.parse(tc?.function.arguments || '{}');
      expect(args.key).toBe('value');
    });

    it('should remove tool calls with empty id', () => {
      const messages: ApiMessage[] = [
        { role: 'user', content: 'test' },
        {
          role: 'assistant',
          content: 'OK',
          tool_calls: [
            { id: '', type: 'function', function: { name: 'test', arguments: '{}' } },
          ],
        },
      ];
      const result = sanitizeHistoryMessages(messages, { sanitizeToolCalls: true });
      const assistantMsg = result.find(m => m.role === 'assistant');
      expect(assistantMsg?.tool_calls).toBeUndefined();
    });
  });
});
