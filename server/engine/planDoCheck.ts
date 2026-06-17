/**
 * PlanDoCheck — 多轮 Plan-Do-Check 循环管理
 *
 * 扩展 Planner 的执行循环，支持 PDCA (Plan-Do-Check-Act) 模式。
 * 每轮 Check 后决定：Continue（继续）、Adjust（调整计划）、Abort（中止）。
 *
 * v6.0: P2-2 多轮 Plan-Do-Check
 */

import type { ExecutionPlan } from './planner.js';

// ===================== 类型定义 =====================

/** PDCA 循环决策 */
export type PDCADecision = 'continue' | 'adjust' | 'abort';

/** PDCA 检查结果 */
export interface PDCACheckResult {
  /** 当前决策 */
  decision: PDCADecision;
  /** 决策原因 */
  reason: string;
  /** 已完成步骤数 */
  completedSteps: number;
  /** 失败步骤数 */
  failedSteps: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 进度百分比 (0-100) */
  progressPercent: number;
  /** 调整建议（decision=adjust 时） */
  adjustmentSuggestion?: string;
  /** 置信度 (1-10) */
  confidence: number;
}

/** PDCA 循环状态 */
export interface PDCAState {
  /** 当前循环轮次 */
  cycleIndex: number;
  /** 最大循环轮次 */
  maxCycles: number;
  /** 各轮检查结果 */
  checkResults: PDCACheckResult[];
  /** 当前是否在调整中 */
  isAdjusting: boolean;
}

// ===================== 常量 =====================

/** 默认最大 PDCA 循环次数 */
const DEFAULT_MAX_CYCLES = 3;

/** 触发调整的失败步骤比例阈值 */
const ADJUST_FAILURE_THRESHOLD = 0.4; // 40% 步骤失败则建议调整

/** 触发中止的失败步骤比例阈值 */
const ABORT_FAILURE_THRESHOLD = 0.7; // 70% 步骤失败则建议中止

// ===================== PlanDoCheck 类 =====================

export class PlanDoCheck {
  private state: PDCAState;

  constructor(maxCycles?: number) {
    this.state = {
      cycleIndex: 0,
      maxCycles: maxCycles ?? DEFAULT_MAX_CYCLES,
      checkResults: [],
      isAdjusting: false,
    };
  }

  /**
   * 执行 PDCA Check 阶段：评估当前计划执行进度，决定下一步行动。
   *
   * @param plan - 当前执行计划
   * @param confidenceScore - 反思置信度评分 (1-10)
   * @returns 检查结果 + 决策
   */
  check(
    plan: ExecutionPlan | undefined,
    confidenceScore: number,
  ): PDCACheckResult {
    // 无计划时直接继续
    if (!plan) {
      return {
        decision: 'continue',
        reason: '无执行计划，自由执行',
        completedSteps: 0,
        failedSteps: 0,
        totalSteps: 0,
        progressPercent: 100,
        confidence: confidenceScore,
      };
    }

    const totalSteps = plan.steps.length;
    const completedSteps = plan.steps.filter(s => s.status === 'completed').length;
    const failedSteps = plan.steps.filter(s => s.status === 'failed').length;
    const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    // 计算失败比例
    const finishedSteps = completedSteps + failedSteps;
    const failureRatio = finishedSteps > 0 ? failedSteps / finishedSteps : 0;

    let decision: PDCADecision;
    let reason: string;
    let adjustmentSuggestion: string | undefined;

    // 决策逻辑
    if (progressPercent === 100) {
      decision = 'continue';
      reason = '所有步骤已完成';
    } else if (failureRatio >= ABORT_FAILURE_THRESHOLD) {
      decision = 'abort';
      reason = `失败率过高(${Math.round(failureRatio * 100)}%)，建议中止任务`;
    } else if (failureRatio >= ADJUST_FAILURE_THRESHOLD || confidenceScore < 3) {
      decision = 'adjust';
      reason = confidenceScore < 3
        ? `置信度过低(${confidenceScore}/10)，建议调整计划`
        : `失败率较高(${Math.round(failureRatio * 100)}%)，建议调整计划`;
      adjustmentSuggestion = '建议重新评估剩余步骤的可行性和依赖关系';
    } else if (this.state.cycleIndex >= this.state.maxCycles - 1 && failureRatio > 0) {
      decision = 'continue';
      reason = `已达到最大循环次数(${this.state.maxCycles})，继续执行当前计划`;
    } else {
      decision = 'continue';
      reason = `进度正常(${progressPercent}%)，继续执行`;
    }

    const result: PDCACheckResult = {
      decision,
      reason,
      completedSteps,
      failedSteps,
      totalSteps,
      progressPercent,
      adjustmentSuggestion,
      confidence: confidenceScore,
    };

    // 更新状态
    this.state.checkResults.push(result);
    this.state.cycleIndex++;
    this.state.isAdjusting = decision === 'adjust';

    return result;
  }

  /** 获取当前 PDCA 状态 */
  getState(): PDCAState {
    return { ...this.state };
  }

  /** 判断是否仍在 PDCA 循环中 */
  shouldContinueCycle(): boolean {
    return this.state.cycleIndex < this.state.maxCycles;
  }

  /** 重置状态 */
  reset(): void {
    this.state = {
      cycleIndex: 0,
      maxCycles: this.state.maxCycles,
      checkResults: [],
      isAdjusting: false,
    };
  }
}
