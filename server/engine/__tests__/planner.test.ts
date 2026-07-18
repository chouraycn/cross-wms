/**
 * Planner 动态重规划能力单元测试
 *
 * 覆盖：
 * - detectDrift 各种场景
 * - topologicalSort 正常排序和循环依赖检测
 * - advancePlan 推进逻辑
 * - getNextExecutableSteps 依赖检查
 * - estimateProgress 计算
 */
import { describe, it, expect } from 'vitest';
import { Planner } from '../planner.js';
import type { ExecutionPlan, PlanStep } from '../planner.js';

describe('Planner 动态重规划能力', () => {
  const planner = new Planner();

  describe('detectDrift', () => {
    it('失败率超过 0.3 时应返回 shouldReplan: true', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'failed' },
          { step: 2, description: 's2', dependsOn: [], status: 'failed' },
          { step: 3, description: 's3', dependsOn: [], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const result = planner.detectDrift(plan, [], [1, 2]);
      expect(result.shouldReplan).toBe(true);
      expect(result.reason).toBe('失败率过高');
    });

    it('存在 failed 状态且 failedSteps 包含时应返回 shouldReplan: true', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'failed' },
          { step: 2, description: 's2', dependsOn: [], status: 'pending' },
          { step: 3, description: 's3', dependsOn: [], status: 'pending' },
          { step: 4, description: 's4', dependsOn: [], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const result = planner.detectDrift(plan, [], [1]);
      expect(result.shouldReplan).toBe(true);
      expect(result.reason).toBe('存在失败步骤');
    });

    it('连续 2 个步骤失败时应返回 shouldReplan: true', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'failed' },
          { step: 2, description: 's2', dependsOn: [], status: 'failed' },
          { step: 3, description: 's3', dependsOn: [], status: 'pending' },
          { step: 4, description: 's4', dependsOn: [], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      // failedSteps 为空，使失败率不触发，仅通过连续状态触发
      const result = planner.detectDrift(plan, [], []);
      expect(result.shouldReplan).toBe(true);
      expect(result.reason).toBe('连续多个步骤失败');
    });

    it('正常情况应返回 shouldReplan: false', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'completed' },
          { step: 2, description: 's2', dependsOn: [1], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const result = planner.detectDrift(plan, [1], []);
      expect(result.shouldReplan).toBe(false);
      expect(result.reason).toBe('计划正常');
    });

    it('0 失败时（所有步骤 pending）应返回 shouldReplan: false', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'pending' },
          { step: 2, description: 's2', dependsOn: [], status: 'pending' },
          { step: 3, description: 's3', dependsOn: [], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const result = planner.detectDrift(plan, [], []);
      expect(result.shouldReplan).toBe(false);
      expect(result.reason).toBe('计划正常');
    });

    it('1 失败（在阈值 0.3 以下且不连续）应返回 shouldReplan: true', () => {
      // 10 步中失败 1 步：失败率 = 0.1，未超过 0.3 阈值
      // 但因为 plan.steps 中存在 failed 状态且 failedSteps 包含，应返回 true
      const steps: PlanStep[] = [];
      for (let i = 1; i <= 10; i++) {
        steps.push({
          step: i,
          description: `s${i}`,
          dependsOn: [],
          status: i === 5 ? 'failed' : 'pending',
        });
      }
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps,
        isDynamic: true,
        createdAt: Date.now(),
      };
      const result = planner.detectDrift(plan, [], [5]);
      expect(result.shouldReplan).toBe(true);
      expect(result.reason).toBe('存在失败步骤');
    });

    it('100% 失败时（所有步骤都失败）应返回 shouldReplan: true', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'failed' },
          { step: 2, description: 's2', dependsOn: [], status: 'failed' },
          { step: 3, description: 's3', dependsOn: [], status: 'failed' },
          { step: 4, description: 's4', dependsOn: [], status: 'failed' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const result = planner.detectDrift(plan, [], [1, 2, 3, 4]);
      expect(result.shouldReplan).toBe(true);
      // 失败率 100% > 30% 阈值，优先匹配"失败率过高"
      expect(result.reason).toBe('失败率过高');
    });

    it('计划为空时（0 步）应返回 shouldReplan: false', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const result = planner.detectDrift(plan, [], []);
      expect(result.shouldReplan).toBe(false);
      expect(result.reason).toBe('计划为空');
    });
  });

  describe('topologicalSort', () => {
    it('应正确按 dependsOn 排序', () => {
      const steps: PlanStep[] = [
        { step: 3, description: 'c', dependsOn: [2], status: 'pending' },
        { step: 1, description: 'a', dependsOn: [], status: 'pending' },
        { step: 2, description: 'b', dependsOn: [1], status: 'pending' },
      ];
      const sorted = planner.topologicalSort(steps);
      expect(sorted.map(s => s.step)).toEqual([1, 2, 3]);
    });

    it('检测到循环依赖时应抛错', () => {
      const steps: PlanStep[] = [
        { step: 1, description: 'a', dependsOn: [2], status: 'pending' },
        { step: 2, description: 'b', dependsOn: [1], status: 'pending' },
      ];
      expect(() => planner.topologicalSort(steps)).toThrow('存在循环依赖');
    });

    it('大型计划（100+ 步骤）的 topologicalSort 性能测试', () => {
      // 构造 120 个步骤的链式依赖：1 -> 2 -> 3 -> ... -> 120
      const steps: PlanStep[] = [];
      for (let i = 1; i <= 120; i++) {
        steps.push({
          step: i,
          description: `step-${i}`,
          dependsOn: i === 1 ? [] : [i - 1],
          status: 'pending',
        });
      }
      const start = performance.now();
      const sorted = planner.topologicalSort(steps);
      const duration = performance.now() - start;

      expect(sorted).toHaveLength(120);
      // 链式依赖：排序结果必须是 1..120 顺序
      expect(sorted.map(s => s.step)).toEqual(
        Array.from({ length: 120 }, (_, i) => i + 1),
      );
      // 性能阈值：120 步应在 100ms 内完成
      expect(duration).toBeLessThan(100);
    });

    it('深层依赖（5 层嵌套）的 topologicalSort 测试', () => {
      // 构造菱形依赖：1 -> 2,3 -> 4,5 -> 6
      const steps: PlanStep[] = [
        { step: 1, description: 'root', dependsOn: [], status: 'pending' },
        { step: 2, description: 'L', dependsOn: [1], status: 'pending' },
        { step: 3, description: 'R', dependsOn: [1], status: 'pending' },
        { step: 4, description: 'LL', dependsOn: [2], status: 'pending' },
        { step: 5, description: 'RR', dependsOn: [3], status: 'pending' },
        { step: 6, description: 'leaf', dependsOn: [4, 5], status: 'pending' },
      ];
      const sorted = planner.topologicalSort(steps);
      const positions = new Map<number, number>();
      sorted.forEach((s, i) => positions.set(s.step, i));

      // 验证拓扑顺序：所有依赖必须在被依赖者之前
      for (const step of steps) {
        for (const dep of step.dependsOn) {
          expect(positions.get(dep)).toBeLessThan(positions.get(step.step)!);
        }
      }
      // 根节点应排第一
      expect(sorted[0].step).toBe(1);
      // 叶节点应排最后
      expect(sorted[sorted.length - 1].step).toBe(6);
    });
  });

  describe('advancePlan', () => {
    it('应标记指定步骤为 completed', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'in_progress' },
          { step: 2, description: 's2', dependsOn: [1], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const advanced = planner.advancePlan(plan, 0);
      expect(advanced.steps[0].status).toBe('completed');
    });

    it('不应修改原始 plan', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'in_progress' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const advanced = planner.advancePlan(plan, 0);
      expect(plan.steps[0].status).toBe('in_progress');
      expect(advanced.steps[0].status).toBe('completed');
    });

    it('应解锁下游步骤（依赖全部完成时保持 pending）', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'in_progress' },
          { step: 2, description: 's2', dependsOn: [1], status: 'pending' },
          { step: 3, description: 's3', dependsOn: [1, 2], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const advanced = planner.advancePlan(plan, 0);
      expect(advanced.steps[0].status).toBe('completed');
      expect(advanced.steps[1].status).toBe('pending');
      expect(advanced.steps[2].status).toBe('pending');
    });

    it('级联推进（10 层依赖链）应逐步完成所有步骤', () => {
      // 构造 10 层链式依赖：1 -> 2 -> 3 -> ... -> 10
      const steps: PlanStep[] = [];
      for (let i = 1; i <= 10; i++) {
        steps.push({
          step: i,
          description: `s${i}`,
          dependsOn: i === 1 ? [] : [i - 1],
          status: 'pending',
        });
      }
      let plan: ExecutionPlan = {
        id: 'chain',
        intent: 'test chain',
        steps,
        isDynamic: true,
        createdAt: Date.now(),
      };

      // 标记第一步为 in_progress 以模拟执行器状态
      plan.steps[0].status = 'in_progress';

      // 连续推进 10 次：每步完成后下一步依赖已满足
      for (let i = 0; i < 10; i++) {
        plan = planner.advancePlan(plan, i);
        expect(plan.steps[i].status).toBe('completed');
      }

      // 全部步骤应已 completed
      expect(plan.steps.every(s => s.status === 'completed')).toBe(true);
    });
  });

  describe('getNextExecutableSteps', () => {
    it('应返回依赖全部 completed 的 pending 步骤', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'completed' },
          { step: 2, description: 's2', dependsOn: [1], status: 'pending' },
          { step: 3, description: 's3', dependsOn: [2], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const next = planner.getNextExecutableSteps(plan);
      expect(next.length).toBe(1);
      expect(next[0].step).toBe(2);
    });

    it('没有可执行步骤时应返回空数组', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'in_progress' },
          { step: 2, description: 's2', dependsOn: [1], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const next = planner.getNextExecutableSteps(plan);
      expect(next.length).toBe(0);
    });
  });

  describe('estimateProgress', () => {
    it('应正确计算进度和预估剩余时间', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'completed' },
          { step: 2, description: 's2', dependsOn: [], status: 'completed' },
          { step: 3, description: 's3', dependsOn: [], status: 'pending' },
          { step: 4, description: 's4', dependsOn: [], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const progress = planner.estimateProgress(plan);
      expect(progress.completed).toBe(2);
      expect(progress.total).toBe(4);
      expect(progress.percentage).toBe(50);
      expect(progress.estimatedRemainingMs).toBe(10000);
    });

    it('计划为空时应返回 0%', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const progress = planner.estimateProgress(plan);
      expect(progress.completed).toBe(0);
      expect(progress.total).toBe(0);
      expect(progress.percentage).toBe(0);
      expect(progress.estimatedRemainingMs).toBe(0);
    });

    it('单步计划（已完成）应返回 100%', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 'only', dependsOn: [], status: 'completed' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const progress = planner.estimateProgress(plan);
      expect(progress.completed).toBe(1);
      expect(progress.total).toBe(1);
      expect(progress.percentage).toBe(100);
      expect(progress.estimatedRemainingMs).toBe(0);
    });

    it('单步计划（未完成）应返回 0%', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 'only', dependsOn: [], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const progress = planner.estimateProgress(plan);
      expect(progress.completed).toBe(0);
      expect(progress.total).toBe(1);
      expect(progress.percentage).toBe(0);
      expect(progress.estimatedRemainingMs).toBe(5000);
    });

    it('计划内已包含 failed / in_progress / skipped 时只统计 completed', () => {
      const plan: ExecutionPlan = {
        id: '1',
        intent: 'test',
        steps: [
          { step: 1, description: 's1', dependsOn: [], status: 'completed' },
          { step: 2, description: 's2', dependsOn: [], status: 'in_progress' },
          { step: 3, description: 's3', dependsOn: [], status: 'failed' },
          { step: 4, description: 's4', dependsOn: [], status: 'skipped' },
          { step: 5, description: 's5', dependsOn: [], status: 'pending' },
        ],
        isDynamic: true,
        createdAt: Date.now(),
      };
      const progress = planner.estimateProgress(plan);
      expect(progress.completed).toBe(1);
      expect(progress.total).toBe(5);
      expect(progress.percentage).toBe(20);
      // 剩余 4 步 * 5000ms
      expect(progress.estimatedRemainingMs).toBe(20000);
    });
  });
});
