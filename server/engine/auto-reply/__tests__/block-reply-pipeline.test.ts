import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBlockReplyPipeline,
  coalesceReplyPayloads,
} from '../block-reply-pipeline.js';
import type { ReplyPayload } from '../types.js';

describe('block-reply-pipeline', () => {
  describe('createBlockReplyPipeline', () => {
    it('should enqueue and flush payloads', async () => {
      const delivered: ReplyPayload[] = [];
      const pipeline = createBlockReplyPipeline({
        bufferMs: 10,
        deliver: async (payload) => {
          delivered.push(payload);
        },
      });

      pipeline.enqueue({ text: 'hello' });
      pipeline.enqueue({ text: ' world' });

      await pipeline.flush({ force: true });

      expect(delivered.length).toBe(2);
      expect(delivered[0].text).toBe('hello');
      expect(delivered[1].text).toBe(' world');
    });

    it('should track sent count', async () => {
      const pipeline = createBlockReplyPipeline({
        bufferMs: 10,
        deliver: async () => {},
      });

      pipeline.enqueue({ text: 'a' });
      pipeline.enqueue({ text: 'b' });
      await pipeline.flush({ force: true });

      expect(pipeline.getSentCount()).toBe(2);
      expect(pipeline.didStream()).toBe(true);
    });

    it('should stop accepting after stop()', async () => {
      const delivered: ReplyPayload[] = [];
      const pipeline = createBlockReplyPipeline({
        bufferMs: 10,
        deliver: async (payload) => {
          delivered.push(payload);
        },
      });

      pipeline.stop();
      pipeline.enqueue({ text: 'after stop' });
      await pipeline.flush({ force: true });

      expect(delivered.length).toBe(0);
    });

    it('should deduplicate when enabled', async () => {
      const delivered: ReplyPayload[] = [];
      const pipeline = createBlockReplyPipeline({
        bufferMs: 10,
        deduplicate: true,
        deliver: async (payload) => {
          delivered.push(payload);
        },
      });

      pipeline.enqueue({ text: 'same' });
      pipeline.enqueue({ text: 'same' });
      pipeline.enqueue({ text: 'different' });
      await pipeline.flush({ force: true });

      expect(delivered.length).toBe(2);
    });

    it('should apply beforeDeliver hook', async () => {
      const delivered: ReplyPayload[] = [];
      const pipeline = createBlockReplyPipeline({
        bufferMs: 10,
        beforeDeliver: (payload) => ({ ...payload, text: payload.text.toUpperCase() }),
        deliver: async (payload) => {
          delivered.push(payload);
        },
      });

      pipeline.enqueue({ text: 'hello' });
      await pipeline.flush({ force: true });

      expect(delivered[0].text).toBe('HELLO');
    });

    it('should skip when beforeDeliver returns null', async () => {
      const delivered: ReplyPayload[] = [];
      const pipeline = createBlockReplyPipeline({
        bufferMs: 10,
        beforeDeliver: () => null,
        deliver: async (payload) => {
          delivered.push(payload);
        },
      });

      pipeline.enqueue({ text: 'hello' });
      await pipeline.flush({ force: true });

      expect(delivered.length).toBe(0);
    });

    it('should respect maxBufferSize', async () => {
      const delivered: ReplyPayload[] = [];
      const pipeline = createBlockReplyPipeline({
        bufferMs: 10000,
        maxBufferSize: 2,
        deliver: async (payload) => {
          delivered.push(payload);
        },
      });

      pipeline.enqueue({ text: '1' });
      pipeline.enqueue({ text: '2' });

      await new Promise((r) => setTimeout(r, 50));
      expect(delivered.length).toBeGreaterThan(0);
    });
  });

  describe('coalesceReplyPayloads', () => {
    it('should return empty payload for empty array', () => {
      const result = coalesceReplyPayloads([]);
      expect(result.text).toBe('');
    });

    it('should return single payload as-is', () => {
      const payload: ReplyPayload = { text: 'hello', sessionId: '123' };
      const result = coalesceReplyPayloads([payload]);
      expect(result).toEqual(payload);
    });

    it('should concatenate text from multiple payloads', () => {
      const result = coalesceReplyPayloads([
        { text: 'hello ' },
        { text: 'world' },
      ]);
      expect(result.text).toBe('hello world');
    });

    it('should sum usage from multiple payloads', () => {
      const result = coalesceReplyPayloads([
        { text: 'a', usage: { input: 100, output: 50, cost: { input: 0.01, output: 0.02, total: 0.03 } } },
        { text: 'b', usage: { input: 200, output: 100, cost: { input: 0.02, output: 0.04, total: 0.06 } } },
      ]);
      expect(result.usage?.input).toBe(300);
      expect(result.usage?.output).toBe(150);
      expect(result.usage?.cost?.total).toBe(0.09);
    });

    it('should use last payload for metadata', () => {
      const result = coalesceReplyPayloads([
        { text: 'a', sessionId: 'first', modelUsed: 'model-1' },
        { text: 'b', sessionId: 'last', modelUsed: 'model-2' },
      ]);
      expect(result.sessionId).toBe('last');
      expect(result.modelUsed).toBe('model-2');
    });
  });
});
