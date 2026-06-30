// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  deduplicateUserMessages,
  mergeConsecutiveSystemMessages,
  preprocessForCompaction,
  DEFAULT_DEDUP_CONFIG,
} from '../compaction-dedupe.js';

type TestMessage = {
  role: string;
  content: string;
};

function createUserMessage(content: string): TestMessage {
  return { role: 'user', content };
}

function createAssistantMessage(content: string): TestMessage {
  return { role: 'assistant', content };
}

function createSystemMessage(content: string): TestMessage {
  return { role: 'system', content };
}

describe('compaction-dedupe', () => {
  describe('deduplicateUserMessages', () => {
    it('应该移除连续重复的用户消息', () => {
      const messages = [
        createUserMessage('Hello'),
        createUserMessage('Hello'),
        createAssistantMessage('Hi'),
      ];
      const result = deduplicateUserMessages(
        messages as Parameters<typeof deduplicateUserMessages>[0],
        { consecutiveThreshold: 2 },
      );
      expect(result.duplicatesRemoved).toBe(1);
      expect(result.messages.length).toBe(2);
    });

    it('不同的用户消息不应该被去重', () => {
      const messages = [
        createUserMessage('Hello'),
        createUserMessage('How are you?'),
        createAssistantMessage('Good'),
      ];
      const result = deduplicateUserMessages(
        messages as Parameters<typeof deduplicateUserMessages>[0],
      );
      expect(result.duplicatesRemoved).toBe(0);
      expect(result.messages.length).toBe(3);
    });

    it('助手消息打断连续重复', () => {
      const messages = [
        createUserMessage('Hello'),
        createAssistantMessage('Hi'),
        createUserMessage('Hello'),
      ];
      const result = deduplicateUserMessages(
        messages as Parameters<typeof deduplicateUserMessages>[0],
        { consecutiveThreshold: 2 },
      );
      expect(result.duplicatesRemoved).toBe(0);
    });

    it('禁用时不应该去重', () => {
      const messages = [
        createUserMessage('Hello'),
        createUserMessage('Hello'),
        createUserMessage('Hello'),
      ];
      const result = deduplicateUserMessages(
        messages as Parameters<typeof deduplicateUserMessages>[0],
        { enabled: false },
      );
      expect(result.duplicatesRemoved).toBe(0);
      expect(result.messages.length).toBe(3);
    });

    it('空数组应该返回空', () => {
      const result = deduplicateUserMessages([]);
      expect(result.duplicatesRemoved).toBe(0);
      expect(result.messages.length).toBe(0);
    });

    it('应该检测重复原因', () => {
      const messages = [
        createUserMessage('Hello'),
        createUserMessage('Hello'),
      ];
      const result = deduplicateUserMessages(
        messages as Parameters<typeof deduplicateUserMessages>[0],
        { consecutiveThreshold: 2 },
      );
      expect(result.duplicates.some(d => d.reason === 'consecutive_duplicate')).toBe(true);
    });
  });

  describe('mergeConsecutiveSystemMessages', () => {
    it('应该合并连续重复的系统消息', () => {
      const messages = [
        createSystemMessage('You are helpful'),
        createSystemMessage('You are helpful'),
        createUserMessage('Hello'),
      ];
      const result = mergeConsecutiveSystemMessages(
        messages as Parameters<typeof mergeConsecutiveSystemMessages>[0],
      );
      expect(result.length).toBe(2);
      expect(result[0].content).toBe('You are helpful');
    });

    it('不同的系统消息不应该被合并', () => {
      const messages = [
        createSystemMessage('You are helpful'),
        createSystemMessage('Be concise'),
      ];
      const result = mergeConsecutiveSystemMessages(
        messages as Parameters<typeof mergeConsecutiveSystemMessages>[0],
      );
      expect(result.length).toBe(2);
    });

    it('非系统消息不应该影响', () => {
      const messages = [
        createUserMessage('Hello'),
        createAssistantMessage('Hi'),
      ];
      const result = mergeConsecutiveSystemMessages(
        messages as Parameters<typeof mergeConsecutiveSystemMessages>[0],
      );
      expect(result.length).toBe(2);
    });
  });

  describe('preprocessForCompaction', () => {
    it('应该应用去重', () => {
      const messages = [
        createUserMessage('Hello'),
        createUserMessage('Hello'),
        createAssistantMessage('Hi'),
      ];
      const result = preprocessForCompaction(
        messages as Parameters<typeof preprocessForCompaction>[0],
      );
      expect(result.length).toBeLessThan(messages.length);
    });

    it('应该应用系统消息合并', () => {
      const messages = [
        createSystemMessage('System prompt'),
        createSystemMessage('System prompt'),
        createUserMessage('Hello'),
      ];
      const result = preprocessForCompaction(
        messages as Parameters<typeof preprocessForCompaction>[0],
        { mergeSystem: true },
      );
      expect(result.length).toBe(2);
    });

    it('空数组应该返回空', () => {
      const result = preprocessForCompaction([]);
      expect(result.length).toBe(0);
    });
  });

  describe('DEFAULT_DEDUP_CONFIG', () => {
    it('应该有合理的默认值', () => {
      expect(DEFAULT_DEDUP_CONFIG.enabled).toBe(true);
      expect(DEFAULT_DEDUP_CONFIG.consecutiveThreshold).toBe(2);
      expect(DEFAULT_DEDUP_CONFIG.similarityThreshold).toBeGreaterThan(0);
      expect(DEFAULT_DEDUP_CONFIG.similarityThreshold).toBeLessThanOrEqual(1);
    });
  });
});
