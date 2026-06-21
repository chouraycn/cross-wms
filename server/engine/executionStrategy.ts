/**
 * Execution Strategy — 执行策略框架
 *
 * v3.0.0: 三种策略：
 * - LegacyStrategy: 轻量模式，直接调用 executeToolLoop，适合简单任务
 * - ReactStrategy: 完整模式，包含 Planner + Observer + 工具循环，适合复杂任务
 * - AgentStrategy: 多 Agent 编排模式，任务拆分 + 并行执行 + 结果合成
 */

import {
  executeToolLoop,
  type ToolExecutorOptions,
  type ToolExecutionResult,
} from './toolExecutor.js';
import { Observer } from './observer.js';
import { ReActExecutor } from './reactExecutor.js';
import { Planner } from './planner.js';
import { type BudgetConfig, DEFAULT_BUDGET_CONFIG } from './budgetManager.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { getMergedStrategyPreferences } from './soulLoader.js';
import { AgentOrchestrator } from './agentOrchestrator.js';
import { logger } from '../logger.js';

// ===================== 执行模式枚举 =====================

/** 执行模式 */
export enum ExecutionMode {
  /** 轻量模式：直接调用 executeToolLoop，无反思/规划 */
  LEGACY = 'legacy',
  /** 完整模式：推理-行动-观察-反思循环（含 Planner + Observer） */
  REACT = 'react',
  /** 多 Agent 编排模式：任务拆分 + Agent 分配 + 并行执行 + 结果合成 */
  AGENT = 'agent',
}

// ===================== 策略选项 =====================

/** 执行策略选项，扩展 ToolExecutorOptions */
export interface ExecutionStrategyOptions extends ToolExecutorOptions {
  /** 执行模式 */
  executionMode: ExecutionMode;
  /** SSE 事件回调（用于推送 observer_reflection 等事件） */
  onSSEEvent?: (event: Record<string, unknown>) => void;
  /** v5.0: 预算配置（传递给 ReActExecutor） */
  budgetConfig?: Partial<BudgetConfig>;
}

// ===================== 策略接口 =====================

/** 执行策略接口 */
export interface IExecutionStrategy {
  /** 执行工具循环 */
  execute(options: ExecutionStrategyOptions): Promise<ToolExecutionResult>;
}

// ===================== LegacyStrategy =====================

/**
 * 轻量策略 — 直接调用 executeToolLoop，行为与原始完全一致。
 * 适合简单任务，无额外反思/规划开销。
 */
export class LegacyStrategy implements IExecutionStrategy {
  private circuitBreaker = new CircuitBreaker();

  async execute(options: ExecutionStrategyOptions): Promise<ToolExecutionResult> {
    // 剥离策略相关字段，传递纯 ToolExecutorOptions
    const { executionMode, onSSEEvent, budgetConfig, ...toolOptions } = options;
    return executeToolLoop({
      ...toolOptions,
      circuitBreaker: this.circuitBreaker,
      onSSEEvent,
    });
  }
}

// ===================== ReactStrategy =====================

/**
 * 完整策略 — 实现 ReAct (Reasoning + Acting) 循环。
 *
 * 使用 ReActExecutor 执行完整的推理-行动-观察-反思循环。
 * 包含 Planner（任务规划）、Observer（反思评估）、BudgetManager（预算管理）。
 * 失败时降级为 LegacyStrategy。
 */
export class ReactStrategy implements IExecutionStrategy {
  // 复用 Observer/Planner 实例，避免每次请求重新创建
  private static sharedObserver: Observer | null = null;
  private static sharedPlanner: Planner | null = null;

  async execute(options: ExecutionStrategyOptions): Promise<ToolExecutionResult> {
    // 懒加载共享实例
    if (!ReactStrategy.sharedObserver) {
      ReactStrategy.sharedObserver = new Observer();
    }
    if (!ReactStrategy.sharedPlanner) {
      ReactStrategy.sharedPlanner = new Planner();
    }
    // v8.5: 人格联动 — 合并 SOUL.md 的 budget 覆盖
    const personalityBudgetOverride = ExecutionStrategyFactory.getPersonalityBudgetOverride();
    const mergedBudgetConfig = {
      ...personalityBudgetOverride,
      ...options.budgetConfig,  // 显式传入的优先
    };

    const executor = new ReActExecutor(
      ReactStrategy.sharedObserver,
      ReactStrategy.sharedPlanner,
      mergedBudgetConfig,
    );
    try {
      const result = await executor.execute(options);
      return {
        content: result.content,
        toolCalls: result.toolCalls,
      };
    } catch (error) {
      // 降级：ReAct 失败 → Legacy
      logger.error('[ReActStrategy] 执行失败，降级为 Legacy:', error instanceof Error ? error.message : String(error));
      return new LegacyStrategy().execute(options);
    }
  }
}

// ===================== AgentStrategy =====================

/**
 * 多 Agent 编排策略 — 使用 AgentOrchestrator 执行任务。
 *
 * 流程：
 * 1. 评估任务复杂度
 * 2. 简单任务 → 降级为 ReactStrategy
 * 3. 复杂任务 → 拆分为子任务 DAG，分配 Agent，并行执行，合成结果
 * 4. 编排失败 → 降级为 ReactStrategy
 */
export class AgentStrategy implements IExecutionStrategy {
  private static sharedOrchestrator: AgentOrchestrator | null = null;

  async execute(options: ExecutionStrategyOptions): Promise<ToolExecutionResult> {
    // 懒加载共享实例
    if (!AgentStrategy.sharedOrchestrator) {
      AgentStrategy.sharedOrchestrator = new AgentOrchestrator();
    }

    try {
      const result = await AgentStrategy.sharedOrchestrator.execute(options);
      return {
        content: result.content,
        toolCalls: result.toolCalls,
      };
    } catch (error) {
      // 降级：Agent 编排失败 → ReAct
      logger.error('[AgentStrategy] 编排失败，降级为 ReAct:', error instanceof Error ? error.message : String(error));
      return new ReactStrategy().execute(options);
    }
  }
}

// ===================== 工厂 =====================

/**
 * 执行策略工厂 — 根据模式创建对应的策略实例。
 */
export class ExecutionStrategyFactory {
  /**
   * 根据执行模式创建策略实例。
   */
  static create(mode: ExecutionMode): IExecutionStrategy {
    switch (mode) {
      case ExecutionMode.LEGACY:
        return new LegacyStrategy();
      case ExecutionMode.REACT:
        return new ReactStrategy();
      case ExecutionMode.AGENT:
        return new AgentStrategy();
      default:
        return new ReactStrategy();
    }
  }

  /**
   * 获取默认执行模式。
   * v3.0.0: 默认使用 REACT（更智能），简单任务由内部复杂度评估自动降级。
   * AGENT 模式需显式指定或由 chatService 根据任务复杂度自动选择。
   */
  static getDefaultMode(): ExecutionMode {
    return ExecutionMode.REACT;
  }

  /**
   * v8.5: 获取人格层影响的预算配置覆盖。
   * 将 SOUL.md 中的 maxTurnsMultiplier 应用到 budgetConfig。
   */
  static getPersonalityBudgetOverride(): Partial<BudgetConfig> {
    const soulPrefs = getMergedStrategyPreferences();
    return {
      maxTurns: Math.round(DEFAULT_BUDGET_CONFIG.maxTurns * soulPrefs.maxTurnsMultiplier),
    };
  }

  /**
   * v8.5: 获取人格层的 Observer 快速路径设置。
   */
  static getPersonalityObserverFastPath(): boolean {
    return getMergedStrategyPreferences().observerFastPath;
  }
}
