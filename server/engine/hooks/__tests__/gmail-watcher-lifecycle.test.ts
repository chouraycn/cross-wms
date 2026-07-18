import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getMailWatcherStatus,
  setMailWatcherState,
  setMailWatcherAccount,
  recordMailWatcherError,
  recordMailWatcherSuccess,
  recordMessageProcessed,
  startMailWatcherStatusTracking,
  stopMailWatcherStatusTracking,
  subscribeToMailWatcherStatus,
  resetMailWatcherStatusForTest,
  startMailWatcherWithLogs,
} from '../gmail-watcher-lifecycle.js';
import type { MailWatcherState, MailProviderType } from '../types.js';

describe('gmail-watcher-lifecycle', () => {
  beforeEach(() => {
    resetMailWatcherStatusForTest();
  });

  afterEach(() => {
    resetMailWatcherStatusForTest();
  });

  describe('initial state', () => {
    it('should start with stopped state', () => {
      const status = getMailWatcherStatus();
      expect(status.state).toBe('stopped');
      expect(status.errorCount).toBe(0);
      expect(status.consecutiveErrors).toBe(0);
      expect(status.messagesProcessed).toBe(0);
    });

    it('should return a copy of status', () => {
      const status1 = getMailWatcherStatus();
      const status2 = getMailWatcherStatus();
      expect(status1).not.toBe(status2);
      expect(status1).toEqual(status2);
    });
  });

  describe('setMailWatcherState', () => {
    it('should update the state', () => {
      const states: MailWatcherState[] = ['starting', 'running', 'stopping', 'error', 'stopped'];
      
      for (const state of states) {
        setMailWatcherState(state);
        expect(getMailWatcherStatus().state).toBe(state);
      }
    });

    it('should notify listeners on state change', () => {
      const listener = vi.fn();
      subscribeToMailWatcherStatus(listener);
      
      setMailWatcherState('running');
      
      expect(listener).toHaveBeenCalled();
      const calledWith = listener.mock.calls[0][0];
      expect(calledWith.state).toBe('running');
    });
  });

  describe('setMailWatcherAccount', () => {
    it('should set account and provider', () => {
      setMailWatcherAccount('test@163.com', '163');
      const status = getMailWatcherStatus();
      expect(status.account).toBe('test@163.com');
      expect(status.provider).toBe('163');
    });

    it('should set account without provider', () => {
      setMailWatcherAccount('test@example.com');
      const status = getMailWatcherStatus();
      expect(status.account).toBe('test@example.com');
      expect(status.provider).toBeUndefined();
    });

    it('should notify listeners', () => {
      const listener = vi.fn();
      subscribeToMailWatcherStatus(listener);
      
      setMailWatcherAccount('test@qq.com', 'qq');
      
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('recordMailWatcherError', () => {
    it('should increment error counts', () => {
      recordMailWatcherError(new Error('test error'), 'connection');
      const status = getMailWatcherStatus();
      expect(status.errorCount).toBe(1);
      expect(status.consecutiveErrors).toBe(1);
      expect(status.lastError).toBeDefined();
      expect(status.lastError?.type).toBe('connection');
      expect(status.lastError?.message).toContain('test error');
    });

    it('should accept string errors', () => {
      recordMailWatcherError('string error message', 'authentication');
      const status = getMailWatcherStatus();
      expect(status.lastError?.message).toBe('string error message');
      expect(status.lastError?.type).toBe('authentication');
    });

    it('should default type to unknown', () => {
      recordMailWatcherError('error without type');
      const status = getMailWatcherStatus();
      expect(status.lastError?.type).toBe('unknown');
    });

    it('should increment consecutive errors', () => {
      recordMailWatcherError('error 1');
      recordMailWatcherError('error 2');
      recordMailWatcherError('error 3');
      const status = getMailWatcherStatus();
      expect(status.errorCount).toBe(3);
      expect(status.consecutiveErrors).toBe(3);
    });

    it('should set timestamp on error', () => {
      const before = new Date();
      recordMailWatcherError('test');
      const after = new Date();
      const status = getMailWatcherStatus();
      expect(status.lastError?.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(status.lastError?.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('recordMailWatcherSuccess', () => {
    it('should reset consecutive errors', () => {
      recordMailWatcherError('error 1');
      recordMailWatcherError('error 2');
      recordMailWatcherSuccess();
      const status = getMailWatcherStatus();
      expect(status.consecutiveErrors).toBe(0);
      expect(status.errorCount).toBe(2);
    });

    it('should set lastCheck time', () => {
      const before = new Date();
      recordMailWatcherSuccess();
      const after = new Date();
      const status = getMailWatcherStatus();
      expect(status.lastCheck).toBeDefined();
      expect(status.lastCheck?.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(status.lastCheck?.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('recordMessageProcessed', () => {
    it('should increment messages processed count', () => {
      recordMessageProcessed();
      recordMessageProcessed();
      recordMessageProcessed();
      const status = getMailWatcherStatus();
      expect(status.messagesProcessed).toBe(3);
    });
  });

  describe('startMailWatcherStatusTracking', () => {
    it('should reset counters and set starting state', () => {
      recordMailWatcherError('previous error');
      recordMessageProcessed();
      
      startMailWatcherStatusTracking();
      const status = getMailWatcherStatus();
      
      expect(status.state).toBe('starting');
      expect(status.errorCount).toBe(0);
      expect(status.consecutiveErrors).toBe(0);
      expect(status.messagesProcessed).toBe(0);
      expect(status.lastError).toBeUndefined();
      expect(status.startedAt).toBeDefined();
    });
  });

  describe('stopMailWatcherStatusTracking', () => {
    it('should set state to stopped and clear account', () => {
      setMailWatcherAccount('test@163.com', '163');
      setMailWatcherState('running');
      
      stopMailWatcherStatusTracking();
      const status = getMailWatcherStatus();
      
      expect(status.state).toBe('stopped');
      expect(status.account).toBeUndefined();
      expect(status.provider).toBeUndefined();
    });
  });

  describe('subscribeToMailWatcherStatus', () => {
    it('should return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToMailWatcherStatus(listener);
      
      setMailWatcherState('running');
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      setMailWatcherState('stopped');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should support multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      
      subscribeToMailWatcherStatus(listener1);
      subscribeToMailWatcherStatus(listener2);
      
      setMailWatcherState('running');
      
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should not fail if listener throws', () => {
      const badListener = vi.fn(() => {
        throw new Error('listener error');
      });
      const goodListener = vi.fn();
      
      subscribeToMailWatcherStatus(badListener);
      subscribeToMailWatcherStatus(goodListener);
      
      expect(() => setMailWatcherState('running')).not.toThrow();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('startMailWatcherWithLogs', () => {
    it('should start successfully and log info', async () => {
      const log = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      await startMailWatcherWithLogs({
        startFn: async () => ({ started: true }),
        log,
      });

      expect(log.info).toHaveBeenCalledWith('mail watcher started');
      expect(log.warn).not.toHaveBeenCalled();
      expect(log.error).not.toHaveBeenCalled();
    });

    it('should log warning when not started with reason', async () => {
      const log = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      await startMailWatcherWithLogs({
        startFn: async () => ({ started: false, reason: 'some error' }),
        log,
      });

      expect(log.warn).toHaveBeenCalled();
      expect(log.warn.mock.calls[0][0]).toContain('some error');
    });

    it('should not warn for common skip reasons', async () => {
      const log = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      await startMailWatcherWithLogs({
        startFn: async () => ({ started: false, reason: 'hooks not enabled' }),
        log,
      });

      expect(log.warn).not.toHaveBeenCalled();
    });

    it('should log error on exception', async () => {
      const log = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      await startMailWatcherWithLogs({
        startFn: async () => {
          throw new Error('startup failed');
        },
        log,
      });

      expect(log.error).toHaveBeenCalled();
      expect(log.error.mock.calls[0][0]).toContain('startup failed');
    });

    it('should skip when env var is set', async () => {
      const log = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const onSkipped = vi.fn();

      process.env.TEST_SKIP_MAIL = '1';
      try {
        await startMailWatcherWithLogs({
          startFn: async () => ({ started: true }),
          log,
          skipEnvVar: 'TEST_SKIP_MAIL',
          onSkipped,
        });

        expect(onSkipped).toHaveBeenCalled();
        expect(log.info).not.toHaveBeenCalled();
      } finally {
        delete process.env.TEST_SKIP_MAIL;
      }
    });
  });
});
