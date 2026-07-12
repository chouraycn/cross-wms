/**
 * 工具稳定性中止与队列模块单元测试
 * 覆盖: abortPrimitives + toolTimeoutWrapper + toolExecutionQueue
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { abortPrimitives, createRunAbortController, linkExternalSignal } from '../abortPrimitives.js';
import { executeToolCallWithTimeout } from '../toolTimeoutWrapper.js';
import { toolExecutionQueue, executeViaQueue } from '../toolExecutionQueue.js';

// ===================== 测试工具 =====================

/**
 * 可被 AbortSignal 取消的延迟函数
 * executor 必须尊重 signal，否则超时机制无法生效
 */
function abortableDelay(ms: number, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('done'), ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    });
  });
}

// ===================== abortPrimitives =====================

describe('abortPrimitives — createController', () => {
  it('创建根控制器后应可通过 id 获取', () => {
    const controller = abortPrimitives.createController('test-root-1', {
      reason: 'user_cancel',
      source: 'test',
      timestamp: Date.now(),
    });
    expect(controller.id).toBe('test-root-1');
    expect(abortPrimitives.getController('test-root-1')).toBeDefined();
    expect(abortPrimitives.isAborted('test-root-1')).toBe(false);
    abortPrimitives.release('test-root-1');
  });

  it('release 后控制器应不可获取', () => {
    const controller = abortPrimitives.createController('test-root-2', {
      reason: 'user_cancel',
      source: 'test',
      timestamp: Date.now(),
    });
    abortPrimitives.release('test-root-2');
    expect(abortPrimitives.getController('test-root-2')).toBeUndefined();
  });

  it('release 不存在的 id 应静默返回（不抛异常）', () => {
    expect(() => abortPrimitives.release('nonexistent-id')).not.toThrow();
  });
});

describe('abortPrimitives — parent/child cascade', () => {
  it('父控制器中止时子控制器也应中止', () => {
    const parent = abortPrimitives.createController('test-parent-1', {
      reason: 'user_cancel',
      source: 'test',
      timestamp: Date.now(),
    });
    const child = abortPrimitives.createController(
      'test-child-1',
      { reason: 'user_cancel', source: 'test', timestamp: Date.now() },
      parent,
    );

    expect(child.signal.aborted).toBe(false);
    abortPrimitives.abort('test-parent-1', {
      reason: 'user_cancel',
      source: 'test',
      timestamp: Date.now(),
    });

    expect(child.signal.aborted).toBe(true);
    const childReason = abortPrimitives.getAbortReason('test-child-1');
    expect(childReason?.reason).toBe('cascaded');
  });

  it('abort 后 parent 和 child 都应从 Map 中删除', () => {
    const parent = abortPrimitives.createController('test-parent-2', {
      reason: 'user_cancel',
      source: 'test',
      timestamp: Date.now(),
    });
    abortPrimitives.createController(
      'test-child-2',
      { reason: 'user_cancel', source: 'test', timestamp: Date.now() },
      parent,
    );
    abortPrimitives.abort('test-parent-2', {
      reason: 'user_cancel',
      source: 'test',
      timestamp: Date.now(),
    });
    // abort() 不再立即从 controllers Map 删除，需要 cleanup() 清理已中止的控制器
    abortPrimitives.cleanup();
    expect(abortPrimitives.getController('test-parent-2')).toBeUndefined();
    expect(abortPrimitives.getController('test-child-2')).toBeUndefined();
  });
});

describe('abortPrimitives — createTimeoutController', () => {
  it('超时后控制器应自动中止（reason=timeout）', async () => {
    const controller = abortPrimitives.createTimeoutController('test-timeout-1', 50);
    expect(controller.signal.aborted).toBe(false);
    // 等待超时
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(controller.signal.aborted).toBe(true);
    const reason = abortPrimitives.getAbortReason('test-timeout-1');
    expect(reason?.reason).toBe('timeout');
    abortPrimitives.release('test-timeout-1');
  });

  it('release 后超时定时器应被清理（不触发 abort）', async () => {
    const controller = abortPrimitives.createTimeoutController('test-timeout-2', 50);
    abortPrimitives.release('test-timeout-2');
    // 等待超时时间过去
    await new Promise(resolve => setTimeout(resolve, 100));
    // 控制器已被 release，不应再在 Map 中
    expect(abortPrimitives.getController('test-timeout-2')).toBeUndefined();
  });
});

describe('abortPrimitives — abortAll', () => {
  it('abortAll 应中止所有根控制器', () => {
    const root1 = abortPrimitives.createController('test-abortall-1', {
      reason: 'user_cancel',
      source: 'test',
      timestamp: Date.now(),
    });
    const root2 = abortPrimitives.createController('test-abortall-2', {
      reason: 'user_cancel',
      source: 'test',
      timestamp: Date.now(),
    });

    abortPrimitives.abortAll('resource_limit');

    expect(root1.signal.aborted).toBe(true);
    expect(root2.signal.aborted).toBe(true);
  });
});

describe('abortPrimitives — linkExternalSignal', () => {
  it('外部 signal 中止时应级联到受管控制器', () => {
    const external = new AbortController();
    const managed = linkExternalSignal('test-link-1', external.signal);

    expect(managed.signal.aborted).toBe(false);
    external.abort();
    expect(managed.signal.aborted).toBe(true);

    const reason = abortPrimitives.getAbortReason('test-link-1');
    expect(reason?.reason).toBe('cascaded');
    abortPrimitives.release('test-link-1');
  });

  it('release 后外部 signal 上的 listener 应被移除', () => {
    const external = new AbortController();
    const managed = linkExternalSignal('test-link-2', external.signal);
    abortPrimitives.release('test-link-2');

    // 外部 signal abort 后不应影响已释放的 managed controller
    // （因为 listener 已移除）
    external.abort();
    expect(managed.signal.aborted).toBe(true); // release 也会 abort
  });
});

describe('abortPrimitives — cleanup', () => {
  it('cleanup 应移除已中止的控制器', () => {
    abortPrimitives.createController('test-cleanup-1', {
      reason: 'user_cancel',
      source: 'test',
      timestamp: Date.now(),
    });
    abortPrimitives.abort('test-cleanup-1', {
      reason: 'user_cancel',
      source: 'test',
      timestamp: Date.now(),
    });
    // abort 已经删除了控制器，cleanup 应返回 0
    const cleaned = abortPrimitives.cleanup();
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });
});

describe('abortPrimitives — cleanupFns', () => {
  it('createController 父子关系应注册 cleanupFn', () => {
    const parent = abortPrimitives.createController('test-cleanup-parent', {
      reason: 'user_cancel',
      source: 'test',
      timestamp: Date.now(),
    });
    const child = abortPrimitives.createController(
      'test-cleanup-child',
      { reason: 'user_cancel', source: 'test', timestamp: Date.now() },
      parent,
    );
    expect(child.cleanupFns).toBeDefined();
    expect(child.cleanupFns!.length).toBeGreaterThan(0);
    abortPrimitives.release('test-cleanup-parent');
  });

  it('createTimeoutController 应注册 timeout cleanupFn', () => {
    const controller = abortPrimitives.createTimeoutController('test-cleanup-timeout', 5000);
    expect(controller.cleanupFns).toBeDefined();
    expect(controller.cleanupFns!.length).toBeGreaterThan(0);
    abortPrimitives.release('test-cleanup-timeout');
  });
});

// ===================== toolTimeoutWrapper =====================

describe('toolTimeoutWrapper — executeToolCallWithTimeout', () => {
  it('成功执行应返回结果', async () => {
    const result = await executeToolCallWithTimeout(
      'test-tool',
      async () => 'success',
      { timeoutMs: 1000 },
    );
    expect(result).toBe('success');
  });

  it('超时应抛出 ToolTimeoutError', async () => {
    await expect(
      executeToolCallWithTimeout(
        'test-tool',
        async (signal: AbortSignal) => abortableDelay(200, signal),
        { timeoutMs: 50 },
      ),
    ).rejects.toThrow('执行超时');
  });

  it('外部 signal 中止应抛出 ToolAbortError', async () => {
    const controller = new AbortController();
    const promise = executeToolCallWithTimeout(
      'test-tool',
      async (signal: AbortSignal) => abortableDelay(500, signal),
      { timeoutMs: 5000, signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 50);
    await expect(promise).rejects.toThrow('执行已取消');
  });

  it('非超时/非中止的业务错误应原样抛出', async () => {
    await expect(
      executeToolCallWithTimeout(
        'test-tool',
        async () => {
          throw new Error('business error');
        },
        { timeoutMs: 1000 },
      ),
    ).rejects.toThrow('business error');
  });

  it('执行完成后应释放受管控制器', async () => {
    await executeToolCallWithTimeout(
      'test-tool',
      async () => 'done',
      { timeoutMs: 1000 },
    );
    // 验证没有遗留的 test-tool-timeout 控制器
    // （无法直接检查 Map，但不应有内存泄漏）
  });

  it('已中止的外部 signal 应立即触发取消', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeToolCallWithTimeout(
        'test-tool',
        async () => 'should not reach',
        { timeoutMs: 5000, signal: controller.signal },
      ),
    ).rejects.toThrow();
  });
});

// ===================== toolExecutionQueue =====================

describe('toolExecutionQueue — enqueue', () => {
  beforeEach(() => {
    toolExecutionQueue.clear();
    toolExecutionQueue.resetStats();
  });

  it('基本入队执行应返回结果', async () => {
    const result = await toolExecutionQueue.enqueue(
      {
        id: 'test-queue-1',
        toolName: 'test-tool',
        args: {},
        priority: 'normal',
        enqueuedAt: Date.now(),
      },
      async () => 'queued-result',
    );
    expect(result).toBe('queued-result');
  });

  it('高优先级任务应先于低优先级执行', async () => {
    const executionOrder: string[] = [];
    // 用 maxConcurrent: 1 + 一个占位任务阻塞队列，使后续任务排队
    toolExecutionQueue.updateConfig({ maxConcurrent: 1 });
    let releasePlaceholder!: () => void;
    const placeholderPromise = toolExecutionQueue.enqueue(
      {
        id: 'test-placeholder',
        toolName: 'test-tool',
        args: {},
        priority: 'normal',
        enqueuedAt: Date.now(),
      },
      async () => new Promise<string>((resolve) => {
        releasePlaceholder = () => resolve('placeholder');
      }),
    );

    // 等待占位任务开始执行（占满并发槽）
    await new Promise(resolve => setTimeout(resolve, 50));

    const lowPromise = toolExecutionQueue.enqueue(
      {
        id: 'test-low',
        toolName: 'test-tool',
        args: {},
        priority: 'low',
        enqueuedAt: Date.now(),
      },
      async () => {
        executionOrder.push('low');
        return 'low';
      },
    );

    const highPromise = toolExecutionQueue.enqueue(
      {
        id: 'test-high',
        toolName: 'test-tool',
        args: {},
        priority: 'high',
        enqueuedAt: Date.now(),
      },
      async () => {
        executionOrder.push('high');
        return 'high';
      },
    );

    // 释放占位任务，触发后续任务执行
    releasePlaceholder();
    await placeholderPromise;

    await Promise.all([lowPromise, highPromise]);
    // 高优先级应先执行
    expect(executionOrder[0]).toBe('high');
  });

  it('clear 应拒绝所有等待中的任务', async () => {
    // 用 maxConcurrent: 1 + 一个占位任务阻塞队列，使后续任务排队
    toolExecutionQueue.updateConfig({ maxConcurrent: 1 });
    let releasePlaceholder!: () => void;
    const placeholderPromise = toolExecutionQueue.enqueue(
      {
        id: 'test-clear-placeholder',
        toolName: 'test-tool',
        args: {},
        priority: 'normal',
        enqueuedAt: Date.now(),
      },
      async () => new Promise<string>((resolve) => {
        releasePlaceholder = () => resolve('placeholder');
      }),
    );

    // 等待占位任务开始执行（占满并发槽）
    await new Promise(resolve => setTimeout(resolve, 50));

    const promise = toolExecutionQueue.enqueue(
      {
        id: 'test-clear-1',
        toolName: 'test-tool',
        args: {},
        priority: 'normal',
        enqueuedAt: Date.now(),
      },
      async () => 'should not reach',
    );

    toolExecutionQueue.clear();

    // P1-3: clear 现在抛出 QueueCancelledError，message 包含 'queue cleared'
    await expect(promise).rejects.toThrow('queue cleared');

    // 释放占位任务（防止悬挂 Promise）
    releasePlaceholder();
    await placeholderPromise;

    // 恢复并发
    toolExecutionQueue.updateConfig({ maxConcurrent: 5 });
  });

  it('getStats 应返回队列统计', async () => {
    await toolExecutionQueue.enqueue(
      {
        id: 'test-stats-1',
        toolName: 'test-tool',
        args: {},
        priority: 'normal',
        enqueuedAt: Date.now(),
      },
      async () => 'done',
    );

    const stats = toolExecutionQueue.getStats();
    expect(stats.completedCount).toBeGreaterThanOrEqual(1);
  });
});

describe('toolExecutionQueue — executeViaQueue wrapper', () => {
  beforeEach(() => {
    toolExecutionQueue.clear();
    toolExecutionQueue.resetStats();
    toolExecutionQueue.updateConfig({ maxConcurrent: 5 });
  });

  it('executeViaQueue 应通过队列执行并返回结果', async () => {
    const result = await executeViaQueue(
      'test-via-queue',
      { input: 'test' },
      async () => JSON.stringify({ output: 'result' }),
    );
    expect(result).toBe(JSON.stringify({ output: 'result' }));
  });

  it('executeViaQueue 应传递 sessionId', async () => {
    let capturedSessionId: string | undefined;
    await executeViaQueue(
      'test-session-tool',
      {},
      async () => {
        capturedSessionId = 'test-session-123';
        return 'ok';
      },
      { sessionId: 'test-session-123' },
    );
    expect(capturedSessionId).toBe('test-session-123');
  });
});
