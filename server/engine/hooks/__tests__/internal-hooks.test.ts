import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerInternalHook,
  registerInternalModifier,
  unregisterInternalHook,
  unregisterInternalModifier,
  clearInternalHooks,
  runInternalHooks,
  runInternalModifiers,
  triggerInternalHook,
  setInternalHooksEnabled,
  areInternalHooksEnabled,
  getRegisteredEventKeys,
  hasInternalHookListeners,
  createInternalHookEvent,
  isMessageReceivedEvent,
  isMessageSentEvent,
  isAgentBootstrapEvent,
  isGatewayStartupEvent,
  isSessionPatchEvent,
  isToolCallEvent,
  isToolResultEvent,
} from '../internal-hooks.js';
import type { InternalHookEvent } from '../types.js';

describe('internal-hooks', () => {
  beforeEach(() => {
    clearInternalHooks();
    setInternalHooksEnabled(true);
  });

  afterEach(() => {
    clearInternalHooks();
  });

  describe('registerInternalHook and runInternalHooks', () => {
    it('should register and run a hook handler', async () => {
      let called = false;
      const handler = async (_event: InternalHookEvent) => {
        called = true;
      };

      registerInternalHook('test:event', handler);
      const event = createInternalHookEvent('message', 'received', 'session-1');

      await runInternalHooks('test:event', event);
      expect(called).toBe(true);
    });

    it('should run multiple handlers in order', async () => {
      const order: string[] = [];
      registerInternalHook('test:event', async () => {
        order.push('first');
      });
      registerInternalHook('test:event', async () => {
        order.push('second');
      });

      const event = createInternalHookEvent('message', 'received', 'session-1');
      await runInternalHooks('test:event', event);

      expect(order).toEqual(['first', 'second']);
    });

    it('should not throw if handler throws', async () => {
      registerInternalHook('test:event', async () => {
        throw new Error('test error');
      });

      const event = createInternalHookEvent('message', 'received', 'session-1');
      await expect(runInternalHooks('test:event', event)).resolves.not.toThrow();
    });

    it('should not run hooks when disabled', async () => {
      let called = false;
      registerInternalHook('test:event', async () => {
        called = true;
      });

      setInternalHooksEnabled(false);
      const event = createInternalHookEvent('message', 'received', 'session-1');
      await runInternalHooks('test:event', event);

      expect(called).toBe(false);
      setInternalHooksEnabled(true);
    });
  });

  describe('registerInternalModifier and runInternalModifiers', () => {
    it('should register and run a modifier', async () => {
      const modifier = async (event: InternalHookEvent) => {
        return { ...event, sessionKey: 'modified' };
      };

      registerInternalModifier('test:event', modifier);
      const event = createInternalHookEvent('message', 'received', 'session-1');
      const result = await runInternalModifiers('test:event', event);

      expect(result.sessionKey).toBe('modified');
    });

    it('should chain multiple modifiers', async () => {
      registerInternalModifier('test:event', async (event: InternalHookEvent) => {
        return { ...event, messages: [...event.messages, 'first'] };
      });
      registerInternalModifier('test:event', async (event: InternalHookEvent) => {
        return { ...event, messages: [...event.messages, 'second'] };
      });

      const event = createInternalHookEvent('message', 'received', 'session-1');
      const result = await runInternalModifiers('test:event', event);

      expect(result.messages).toEqual(['first', 'second']);
    });
  });

  describe('triggerInternalHook', () => {
    it('should trigger both type and action handlers', async () => {
      const calls: string[] = [];
      registerInternalHook('message', async () => {
        calls.push('type');
      });
      registerInternalHook('message:received', async () => {
        calls.push('action');
      });

      const event = createInternalHookEvent('message', 'received', 'session-1');
      await triggerInternalHook(event);

      expect(calls).toEqual(['type', 'action']);
    });

    it('should run modifiers before handlers', async () => {
      const order: string[] = [];
      registerInternalModifier('message:received', async (event) => {
        order.push('modifier');
        return event;
      });
      registerInternalHook('message:received', async () => {
        order.push('handler');
      });

      const event = createInternalHookEvent('message', 'received', 'session-1');
      await triggerInternalHook(event);

      expect(order).toEqual(['modifier', 'handler']);
    });
  });

  describe('unregisterInternalHook', () => {
    it('should unregister a specific handler', async () => {
      let called1 = false;
      let called2 = false;
      const handler1 = async () => {
        called1 = true;
      };
      const handler2 = async () => {
        called2 = true;
      };

      registerInternalHook('test:event', handler1);
      registerInternalHook('test:event', handler2);
      unregisterInternalHook('test:event', handler1);

      const event = createInternalHookEvent('message', 'received', 'session-1');
      await runInternalHooks('test:event', event);

      expect(called1).toBe(false);
      expect(called2).toBe(true);
    });

    it('should unregister all handlers for event key when no handler provided', async () => {
      let called = false;
      registerInternalHook('test:event', async () => {
        called = true;
      });

      unregisterInternalHook('test:event');

      const event = createInternalHookEvent('message', 'received', 'session-1');
      await runInternalHooks('test:event', event);

      expect(called).toBe(false);
    });
  });

  describe('hasInternalHookListeners', () => {
    it('should return true when handlers exist', () => {
      registerInternalHook('message:received', async () => {});
      expect(hasInternalHookListeners('message', 'received')).toBe(true);
    });

    it('should return false when no handlers exist', () => {
      expect(hasInternalHookListeners('message', 'received')).toBe(false);
    });
  });

  describe('getRegisteredEventKeys', () => {
    it('should return all registered event keys', () => {
      registerInternalHook('event1', async () => {});
      registerInternalHook('event2', async () => {});

      const keys = getRegisteredEventKeys();
      expect(keys).toContain('event1');
      expect(keys).toContain('event2');
    });
  });

  describe('event type guards', () => {
    it('isMessageReceivedEvent should correctly identify message received events', () => {
      const validEvent = createInternalHookEvent('message', 'received', 's1', {
        from: 'user@example.com',
        content: 'hello',
        channelId: 'chat',
      });
      expect(isMessageReceivedEvent(validEvent)).toBe(true);

      const invalidEvent = createInternalHookEvent('message', 'sent', 's1');
      expect(isMessageReceivedEvent(invalidEvent)).toBe(false);
    });

    it('isMessageSentEvent should correctly identify message sent events', () => {
      const validEvent = createInternalHookEvent('message', 'sent', 's1', {
        to: 'user@example.com',
        content: 'hello',
        channelId: 'chat',
        success: true,
      });
      expect(isMessageSentEvent(validEvent)).toBe(true);
    });

    it('isAgentBootstrapEvent should correctly identify agent bootstrap events', () => {
      const validEvent = createInternalHookEvent('agent', 'bootstrap', 's1', {
        workspaceDir: '/tmp/workspace',
        bootstrapFiles: [],
      });
      expect(isAgentBootstrapEvent(validEvent)).toBe(true);
    });

    it('isGatewayStartupEvent should correctly identify gateway startup events', () => {
      const validEvent = createInternalHookEvent('gateway', 'startup', 's1', {});
      expect(isGatewayStartupEvent(validEvent)).toBe(true);
    });

    it('isSessionPatchEvent should correctly identify session patch events', () => {
      const validEvent = createInternalHookEvent('session', 'patch', 's1', {
        sessionEntry: {},
        patch: {},
        cfg: {},
      });
      expect(isSessionPatchEvent(validEvent)).toBe(true);
    });

    it('isToolCallEvent should correctly identify tool call events', () => {
      const validEvent = createInternalHookEvent('tool', 'call', 's1', {
        toolName: 'test-tool',
        arguments: {},
      });
      expect(isToolCallEvent(validEvent)).toBe(true);
    });

    it('isToolResultEvent should correctly identify tool result events', () => {
      const validEvent = createInternalHookEvent('tool', 'result', 's1', {
        toolName: 'test-tool',
        success: true,
        result: 'ok',
      });
      expect(isToolResultEvent(validEvent)).toBe(true);
    });
  });
});
