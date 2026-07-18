import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn(() => false),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import { ErrorHandler, createErrorHandler, errorHandler } from '../error-handler.js';
import type { NodeHostError } from '../types.js';

describe('node-host/error-handler', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    handler = createErrorHandler();
  });

  describe('handle', () => {
    it('处理字符串错误', () => {
      const result = handler.handle('something went wrong');
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('something went wrong');
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('处理 Error 对象', () => {
      const err = new Error('test error');
      const result = handler.handle(err);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('test error');
      expect(result.stack).toBeDefined();
    });

    it('处理 NodeHostError 对象', () => {
      const err: NodeHostError = {
        code: 'CUSTOM_ERROR',
        message: 'custom message',
        timestamp: 12345,
      };
      const result = handler.handle(err);
      expect(result.code).toBe('CUSTOM_ERROR');
      expect(result.message).toBe('custom message');
    });

    it('记录 invocationId', () => {
      const result = handler.handle('test', 'inv-123');
      expect(result.invocationId).toBe('inv-123');
    });

    it('调用 onError 回调', () => {
      const onError = vi.fn();
      const h = createErrorHandler({ onError });
      h.handle('test error');
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'test error' }));
    });
  });

  describe('错误码推断', () => {
    it('超时错误推断为 TIMEOUT', () => {
      const result = handler.handle(new Error('operation timed out'));
      expect(result.code).toBe('TIMEOUT');
    });

    it('网络错误推断为 NETWORK_ERROR', () => {
      const result = handler.handle(new Error('ECONNREFUSED: connection refused'));
      expect(result.code).toBe('NETWORK_ERROR');
    });

    it('内存错误推断为 OUT_OF_MEMORY', () => {
      const result = handler.handle(new Error('heap out of memory'));
      expect(result.code).toBe('OUT_OF_MEMORY');
    });

    it('权限错误推断为 PERMISSION_DENIED', () => {
      const result = handler.handle(new Error('access denied'));
      expect(result.code).toBe('PERMISSION_DENIED');
    });

    it('未找到错误推断为 NOT_FOUND', () => {
      const result = handler.handle(new Error('ENOENT: file not found'));
      expect(result.code).toBe('NOT_FOUND');
    });

    it('限流错误推断为 RATE_LIMITED', () => {
      const result = handler.handle(new Error('too many requests, rate limited'));
      expect(result.code).toBe('RATE_LIMITED');
    });
  });

  describe('历史记录', () => {
    it('getErrorHistory 返回历史记录', () => {
      handler.handle('error 1');
      handler.handle('error 2');
      const history = handler.getErrorHistory();
      expect(history.length).toBe(2);
    });

    it('getErrorHistory 按时间倒序', () => {
      handler.handle('first');
      handler.handle('second');
      const history = handler.getErrorHistory();
      expect(history[0].message).toBe('second');
      expect(history[1].message).toBe('first');
    });

    it('getErrorHistory 带 limit', () => {
      for (let i = 0; i < 10; i++) {
        handler.handle(`error ${i}`);
      }
      const history = handler.getErrorHistory(3);
      expect(history.length).toBe(3);
    });

    it('getHistorySize 返回数量', () => {
      handler.handle('a');
      handler.handle('b');
      expect(handler.getHistorySize()).toBe(2);
    });

    it('maxErrorHistory 限制历史记录数量', () => {
      const h = createErrorHandler({ maxErrorHistory: 3 });
      for (let i = 0; i < 10; i++) {
        h.handle(`error ${i}`);
      }
      expect(h.getHistorySize()).toBe(3);
    });

    it('getErrorsByCode 按错误码筛选', () => {
      handler.handle('normal error');
      handler.handle(new Error('request timed out'));
      handler.handle(new Error('connection timeout'));
      const timeoutErrors = handler.getErrorsByCode('TIMEOUT');
      expect(timeoutErrors.length).toBe(2);
    });

    it('getErrorCountByCode 返回统计', () => {
      handler.handle('error1');
      handler.handle(new Error('timeout error'));
      handler.handle(new Error('timeout again'));
      const counts = handler.getErrorCountByCode();
      expect(counts['UNKNOWN_ERROR']).toBe(1);
      expect(counts['TIMEOUT']).toBe(2);
    });
  });

  describe('重试追踪', () => {
    it('isRetryable 识别可重试错误', () => {
      const timeoutErr = handler.handle(new Error('timeout'));
      expect(handler.isRetryable(timeoutErr)).toBe(true);

      const unknownErr = handler.handle('unknown');
      expect(handler.isRetryable(unknownErr)).toBe(false);
    });

    it('canRetry 检查是否可重试', () => {
      handler.handle(new Error('network error'), 'inv-1');
      expect(handler.canRetry('inv-1')).toBe(true);
    });

    it('getRetryCount 返回重试次数', () => {
      handler.handle(new Error('timeout'), 'inv-1');
      expect(handler.getRetryCount('inv-1')).toBe(1);
    });

    it('clearRetryTracking 清除追踪', () => {
      handler.handle(new Error('timeout'), 'inv-1');
      expect(handler.clearRetryTracking('inv-1')).toBe(true);
      expect(handler.getRetryCount('inv-1')).toBe(0);
    });

    it('getRetryableCount 返回数量', () => {
      handler.handle(new Error('timeout'), 'inv-1');
      handler.handle(new Error('network error'), 'inv-2');
      handler.handle('unknown error', 'inv-3');
      expect(handler.getRetryableCount()).toBe(2);
    });
  });

  describe('wrap', () => {
    it('wrap 捕获并处理 Promise 错误', async () => {
      const result = handler.wrap(
        async () => { throw new Error('timeout error'); },
        'inv-test',
      );
      await expect(result).rejects.toThrow('timeout error');
      expect(handler.getHistorySize()).toBe(1);
    });

    it('wrap 成功时直接返回结果', async () => {
      const result = await handler.wrap(async () => 42);
      expect(result).toBe(42);
    });

    it('wrapSync 捕获同步错误', () => {
      expect(() => {
        handler.wrapSync(() => { throw new Error('sync error'); });
      }).toThrow('sync error');
      expect(handler.getHistorySize()).toBe(1);
    });

    it('wrapSync 成功时返回结果', () => {
      const result = handler.wrapSync(() => 'hello');
      expect(result).toBe('hello');
    });
  });

  describe('clearHistory', () => {
    it('清空历史和重试追踪', () => {
      handler.handle(new Error('timeout'), 'inv-1');
      handler.clearHistory();
      expect(handler.getHistorySize()).toBe(0);
      expect(handler.getRetryableCount()).toBe(0);
    });
  });

  describe('单例', () => {
    it('errorHandler 单例存在', () => {
      expect(errorHandler).toBeDefined();
      expect(errorHandler).toBeInstanceOf(ErrorHandler);
    });
  });
});
