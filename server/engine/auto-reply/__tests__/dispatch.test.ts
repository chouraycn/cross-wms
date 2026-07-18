import { describe, it, expect, vi } from 'vitest';
import {
  createReplyDispatcher,
  dispatchReply,
  combineBeforeDeliverHooks,
  incrementActiveDispatch,
  decrementActiveDispatch,
  getActiveDispatchCount,
} from '../dispatch.js';
import type { ReplyPayload } from '../types.js';

describe('dispatch', () => {
  describe('createReplyDispatcher', () => {
    it('should deliver payloads', async () => {
      const delivered: ReplyPayload[] = [];
      const dispatcher = createReplyDispatcher({
        deliver: async (payload) => {
          delivered.push(payload);
        },
      });

      await dispatcher.deliver({ text: 'hello' }, { kind: 'final' });
      expect(delivered).toHaveLength(1);
      expect(delivered[0].text).toBe('hello');
    });

    it('should run beforeDeliver hooks appended with appendBeforeDeliver', async () => {
      const delivered: ReplyPayload[] = [];
      const dispatcher = createReplyDispatcher({
        deliver: async (payload) => {
          delivered.push(payload);
        },
      });

      dispatcher.appendBeforeDeliver((payload) => ({
        ...payload,
        text: payload.text + '!',
      }));

      await dispatcher.deliver({ text: 'hello' }, { kind: 'final' });
      expect(delivered[0].text).toBe('hello!');
    });

    it('should run beforeDeliver hooks prepended with prependBeforeDeliver', async () => {
      const delivered: ReplyPayload[] = [];
      const dispatcher = createReplyDispatcher({
        deliver: async (payload) => {
          delivered.push(payload);
        },
      });

      dispatcher.appendBeforeDeliver((payload) => ({
        ...payload,
        text: payload.text + '!',
      }));
      dispatcher.prependBeforeDeliver((payload) => ({
        ...payload,
        text: '[' + payload.text,
      }));

      await dispatcher.deliver({ text: 'hello' }, { kind: 'final' });
      expect(delivered[0].text).toBe('[hello!');
    });

    it('should cancel delivery when beforeDeliver returns null', async () => {
      const delivered: ReplyPayload[] = [];
      const dispatcher = createReplyDispatcher({
        deliver: async (payload) => {
          delivered.push(payload);
        },
        beforeDeliver: () => null,
      });

      await dispatcher.deliver({ text: 'hello' }, { kind: 'final' });
      expect(delivered).toHaveLength(0);
    });

    it('should stop delivering after stop()', async () => {
      const delivered: ReplyPayload[] = [];
      const dispatcher = createReplyDispatcher({
        deliver: async (payload) => {
          delivered.push(payload);
        },
      });

      dispatcher.stop();
      await dispatcher.deliver({ text: 'after stop' }, { kind: 'final' });
      expect(delivered).toHaveLength(0);
    });
  });

  describe('dispatchReply', () => {
    it('should return delivered count on success', async () => {
      const dispatcher = createReplyDispatcher({
        deliver: async () => {},
      });

      const result = await dispatchReply({ text: 'test' }, dispatcher, 'final');
      expect(result.delivered).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should return failed count on error', async () => {
      const dispatcher = createReplyDispatcher({
        deliver: async () => {
          throw new Error('delivery failed');
        },
      });

      const result = await dispatchReply({ text: 'test' }, dispatcher, 'final');
      expect(result.delivered).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  describe('combineBeforeDeliverHooks', () => {
    it('should return undefined for no hooks', () => {
      expect(combineBeforeDeliverHooks()).toBeUndefined();
      expect(combineBeforeDeliverHooks(undefined, undefined)).toBeUndefined();
    });

    it('should combine multiple hooks in order', async () => {
      const combined = combineBeforeDeliverHooks(
        (p) => ({ ...p, text: p.text + 'a' }),
        (p) => ({ ...p, text: p.text + 'b' }),
        (p) => ({ ...p, text: p.text + 'c' }),
      );

      expect(combined).toBeDefined();
      const result = await combined!({ text: 'x' }, { kind: 'final' });
      expect(result?.text).toBe('xabc');
    });

    it('should stop at first null return', async () => {
      const secondHook = vi.fn((p) => p);
      const combined = combineBeforeDeliverHooks(
        () => null,
        secondHook as unknown as () => ReplyPayload,
      );

      const result = await combined!({ text: 'x' }, { kind: 'final' });
      expect(result).toBeNull();
      expect(secondHook).not.toHaveBeenCalled();
    });
  });

  describe('active dispatch tracking', () => {
    const sessionKey = 'test-session-dispatch';

    it('should track active dispatch count', () => {
      expect(getActiveDispatchCount(sessionKey)).toBe(0);
      incrementActiveDispatch(sessionKey);
      expect(getActiveDispatchCount(sessionKey)).toBe(1);
      incrementActiveDispatch(sessionKey);
      expect(getActiveDispatchCount(sessionKey)).toBe(2);
      decrementActiveDispatch(sessionKey);
      expect(getActiveDispatchCount(sessionKey)).toBe(1);
      decrementActiveDispatch(sessionKey);
      expect(getActiveDispatchCount(sessionKey)).toBe(0);
    });

    it('should not go below 0', () => {
      decrementActiveDispatch(sessionKey);
      decrementActiveDispatch(sessionKey);
      expect(getActiveDispatchCount(sessionKey)).toBe(0);
    });
  });
});
