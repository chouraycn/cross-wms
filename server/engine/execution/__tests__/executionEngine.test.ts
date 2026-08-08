/**
 * ExecutionEngine 单元测试
 *
 * 覆盖：
 * - 工具注册/注销
 * - 单步骤执行
 * - 多步骤顺序执行
 * - 步骤重试
 * - 步骤超时
 * - 并行执行
 * - 暂停/恢复
 * - 事件通知
 * - 失败处理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionEngine } from '../executionEngine.js';
import type { ExecutionStep, ToolRegistration } from '../types.js';

describe('ExecutionEngine — 执行引擎', () => {
  let engine: ExecutionEngine;

  beforeEach(() => {
    engine = new ExecutionEngine({
      maxRetries: 0,
      retryDelayMs: 10,
    });
  });

  // 1
  describe('工具注册', () => {
    it('应成功注册工具', () => {
      const reg: ToolRegistration = {
        name: 'echo',
        executor: async (_, args) => args,
      };

      engine.registerTool(reg);
      expect(engine.hasTool('echo')).toBe(true);
      expect(engine.getTool('echo')?.name).toBe('echo');
    });

    // 2
    it('应批量注册工具', () => {
      engine.registerTools([
        { name: 'tool1', executor: async () => 'r1' },
        { name: 'tool2', executor: async () => 'r2' },
      ]);

      expect(engine.hasTool('tool1')).toBe(true);
      expect(engine.hasTool('tool2')).toBe(true);
      expect(engine.listTools().length).toBe(2);
    });

    // 3
    it('应能注销工具', () => {
      engine.registerTool({ name: 'temp', executor: async () => {} });
      expect(engine.hasTool('temp')).toBe(true);

      const result = engine.unregisterTool('temp');
      expect(result).toBe(true);
      expect(engine.hasTool('temp')).toBe(false);
    });

    // 4
    it('注销不存在的工具应返回 false', () => {
      expect(engine.unregisterTool('nonexistent')).toBe(false);
    });

    // 5
    it('注册无名称的工具应抛出错误', () => {
      expect(() =>
        engine.registerTool({ name: '', executor: async () => {} }),
      ).toThrow();
    });

    // 6
    it('注册无 executor 的工具应抛出错误', () => {
      expect(() =>
        engine.registerTool({ name: 'bad', executor: undefined as unknown }),
      ).toThrow();
    });
  });

  // 7
  describe('单步骤执行', () => {
    it('应成功执行单一步骤', async () => {
      engine.registerTool({
        name: 'greet',
        executor: async (_, args: unknown) => `Hello, ${args.name}!`,
      });

      const step: ExecutionStep = {
        id: 's1',
        type: 'tool_call',
        name: 'Greeting',
        toolName: 'greet',
        toolArgs: { name: 'World' },
      };

      const result = await engine.execute([step]);
      expect(result.status).toBe('completed');
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.stepResults.length).toBe(1);
      expect(result.stepResults[0].status).toBe('completed');
      expect(result.finalOutput).toBe('Hello, World!');
    });

    // 8
    it('未注册的工具应导致失败', async () => {
      const step: ExecutionStep = {
        id: 's1',
        type: 'tool_call',
        name: 'Missing',
        toolName: 'nonexistent',
      };

      const result = await engine.execute([step]);
      expect(result.status).toBe('failed');
      expect(result.failedCount).toBe(1);
      expect(result.error).toContain('未注册的工具');
    });
  });

  // 9
  describe('多步骤执行', () => {
    it('应按顺序执行多个步骤', async () => {
      const callOrder: string[] = [];

      engine.registerTool({
        name: 'step_a',
        executor: async () => {
          callOrder.push('a');
          return 'A';
        },
      });
      engine.registerTool({
        name: 'step_b',
        executor: async () => {
          callOrder.push('b');
          return 'B';
        },
      });

      const steps: ExecutionStep[] = [
        { id: 's1', type: 'tool_call', name: 'Step A', toolName: 'step_a' },
        { id: 's2', type: 'tool_call', name: 'Step B', toolName: 'step_b' },
      ];

      const result = await engine.execute(steps);
      expect(result.status).toBe('completed');
      expect(result.successCount).toBe(2);
      expect(callOrder).toEqual(['a', 'b']);
    });

    // 10
    it('关键步骤失败应终止执行', async () => {
      engine.registerTool({
        name: 'first',
        executor: async () => 'first',
      });
      engine.registerTool({
        name: 'failing',
        executor: async () => {
          throw new Error('步骤失败');
        },
      });
      engine.registerTool({
        name: 'last',
        executor: async () => 'last',
      });

      const steps: ExecutionStep[] = [
        { id: 's1', type: 'tool_call', name: 'First', toolName: 'first' },
        { id: 's2', type: 'tool_call', name: 'Failing', toolName: 'failing', critical: true },
        { id: 's3', type: 'tool_call', name: 'Last', toolName: 'last' },
      ];

      const result = await engine.execute(steps);
      expect(result.status).toBe('failed');
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.stepResults.length).toBe(2);
    });

    // 11
    it('非关键步骤失败应继续执行（配置 continueOnFailure）', async () => {
      engine.registerTool({
        name: 'first',
        executor: async () => 'first',
      });
      engine.registerTool({
        name: 'failing',
        executor: async () => {
          throw new Error('非关键失败');
        },
      });
      engine.registerTool({
        name: 'last',
        executor: async () => 'last',
      });

      const steps: ExecutionStep[] = [
        { id: 's1', type: 'tool_call', name: 'First', toolName: 'first' },
        { id: 's2', type: 'tool_call', name: 'Failing', toolName: 'failing', critical: false },
        { id: 's3', type: 'tool_call', name: 'Last', toolName: 'last' },
      ];

      const result = await engine.execute(steps, { continueOnFailure: true });
      expect(result.status).toBe('completed');
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.stepResults.length).toBe(3);
    });
  });

  // 12
  describe('步骤重试', () => {
    it('应按配置的重试次数重试失败步骤', async () => {
      let attempts = 0;

      engine.registerTool({
        name: 'flaky',
        executor: async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`失败 ${attempts}`);
          }
          return 'success';
        },
      });

      const step: ExecutionStep = {
        id: 's1',
        type: 'tool_call',
        name: 'Flaky',
        toolName: 'flaky',
        maxRetries: 3,
        retryDelayMs: 5,
      };

      const result = await engine.execute([step]);
      expect(result.status).toBe('completed');
      expect(result.stepResults[0].retries).toBe(2);
      expect(attempts).toBe(3);
    });

    // 13
    it('超过最大重试次数应失败', async () => {
      let attempts = 0;

      engine.registerTool({
        name: 'always_fail',
        executor: async () => {
          attempts++;
          throw new Error('总是失败');
        },
      });

      const step: ExecutionStep = {
        id: 's1',
        type: 'tool_call',
        name: 'Always Fail',
        toolName: 'always_fail',
        maxRetries: 2,
        retryDelayMs: 5,
      };

      const result = await engine.execute([step]);
      expect(result.status).toBe('failed');
      expect(result.stepResults[0].retries).toBe(2);
      expect(attempts).toBe(3);
    });
  });

  // 14
  describe('步骤超时', () => {
    it('应在超时后终止步骤', async () => {
      engine.registerTool({
        name: 'slow',
        executor: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return 'done';
        },
      });

      const step: ExecutionStep = {
        id: 's1',
        type: 'tool_call',
        name: 'Slow',
        toolName: 'slow',
        timeoutMs: 50,
      };

      const result = await engine.execute([step]);
      expect(result.status).toBe('failed');
      expect(result.stepResults[0].status).toBe('timeout');
      expect(result.stepResults[0].error).toContain('超时');
    });
  });

  // 15
  describe('并行执行', () => {
    it('应并行执行子步骤', async () => {
      const startTime = Date.now();
      const completed: string[] = [];

      engine.registerTool({
        name: 'delay_a',
        executor: async (_, args: unknown) => {
          await new Promise((r) => setTimeout(r, args.delay));
          completed.push('a');
          return 'A';
        },
      });
      engine.registerTool({
        name: 'delay_b',
        executor: async (_, args: unknown) => {
          await new Promise((r) => setTimeout(r, args.delay));
          completed.push('b');
          return 'B';
        },
      });

      const step: ExecutionStep = {
        id: 'p1',
        type: 'parallel',
        name: 'Parallel',
        children: [
          { id: 'c1', type: 'tool_call', name: 'Child A', toolName: 'delay_a', toolArgs: { delay: 30 } },
          { id: 'c2', type: 'tool_call', name: 'Child B', toolName: 'delay_b', toolArgs: { delay: 30 } },
        ],
      };

      const result = await engine.execute([step]);
      const duration = Date.now() - startTime;

      expect(result.status).toBe('completed');
      expect(completed.length).toBe(2);
      expect(duration).toBeLessThan(100);
    });
  });

  // 16
  describe('事件通知', () => {
    it('应触发执行开始和完成事件', async () => {
      engine.registerTool({ name: 't', executor: async () => 'ok' });

      const events: string[] = [];
      engine.on('execution_started', () => events.push('started'));
      engine.on('execution_completed', () => events.push('completed'));

      await engine.execute([
        { id: 's1', type: 'tool_call', name: 'T', toolName: 't' },
      ]);

      expect(events).toContain('started');
      expect(events).toContain('completed');
    });

    // 17
    it('应触发步骤开始和完成事件', async () => {
      engine.registerTool({ name: 't', executor: async () => 'ok' });

      const events: string[] = [];
      engine.on('step_started', () => events.push('step_started'));
      engine.on('step_completed', () => events.push('step_completed'));

      await engine.execute([
        { id: 's1', type: 'tool_call', name: 'T', toolName: 't' },
      ]);

      expect(events).toContain('step_started');
      expect(events).toContain('step_completed');
    });
  });

  // 18
  describe('配置管理', () => {
    it('应能获取和更新默认配置', () => {
      const config = engine.getDefaultConfig();
      expect(config.maxRetries).toBe(0);

      engine.setDefaultConfig({ maxRetries: 3 });
      expect(engine.getDefaultConfig().maxRetries).toBe(3);
    });
  });

  // 19
  describe('空步骤列表', () => {
    it('应抛出错误', async () => {
      await expect(engine.execute([])).rejects.toThrow();
    });
  });

  // 20
  it('执行结果应包含正确的时间戳', async () => {
    engine.registerTool({ name: 't', executor: async () => 'ok' });

    const result = await engine.execute([
      { id: 's1', type: 'tool_call', name: 'T', toolName: 't' },
    ]);

    expect(result.startedAt).toBeGreaterThan(0);
    expect(result.endedAt).toBeGreaterThanOrEqual(result.startedAt);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.stepResults[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
