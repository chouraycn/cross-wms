/**
 * PlanDoCheck 单元测试
 *
 * v6.0: P2-2 多轮 Plan-Do-Check
 * - PDCA 循环：Plan → Do → Check → Act
 * - 40% 失败 → adjust，70% 失败 → abort
 * - 默认 3 轮，可配置
 * - 无计划时 continue
 * - 所有步骤完成时 continue
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PlanDoCheck, PDCADecision, PDCACheckResult } from '../engine/planDoCheck.js';
import type { ExecutionPlan } from '../engine/planner.js';

// Helper: 创建简单的 ExecutionPlan
function createPlan(
  stepCount: number,
  completedCount: number = 0,
  failedCount: number = 0,
): ExecutionPlan {
  const steps = [];
  for (let i = 0; i < stepCount; i++) {
    let status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
    if (i < completedCount) {
      status = 'completed';
    } else if (i < completedCount + failedCount) {
      status = 'failed';
    } else {
      status = 'pending';
    }
    steps.push({
      step: i + 1,
      description: `步骤 ${i + 1}`,
      dependsOn: [],
      status,
    });
  }
  return {
    id: 'test-plan',
    intent: '测试意图',
    steps,
    isDynamic: true,
    createdAt: Date.now(),
  };
}

describe('PlanDoCheck', () => {
  let pdc: PlanDoCheck;

  beforeEach(() => {
    pdc = new PlanDoCheck();
  });

  describe('无计划时', () => {
    it('无计划时应返回 continue', () => {
      const result = pdc.check(undefined, 7);
      expect(result.decision).toBe('continue');
      expect(result.reason).toContain('无执行计划');
      expect(result.completedSteps).toBe(0);
      expect(result.failedSteps).toBe(0);
      expect(result.totalSteps).toBe(0);
      expect(result.progressPercent).toBe(100);
    });
  });

  describe('所有步骤完成', () => {
    it('所有步骤完成时应返回 continue', () => {
      const plan = createPlan(5, 5, 0);
      const result = pdc.check(plan, 8);
      expect(result.decision).toBe('continue');
      expect(result.reason).toContain('所有步骤已完成');
      expect(result.progressPercent).toBe(100);
    });
  });

  describe('进度正常', () => {
    it('低失败率高置信度时应继续', () => {
      const plan = createPlan(10, 5, 1); // 1/6 = 16.7% failure
      const result = pdc.check(plan, 7);
      expect(result.decision).toBe('continue');
      expect(result.progressPercent).toBe(50);
    });
  });

  describe('adjust 决策', () => {
    it('40% 失败率触发 adjust', () => {
      // 5 completed, 2 failed → 2/7 ≈ 28.6%, not enough
      // 3 completed, 2 failed → 2/5 = 40% → adjust
      const plan = createPlan(10, 3, 2); // 2/5 = 40%
      const result = pdc.check(plan, 5);
      expect(result.decision).toBe('adjust');
      expect(result.adjustmentSuggestion).toBeDefined();
    });

    it('置信度低于 3 触发 adjust', () => {
      const plan = createPlan(10, 5, 0); // 0% failure
      const result = pdc.check(plan, 2);
      expect(result.decision).toBe('adjust');
      expect(result.reason).toContain('置信度过低');
    });
  });

  describe('abort 决策', () => {
    it('70% 失败率触发 abort', () => {
      // 3 completed, 7 failed → 7/10 = 70% → abort
      const plan = createPlan(10, 3, 7);
      const result = pdc.check(plan, 5);
      expect(result.decision).toBe('abort');
      expect(result.reason).toContain('失败率过高');
    });
  });

  describe('最大循环次数', () => {
    it('默认最大循环为 3', () => {
      const state = pdc.getState();
      expect(state.maxCycles).toBe(3);
    });

    it('可自定义最大循环次数', () => {
      const customPdc = new PlanDoCheck(5);
      const state = customPdc.getState();
      expect(state.maxCycles).toBe(5);
    });

    it('达到最大循环次数时即使有失败也继续', () => {
      const customPdc = new PlanDoCheck(2);
      // 第一轮
      const plan = createPlan(10, 5, 1);
      customPdc.check(plan, 5);
      // 第二轮（已达到 maxCycles - 1 = 1）
      const result = customPdc.check(plan, 5);
      expect(result.decision).toBe('continue');
      expect(result.reason).toContain('最大循环次数');
    });

    it('shouldContinueCycle 在循环次数内返回 true', () => {
      expect(pdc.shouldContinueCycle()).toBe(true);
    });
  });

  describe('状态更新', () => {
    it('每次 check 后 cycleIndex 递增', () => {
      const plan = createPlan(10, 5, 0);
      pdc.check(plan, 8);
      expect(pdc.getState().cycleIndex).toBe(1);

      pdc.check(plan, 8);
      expect(pdc.getState().cycleIndex).toBe(2);
    });

    it('adjust 决策时 isAdjusting 为 true', () => {
      const plan = createPlan(10, 3, 2);
      pdc.check(plan, 5);
      expect(pdc.getState().isAdjusting).toBe(true);
    });

    it('continue 决策时 isAdjusting 为 false', () => {
      const plan = createPlan(10, 5, 0);
      pdc.check(plan, 8);
      expect(pdc.getState().isAdjusting).toBe(false);
    });

    it('checkResults 累积记录', () => {
      const plan = createPlan(10, 5, 0);
      pdc.check(plan, 8);
      pdc.check(plan, 8);
      expect(pdc.getState().checkResults.length).toBe(2);
    });
  });

  describe('reset', () => {
    it('reset 清空状态但保留 maxCycles', () => {
      const customPdc = new PlanDoCheck(5);
      const plan = createPlan(10, 5, 1);
      customPdc.check(plan, 5);
      customPdc.check(plan, 5);

      customPdc.reset();

      const state = customPdc.getState();
      expect(state.cycleIndex).toBe(0);
      expect(state.checkResults.length).toBe(0);
      expect(state.isAdjusting).toBe(false);
      expect(state.maxCycles).toBe(5);
    });
  });

  describe('边界条件', () => {
    it('空步骤计划应继续（progressPercent=0）', () => {
      const plan = createPlan(0);
      const result = pdc.check(plan, 5);
      expect(result.decision).toBe('continue');
      expect(result.progressPercent).toBe(0);
      expect(result.totalSteps).toBe(0);
    });

    it('所有步骤失败触发 abort', () => {
      const plan = createPlan(5, 0, 5);
      const result = pdc.check(plan, 5);
      expect(result.decision).toBe('abort');
    });
  });
});
