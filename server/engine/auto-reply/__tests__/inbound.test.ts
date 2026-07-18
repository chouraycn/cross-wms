import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  queueInboundMessage,
  getNextQueuedMessage,
  getQueueSize,
  clearQueue,
  isProcessing,
  markProcessing,
  validateInboundMessage,
  normalizeInboundText,
  processInboundQueue,
  type InboundMessage,
} from '../inbound.js';

describe('inbound', () => {
  const testSession = 'test-session-123';

  beforeEach(() => {
    clearQueue(testSession);
    markProcessing(testSession, false);
  });

  afterEach(() => {
    clearQueue(testSession);
    markProcessing(testSession, false);
  });

  describe('queueInboundMessage', () => {
    it('should queue a message', () => {
      const msg: InboundMessage = { text: 'hello', sessionKey: testSession };
      const result = queueInboundMessage(msg);
      expect(result.accepted).toBe(true);
      expect(result.queueSize).toBe(1);
    });

    it('should deduplicate messages when enabled', () => {
      const msg: InboundMessage = { text: 'hello', sessionKey: testSession };
      queueInboundMessage(msg, { dedupe: true });
      const result = queueInboundMessage(msg, { dedupe: true });
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('duplicate');
    });

    it('should respect maxQueueSize', () => {
      for (let i = 0; i < 3; i++) {
        queueInboundMessage({ text: `msg ${i}`, sessionKey: testSession });
      }
      const result = queueInboundMessage(
        { text: 'msg 4', sessionKey: testSession },
        { maxQueueSize: 3 },
      );
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('queue_full');
    });
  });

  describe('getNextQueuedMessage', () => {
    it('should return messages in FIFO order', () => {
      queueInboundMessage({ text: 'first', sessionKey: testSession });
      queueInboundMessage({ text: 'second', sessionKey: testSession });

      const first = getNextQueuedMessage(testSession);
      expect(first?.text).toBe('first');

      const second = getNextQueuedMessage(testSession);
      expect(second?.text).toBe('second');

      expect(getNextQueuedMessage(testSession)).toBeUndefined();
    });

    it('should return undefined for empty queue', () => {
      expect(getNextQueuedMessage('nonexistent')).toBeUndefined();
    });
  });

  describe('getQueueSize', () => {
    it('should return correct queue size', () => {
      expect(getQueueSize(testSession)).toBe(0);
      queueInboundMessage({ text: 'a', sessionKey: testSession });
      expect(getQueueSize(testSession)).toBe(1);
      queueInboundMessage({ text: 'b', sessionKey: testSession });
      expect(getQueueSize(testSession)).toBe(2);
    });
  });

  describe('clearQueue', () => {
    it('should clear the queue', () => {
      queueInboundMessage({ text: 'a', sessionKey: testSession });
      queueInboundMessage({ text: 'b', sessionKey: testSession });
      expect(getQueueSize(testSession)).toBe(2);
      clearQueue(testSession);
      expect(getQueueSize(testSession)).toBe(0);
    });
  });

  describe('isProcessing and markProcessing', () => {
    it('should track processing state', () => {
      expect(isProcessing(testSession)).toBe(false);
      markProcessing(testSession, true);
      expect(isProcessing(testSession)).toBe(true);
      markProcessing(testSession, false);
      expect(isProcessing(testSession)).toBe(false);
    });
  });

  describe('validateInboundMessage', () => {
    it('should validate non-empty messages', () => {
      expect(validateInboundMessage({ text: 'hello' }).valid).toBe(true);
    });

    it('should reject empty messages', () => {
      expect(validateInboundMessage({ text: '' }).valid).toBe(false);
      expect(validateInboundMessage({ text: '   ' }).valid).toBe(false);
    });
  });

  describe('normalizeInboundText', () => {
    it('should normalize line endings', () => {
      expect(normalizeInboundText('hello\r\nworld')).toBe('hello\nworld');
      expect(normalizeInboundText('hello\rworld')).toBe('hello\nworld');
    });

    it('should trim whitespace', () => {
      expect(normalizeInboundText('  hello  ')).toBe('hello');
    });

    it('should convert tabs to spaces', () => {
      expect(normalizeInboundText('hello\tworld')).toBe('hello  world');
    });
  });

  describe('processInboundQueue', () => {
    it('should process all queued messages', async () => {
      queueInboundMessage({ text: 'msg1', sessionKey: testSession });
      queueInboundMessage({ text: 'msg2', sessionKey: testSession });

      const processed: string[] = [];
      const results = await processInboundQueue(testSession, async (msg) => {
        processed.push(msg.text);
        return { text: `reply to ${msg.text}` };
      });

      expect(processed).toEqual(['msg1', 'msg2']);
      expect(results).toHaveLength(2);
    });

    it('should skip if already processing', async () => {
      markProcessing(testSession, true);
      queueInboundMessage({ text: 'msg', sessionKey: testSession });

      const results = await processInboundQueue(testSession, async () => ({ text: '' }));
      expect(results).toHaveLength(0);
      expect(getQueueSize(testSession)).toBe(1);
    });

    it('should handle errors gracefully', async () => {
      queueInboundMessage({ text: 'bad', sessionKey: testSession });
      queueInboundMessage({ text: 'good', sessionKey: testSession });

      const results = await processInboundQueue(testSession, async (msg) => {
        if (msg.text === 'bad') throw new Error('test error');
        return { text: 'ok' };
      });

      expect(results).toHaveLength(1);
      expect(results[0].text).toBe('ok');
    });
  });
});
