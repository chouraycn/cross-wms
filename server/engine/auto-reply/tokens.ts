/**
 * Token 计数与用量统计 — auto-reply 层的轻量封装。
 *
 * 参考 openclaw/src/auto-reply/tokens.ts 的设计，但根据任务要求不复用
 * openclaw 的 silent-reply token 逻辑，而是与 cross-wms 已有的
 * server/engine/llm/token-counter.ts 与 server/engine/llm/price-calculator.ts
 * 集成：本文件只做适配与累计，底层估算 / 计费调用既有实现。
 *
 * 提供的能力：
 * - `countTokens(text, model?)`：估算单段文本的 token 数
 * - `TokenCounter` 类：跨多次调用累计 token 用量与费用，并提供 `getStats()`
 */
import type { Api, Model, Usage } from '../llm/types.js';
import {
  estimateTokensForText,
  estimateTokensForModel,
} from '../llm/token-counter.js';
import {
  computeCost,
  type CostBreakdown,
} from '../llm/price-calculator.js';

/** 用量统计快照。 */
export type TokenStats = {
  /** 累计估算的输入 token（仅由 `count` 累计，未经真实 usage 校正）。 */
  estimatedInput: number;
  /** 通过 `recordUsage` 记录的真实输入 token 累计。 */
  input: number;
  /** 通过 `recordUsage` 记录的真实输出 token 累计。 */
  output: number;
  /** 通过 `recordUsage` 记录的缓存读 token 累计。 */
  cacheRead: number;
  /** 通过 `recordUsage` 记录的缓存写 token 累计。 */
  cacheWrite: number;
  /** 累计费用（USD）。 */
  cost: CostBreakdown;
  /** 已记录的调用次数。 */
  calls: number;
};

/** `TokenCounter` 的构造选项。 */
export type TokenCounterOptions = {
  /** 默认 API，用于在没有 model 时按 API 选择估算器。 */
  api?: Api;
  /** 默认模型，用于 `count` 与 `estimateCost`。 */
  model?: Model;
};

/** 用量记录入参（部分字段可省略，缺省按 0 处理）。 */
export type UsageInput = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

/**
 * 估算一段文本的 token 数。
 *
 * 若提供 `model`，则按模型族（API）估算；否则按默认估算器。
 * 该函数是对 `server/engine/llm/token-counter.ts` 中
 * `estimateTokensForText` / `estimateTokensForModel` 的转发。
 */
export function countTokens(text: string, model?: Model): number {
  if (!text) return 0;
  if (model) return estimateTokensForModel(text, model);
  return estimateTokensForText(text);
}

/**
 * Token 计数器：累计跨多次调用的 token 用量与费用。
 *
 * 设计要点：
 * - `count(text)` 仅做估算累计（无真实 usage 时使用），不会触发计费
 * - `recordUsage(usage, model)` 记录一次真实调用用量并计算费用
 * - `estimateCost(usage, model)` 计算单次费用但不写入累计
 * - `getStats()` 返回当前累计快照
 */
export class TokenCounter {
  private readonly options: TokenCounterOptions;
  private estimatedInput: number = 0;
  private input: number = 0;
  private output: number = 0;
  private cacheRead: number = 0;
  private cacheWrite: number = 0;
  private cost: CostBreakdown = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  };
  private calls: number = 0;

  constructor(options: TokenCounterOptions = {}) {
    this.options = options;
  }

  /** 估算单段文本的 token 数，并累加到 `estimatedInput`。 */
  count(text: string): number {
    const tokens = this.estimateTokens(text);
    this.estimatedInput += tokens;
    return tokens;
  }

  /** 仅估算 token 数，不做累计。 */
  estimateTokens(text: string): number {
    if (!text) return 0;
    if (this.options.model) {
      return estimateTokensForModel(text, this.options.model);
    }
    return estimateTokensForText(text, this.options.api);
  }

  /**
   * 记录一次真实调用的用量并累计费用。
   *
   * 若未提供 `model` 则回退到构造时配置的默认模型；若两者均缺失，
   * 则仅累计 token，跳过计费。
   */
  recordUsage(usage: UsageInput, model?: Model): CostBreakdown {
    const input = usage.input ?? 0;
    const output = usage.output ?? 0;
    const cacheRead = usage.cacheRead ?? 0;
    const cacheWrite = usage.cacheWrite ?? 0;

    this.input += input;
    this.output += output;
    this.cacheRead += cacheRead;
    this.cacheWrite += cacheWrite;
    this.calls += 1;

    const targetModel = model ?? this.options.model;
    if (!targetModel) {
      return { ...this.cost };
    }

    const breakdown = computeCost(targetModel, {
      input,
      output,
      cacheRead,
      cacheWrite,
    });
    this.cost.input += breakdown.input;
    this.cost.output += breakdown.output;
    this.cost.cacheRead += breakdown.cacheRead;
    this.cost.cacheWrite += breakdown.cacheWrite;
    this.cost.total += breakdown.total;
    return breakdown;
  }

  /**
   * 估算单次用量的费用，不写入累计。
   *
   * 若未提供 `model` 则回退到构造时配置的默认模型；若两者均缺失，
   * 返回全零的 `CostBreakdown`。
   */
  estimateCost(usage: UsageInput, model?: Model): CostBreakdown {
    const targetModel = model ?? this.options.model;
    if (!targetModel) {
      return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
    }
    return computeCost(targetModel, {
      input: usage.input ?? 0,
      output: usage.output ?? 0,
      cacheRead: usage.cacheRead ?? 0,
      cacheWrite: usage.cacheWrite ?? 0,
    });
  }

  /** 返回当前累计统计快照。 */
  getStats(): TokenStats {
    return {
      estimatedInput: this.estimatedInput,
      input: this.input,
      output: this.output,
      cacheRead: this.cacheRead,
      cacheWrite: this.cacheWrite,
      cost: { ...this.cost },
      calls: this.calls,
    };
  }

  /** 重置所有累计值。 */
  reset(): void {
    this.estimatedInput = 0;
    this.input = 0;
    this.output = 0;
    this.cacheRead = 0;
    this.cacheWrite = 0;
    this.cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
    this.calls = 0;
  }
}

/** 兼容类型导出：便于上层复用 llm 层的 Usage 形态。 */
export type { Usage, Model, Api };
