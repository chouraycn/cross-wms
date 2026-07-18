import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { ToolExecutor, createToolExecutor } from '../tool-executor.js';
import { ToolRegistry } from '../tool-registry.js';
import type { ToolDefinition, ToolHandler, ToolContext } from '../types.js';

const addTool: ToolDefinition = {
  name: 'add',
  description: 'Add two numbers',
  category: 'math',
};

const addHandler: ToolHandler = async (input) => {
  const a = Number(input.a) || 0;
  const b = Number(input.b) || 0;
  return { result: a + b };
};

const slowTool: ToolDefinition = {
  name: 'slow',
  description: 'A slow tool',
  timeoutMs: 100,
};

const slowHandler: ToolHandler = async () => {
  await new Promise(resolve => setTimeout(resolve, 200));
  return { done: true };
};

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    invocationId: 'test-inv',
    nodeId: 'test-node',
    ...overrides,
  };
}

describe('node-host/tool-executor', () => {
  let executor: ToolExecutor;
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = createToolExecutor({ registry, defaultTimeoutMs: 500, maxConcurrency: 2 });
  });

  describe('execute', () => {
    it('执行成功的工具', async () => {
      registry.register(addTool, addHandler);
      const result = await executor.execute('add', { a: 2, b: 3 }, makeContext());
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      const stdout = JSON.parse(result.stdout);
      expect(stdout.result).toBe(5);
    });

    it('工具不存在时返回错误', async () => {
      const result = await executor.execute('nonexistent', {}, makeContext());
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Tool not found');
    });

    it('工具抛出错误时返回失败', async () => {
      const errorTool: ToolDefinition = { name: 'error-tool', description: 'Throws' };
      const errorHandler: ToolHandler = async () => {
        throw new Error('boom');
      };
      registry.register(errorTool, errorHandler);
      const result = await executor.execute('error-tool', {}, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('boom');
    });

    it('返回 execution result 字段', async () => {
      registry.register(addTool, addHandler);
      const result = await executor.execute('add', { a: 1, b: 2 }, makeContext());
      expect(result.invocationId).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.timedOut).toBe(false);
      expect(result.truncated).toBe(false);
    });
  });

  describe('超时', () => {
    it('工具超时返回 timedOut', async () => {
      registry.register(slowTool, slowHandler);
      const result = await executor.execute('slow', {}, makeContext());
      expect(result.timedOut).toBe(true);
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('timed out');
    }, { timeout: 5000 });
  });

  describe('并发控制', () => {
    it('超过并发限制时排队', async () => {
      executor = createToolExecutor({ registry, maxConcurrency: 1, defaultTimeoutMs: 1000 });

      let runningCount = 0;
      let maxRunning = 0;

      const syncTool: ToolDefinition = { name: 'sync', description: 'test' };
      const syncHandler: ToolHandler = async () => {
        runningCount++;
        maxRunning = Math.max(maxRunning, runningCount);
        await new Promise(r => setTimeout(r, 20));
        runningCount--;
        return { ok: true };
      };
      registry.register(syncTool, syncHandler);

      const results = await Promise.all([
        executor.execute('sync', {}, makeContext({ invocationId: 'a' })),
        executor.execute('sync', {}, makeContext({ invocationId: 'b' })),
        executor.execute('sync', {}, makeContext({ invocationId: 'c' })),
      ]);

      expect(results.every(r => r.success)).toBe(true);
      expect(maxRunning).toBeLessThanOrEqual(1);
    });

    it('getRunningCount 和 getQueueSize', async () => {
      executor = createToolExecutor({ registry, maxConcurrency: 0, defaultTimeoutMs: 1000 });

      const waitTool: ToolDefinition = { name: 'wait', description: '' };
      const waitHandler: ToolHandler = async () => {
        await new Promise(r => setTimeout(r, 30));
        return {};
      };
      registry.register(waitTool, waitHandler);

      expect(executor.getRunningCount()).toBe(0);
      expect(executor.getQueueSize()).toBe(0);
    });
  });

  describe('cancel', () => {
    it('取消运行中的调用', async () => {
      registry.register(slowTool, slowHandler);
      const resultPromise = executor.execute('slow', {}, makeContext({ invocationId: 'cancel-test' }));

      await new Promise(r => setTimeout(r, 10));
      const cancelled = executor.cancel('cancel-test');
      expect(cancelled).toBe(true);

      const result = await resultPromise;
      expect(result.timedOut).toBe(true);
    });

    it('取消不存在的调用返回 false', () => {
      expect(executor.cancel('nonexistent')).toBe(false);
    });
  });

  describe('工具注册', () => {
    it('registerTool 注册工具', () => {
      const result = executor.registerTool(addTool, addHandler);
      expect(result).toBe(true);
      expect(executor.getRegistry().size()).toBe(1);
    });
  });

  describe('getRunningTools', () => {
    it('返回当前运行中的工具名', async () => {
      executor = createToolExecutor({ registry, maxConcurrency: 0, defaultTimeoutMs: 1000 });
      registry.register(addTool, addHandler);
      expect(executor.getRunningTools()).toEqual([]);
    });
  });
});
