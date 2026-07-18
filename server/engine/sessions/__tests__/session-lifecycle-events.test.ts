import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  onSessionLifecycleEvent,
  emitSessionLifecycleEvent,
  getListenerCount,
  clearAllListeners,
  type SessionLifecycleEvent,
} from '../session-lifecycle-events.js';

describe('session-lifecycle-events — 生命周期事件', () => {
  beforeEach(() => {
    clearAllListeners();
  });

  afterEach(() => {
    clearAllListeners();
  });

  describe('onSessionLifecycleEvent', () => {
    it('注册监听器', () => {
      expect(getListenerCount()).toBe(0);
      const unregister = onSessionLifecycleEvent(() => {});
      expect(getListenerCount()).toBe(1);
      unregister();
    });

    it('返回取消注册函数', () => {
      const unregister = onSessionLifecycleEvent(() => {});
      expect(getListenerCount()).toBe(1);
      unregister();
      expect(getListenerCount()).toBe(0);
    });
  });

  describe('emitSessionLifecycleEvent', () => {
    it('向所有监听器发射事件', () => {
      const events1: SessionLifecycleEvent[] = [];
      const events2: SessionLifecycleEvent[] = [];

      onSessionLifecycleEvent((e) => events1.push(e));
      onSessionLifecycleEvent((e) => events2.push(e));

      const event: SessionLifecycleEvent = {
        sessionKey: 'test-session',
        reason: 'created',
      };

      emitSessionLifecycleEvent(event);

      expect(events1).toHaveLength(1);
      expect(events1[0]).toEqual(event);
      expect(events2).toHaveLength(1);
      expect(events2[0]).toEqual(event);
    });

    it('捕获监听器错误，不影响其他监听器', () => {
      const receivedEvents: SessionLifecycleEvent[] = [];

      onSessionLifecycleEvent(() => {
        throw new Error('listener error');
      });
      onSessionLifecycleEvent((e) => receivedEvents.push(e));

      const event: SessionLifecycleEvent = {
        sessionKey: 'test-session',
        reason: 'test',
      };

      expect(() => emitSessionLifecycleEvent(event)).not.toThrow();
      expect(receivedEvents).toHaveLength(1);
    });

    it('发射包含所有可选字段的事件', () => {
      const received: SessionLifecycleEvent[] = [];
      onSessionLifecycleEvent((e) => received.push(e));

      const event: SessionLifecycleEvent = {
        sessionKey: 'child-session',
        reason: 'spawned',
        parentSessionKey: 'parent-session',
        label: 'test-label',
        displayName: 'Test Session',
      };

      emitSessionLifecycleEvent(event);
      expect(received[0]).toEqual(event);
    });
  });

  describe('clearAllListeners', () => {
    it('清除所有监听器', () => {
      onSessionLifecycleEvent(() => {});
      onSessionLifecycleEvent(() => {});
      expect(getListenerCount()).toBe(2);

      clearAllListeners();
      expect(getListenerCount()).toBe(0);
    });
  });
});
