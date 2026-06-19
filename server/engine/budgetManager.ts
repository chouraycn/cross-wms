/**
 * BudgetManager — 预算管理模块
 *
 * 管理 ReAct 循环的轮数和 Token 消耗预算。
 * 双模计数：有 API usage 时精确累计，无则使用 estimateTokens() 估算。
 *
 * 核心方法：
 * - checkBudget: 检查预算是否超限
 * - accumulateTokens: 累计 Token 使用量
 * - incrementTurn: 递增轮数
 * - isExceeded: 判断是否超限
 * - getRemaining: 获取剩余预算
 * - setAdaptiveMaxTurns: 按复杂度等级动态调整预算（v6.0 P1-3）
 *
 * v5.0.0: ReAct 循环优化
 * v6.0.0: P1-3 自适应预算 — 按复杂度动态调整 maxTurns/maxTokens
 */

import { estimateTokens } from './contextTruncate.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 预算配置 */
export interface BudgetConfig {
  /** 最大循环轮数（默认 10） */
  maxTurns: number;
  /** 最大 Token 预算（默认 50000，按 total_tokens 累计） */
  maxTokens: number;
  /** Working Memory 滑窗大小（默认 5） */
  windowSize: number;
}

/** Token 使用量 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 预算检查结果 */
export interface BudgetCheckResult {
  exceeded: boolean;
  reason: string; // 'turns_exceeded' | 'tokens_exceeded' | ''
  consumedTokens: number;
  consumedTurns: number;
}

/** 预算剩余量 */
export interface BudgetRemaining {
  remainingTurns: number;
  remainingTokens: number;
}

/** 默认预算配置 */
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  maxTurns: 10,
  maxTokens: 50000,
  windowSize: 5,
};

// ===================== v6.0: P1-3 自适应预算映射 =====================

/** v6.0: P1-3 复杂度等级对应的 maxTurns 映射 */
const ADAPTIVE_MAX_TURNS: Record<string, number> = {
  simple: 3,
  moderate: 8,
  complex: 15,
};

// ===================== BudgetManager 类 =====================

/**
 * 预算管理器 — 管理 ReAct 循环的轮数和 Token 消耗。
 *
 * 双模计数策略：
 * - 有 API usage 字段时精确累计（promptTokens + completionTokens）
 * - 无 usage 时使用 estimateTokens() 估算文本 token 数
 *
 * v6.0: P1-3 自适应预算 — 按复杂度等级动态调整 maxTurns 和 maxTokens。
 * 显式传入 maxTurns 时不受自适应逻辑覆盖。
 */
export class BudgetManager {
  private maxTurns: number;
  private maxTokens: number;
  private consumedTokens: number;
  private currentTurn: number;
  /** v6.0: P1-3 标记是否由调用方显式传入 maxTurns（自适应时不覆盖） */
  private explicitMaxTurns: boolean;

  constructor(config?: Partial<BudgetConfig>) {
    const merged = { ...DEFAULT_BUDGET_CONFIG, ...config };
    this.maxTurns = merged.maxTurns;
    this.maxTokens = merged.maxTokens;
    this.explicitMaxTurns = config?.maxTurns !== undefined;
    this.consumedTokens = 0;
    this.currentTurn = 0;
  }

  /**
   * 检查预算是否超限。
   *
   * @returns 预算检查结果
   */
  checkBudget(): BudgetCheckResult {
    if (this.currentTurn >= this.maxTurns) {
      return {
        exceeded: true,
        reason: 'turns_exceeded',
        consumedTokens: this.consumedTokens,
        consumedTurns: this.currentTurn,
      };
    }

    if (this.consumedTokens >= this.maxTokens) {
      return {
        exceeded: true,
        reason: 'tokens_exceeded',
        consumedTokens: this.consumedTokens,
        consumedTurns: this.currentTurn,
      };
    }

    return {
      exceeded: false,
      reason: '',
      consumedTokens: this.consumedTokens,
      consumedTurns: this.currentTurn,
    };
  }

  /**
   * 累计 Token 使用量。
   * 有 usage 时精确累计，无 usage 时用 estimateTokens 估算。
   *
   * @param usage - API 返回的 token 使用量（可选）
   * @param fallbackText - 无 usage 时用于估算的文本
   */
  accumulateTokens(usage?: TokenUsage, fallbackText?: string): void {
    if (usage && usage.totalTokens > 0) {
      this.consumedTokens += usage.totalTokens;
    } else if (fallbackText) {
      this.consumedTokens += estimateTokens(fallbackText);
    }
  }

  /**
   * 递增轮数。
   */
  incrementTurn(): void {
    this.currentTurn += 1;
  }

  /**
   * 判断预算是否已超限。
   */
  isExceeded(): boolean {
    return this.currentTurn >= this.maxTurns || this.consumedTokens >= this.maxTokens;
  }

  /**
   * 获取剩余预算。
   */
  getRemaining(): BudgetRemaining {
    return {
      remainingTurns: Math.max(0, this.maxTurns - this.currentTurn),
      remainingTokens: Math.max(0, this.maxTokens - this.consumedTokens),
    };
  }

  /** 获取已消耗的 Token 数 */
  getConsumedTokens(): number {
    return this.consumedTokens;
  }

  /** 获取当前轮数 */
  getCurrentTurn(): number {
    return this.currentTurn;
  }

  /** 获取最大轮数 */
  getMaxTurns(): number {
    return this.maxTurns;
  }

  /** 获取最大 Token 数 */
  getMaxTokens(): number {
    return this.maxTokens;
  }

  /**
   * v6.0: P1-3 按复杂度等级设置自适应 maxTurns。
   * 显式传入 maxTurns 时不覆盖（向前兼容）。
   * 预算调整在执行中发生时，当前轮不受影响（下一轮生效）。
   *
   * @param level - 复杂度等级（simple / moderate / complex）
   * @param onSSEEvent - SSE 事件回调（可选）
   */
  setAdaptiveMaxTurns(level: string, onSSEEvent?: (event: Record<string, unknown>) => void): void {
    if (this.explicitMaxTurns) return; // 显式传入时不覆盖

    const newMaxTurns = ADAPTIVE_MAX_TURNS[level];
    if (newMaxTurns && newMaxTurns !== this.maxTurns) {
      const oldMaxTurns = this.maxTurns;
      const oldMaxTokens = this.maxTokens;
      this.maxTurns = newMaxTurns;
      this.maxTokens = newMaxTurns * 5000; // 同步调整 token 预算

      if (onSSEEvent) {
        onSSEEvent({
          type: 'budget_adjusted',
          oldMaxTurns,
          newMaxTurns,
          oldMaxTokens,
          newMaxTokens: this.maxTokens,
          reason: `complexity_level_${level}`,
        });
      }

      logger.debug(`[BudgetManager] 自适应预算调整: maxTurns ${oldMaxTurns}→${newMaxTurns}, maxTokens ${oldMaxTokens}→${this.maxTokens} (level=${level})`);
    }
  }
}
