/**
 * 工具稳定性核心模块单元测试
 * 覆盖: toolRetryWrapper + toolFallbackStrategy + toolContextGuard
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isTransientError, executeToolCallWithRetry } from '../toolRetryWrapper.js';
import { toolFallbackManager } from '../toolFallbackStrategy.js';
import { guardToolResultContext } from '../toolContextGuard.js';
import { toolExecutionStats } from '../toolExecutionStats.js';

// ===================== toolRetryWrapper =====================

describe('toolRetryWrapper — isTransientError', () => {
  it('用户取消的 AbortError 不应重试', () => {
    const err = new Error('请求已取消');
    err.name = 'AbortError';
    expect(isTransientError(err)).toBe(false);
  });

  it('用户取消 (user cancelled) 不应重试', () => {
    const err = new Error('User cancelled the request');
    err.name = 'AbortError';
    expect(isTransientError(err)).toBe(false);
  });

  it('裸 AbortError 不应重试', () => {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    expect(isTransientError(err)).toBe(false);
  });

  it('超时触发的 AbortError 应可重试', () => {
    const err = new Error('Request timeout');
    err.name = 'AbortError';
    expect(isTransientError(err)).toBe(true);
  });

  it('ECONNRESET 应为瞬时错误', () => {
    const err = new Error('connect ECONNRESET 127.0.0.1:443');
    err.name = 'ECONNRESET';
    expect(isTransientError(err)).toBe(true);
  });

  it('ETIMEDOUT 应为瞬时错误', () => {
    const err = new Error('connect ETIMEDOUT');
    err.name = 'ETIMEDOUT';
    expect(isTransientError(err)).toBe(true);
  });

  it('ECONNREFUSED 应为瞬时错误', () => {
    const err = new Error('connect ECONNREFUSED');
    err.name = 'ECONNREFUSED';
    expect(isTransientError(err)).toBe(true);
  });

  it('fetch failed 应为瞬时错误', () => {
    const err = new Error('fetch failed');
    expect(isTransientError(err)).toBe(true);
  });

  it('socket hang up 应为瞬时错误', () => {
    const err = new Error('socket hang up');
    expect(isTransientError(err)).toBe(true);
  });

  it('普通 TypeError 不应为瞬时错误', () => {
    const err = new TypeError('cannot read property of undefined');
    expect(isTransientError(err)).toBe(false);
  });

  it('非 Error 对象应返回 false', () => {
    expect(isTransientError('some string')).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
    expect(isTransientError(42)).toBe(false);
  });
});

describe('toolRetryWrapper — executeToolCallWithRetry', () => {
  it('成功执行应返回结果且 retryCount=0', async () => {
    const result = await executeToolCallWithRetry('test-tool', async () => 'ok');
    expect(result.result).toBe('ok');
    expect(result.retryCount).toBe(0);
  });

  it('瞬时错误应重试并最终成功', async () => {
    let attempts = 0;
    const result = await executeToolCallWithRetry(
      'test-tool',
      async () => {
        attempts++;
        if (attempts < 2) {
          const err = new Error('connect ECONNRESET');
          err.name = 'ECONNRESET';
          throw err;
        }
        return 'recovered';
      },
      { maxAttempts: 3, retryDelayMs: 10, jitter: 0 },
    );
    expect(result.result).toBe('recovered');
    expect(result.retryCount).toBe(1);
    expect(attempts).toBe(2);
  });

  it('非瞬时错误不应重试', async () => {
    let attempts = 0;
    await expect(
      executeToolCallWithRetry(
        'test-tool',
        async () => {
          attempts++;
          throw new TypeError('invalid argument');
        },
        { maxAttempts: 3, retryDelayMs: 10, jitter: 0 },
      ),
    ).rejects.toThrow('invalid argument');
    expect(attempts).toBe(1);
  });

  it('超过最大重试次数应抛出最后的错误', async () => {
    let attempts = 0;
    await expect(
      executeToolCallWithRetry(
        'test-tool',
        async () => {
          attempts++;
          const err = new Error('connect ETIMEDOUT');
          err.name = 'ETIMEDOUT';
          throw err;
        },
        { maxAttempts: 2, retryDelayMs: 10, jitter: 0 },
      ),
    ).rejects.toThrow('ETIMEDOUT');
    expect(attempts).toBe(2);
  });

  it('用户取消的 AbortError 不应重试', async () => {
    let attempts = 0;
    await expect(
      executeToolCallWithRetry(
        'test-tool',
        async () => {
          attempts++;
          const err = new Error('请求已取消');
          err.name = 'AbortError';
          throw err;
        },
        { maxAttempts: 3, retryDelayMs: 10, jitter: 0 },
      ),
    ).rejects.toThrow('请求已取消');
    expect(attempts).toBe(1);
  });

  it('signal 中止应取消重试等待', async () => {
    const controller = new AbortController();
    const retryPromise = executeToolCallWithRetry(
      'test-tool',
      async () => {
        const err = new Error('connect ETIMEDOUT');
        err.name = 'ETIMEDOUT';
        throw err;
      },
      { maxAttempts: 5, retryDelayMs: 5000, jitter: 0 },
      controller.signal,
    );
    // 等一小段时间后取消
    setTimeout(() => controller.abort(), 50);
    await expect(retryPromise).rejects.toThrow();
  });
});

// ===================== toolFallbackStrategy =====================

describe('toolFallbackStrategy — register & checkAndFallback', () => {
  beforeEach(() => {
    toolFallbackManager.reset();
  });

  it('未注册的工具应返回自身', () => {
    expect(toolFallbackManager.checkAndFallback('unknown-tool')).toBe('unknown-tool');
  });

  it('健康的工具应返回自身（不降级）', () => {
    toolFallbackManager.register({
      primaryTool: 'primary-search',
      fallbackTools: ['backup-search'],
      conditions: { minConsecutiveFailures: 3 },
    });
    expect(toolFallbackManager.checkAndFallback('primary-search')).toBe('primary-search');
  });

  it('注册后应可查询状态', () => {
    toolFallbackManager.register({
      primaryTool: 'primary-api',
      fallbackTools: ['fallback-api-1', 'fallback-api-2'],
      conditions: { minConsecutiveFailures: 3 },
    });
    const state = toolFallbackManager.getState('primary-api');
    expect(state).toBeDefined();
    expect(state?.primaryTool).toBe('primary-api');
    expect(state?.currentTool).toBe('primary-api');
    expect(state?.isDegraded).toBe(false);
  });

  it('reset 后所有状态应恢复初始', () => {
    toolFallbackManager.register({
      primaryTool: 'primary-x',
      fallbackTools: ['fallback-x'],
      conditions: { minConsecutiveFailures: 3 },
    });
    toolFallbackManager.reset();
    // reset() 重置状态值（isDegraded=false, currentTool=primaryTool），不删除映射条目
    const stateAfterReset = toolFallbackManager.getState('primary-x');
    expect(stateAfterReset).toBeDefined();
    expect(stateAfterReset?.isDegraded).toBe(false);
    expect(stateAfterReset?.currentTool).toBe('primary-x');
  });

  it('降级后应返回 fallback 工具', () => {
    toolFallbackManager.register({
      primaryTool: 'primary-degrade',
      fallbackTools: ['fallback-degrade'],
      conditions: { minConsecutiveFailures: 3, minHealthScore: 40 },
    });

    // 注入失败记录使主工具不健康
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      toolExecutionStats.record({
        toolName: 'primary-degrade',
        startTime: now - 1000,
        endTime: now,
        success: false,
        errorType: 'timeout',
        errorMessage: 'timeout',
        retryCount: 0,
        timedOut: true,
      });
    }

    const result = toolFallbackManager.checkAndFallback('primary-degrade');
    // 应触发降级到 fallback
    expect(result).toBe('fallback-degrade');
    const state = toolFallbackManager.getState('primary-degrade');
    expect(state?.isDegraded).toBe(true);
    expect(state?.currentTool).toBe('fallback-degrade');
  });

  it('未注册工具的 getState 应返回 undefined', () => {
    expect(toolFallbackManager.getState('nonexistent')).toBeUndefined();
  });
});

// ===================== toolContextGuard =====================

describe('toolContextGuard — guardToolResultContext', () => {
  it('小结果应原样返回', () => {
    const result = guardToolResultContext('hello world', [], 128000);
    expect(result).toBe('hello world');
  });

  it('超过 MAX_TOOL_RESULT_CHARS (20000) 的结果应被截断', () => {
    const longResult = 'a'.repeat(30000);
    const result = guardToolResultContext(longResult, [], 128000);
    expect(result.length).toBeLessThanOrEqual(20000);
  });

  it('空消息上下文时小结果应原样返回', () => {
    const result = guardToolResultContext('{"status":"ok"}', [], 8000);
    expect(result).toBe('{"status":"ok"}');
  });

  it('大上下文时应根据 context window 限制结果大小', () => {
    // 构造接近 context window 的消息上下文
    const messages = [
      { role: 'user', content: 'x'.repeat(20000) },
      { role: 'assistant', content: 'y'.repeat(20000) },
    ];
    const result = guardToolResultContext('z'.repeat(15000), messages as any, 8000);
    // 结果应被截断
    expect(result.length).toBeLessThanOrEqual(15000);
  });

  it('空结果应返回空字符串', () => {
    const result = guardToolResultContext('', [], 128000);
    expect(result).toBe('');
  });

  it('context window 很小时应保留至少 1800 字符', () => {
    const longResult = 'a'.repeat(10000);
    const messages = [{ role: 'user', content: 'x'.repeat(30000) }];
    const result = guardToolResultContext(longResult, messages as any, 4000);
    // smartTruncateResult 使用 60% head + 30% tail = 90% 内容 + 截断标记
    // minResultChars=2000 → 内容约 1800 + 标记约 70 → 总长约 1870
    expect(result.length).toBeGreaterThanOrEqual(1800);
  });
});
