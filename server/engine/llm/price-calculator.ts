/**
 * 价格计算器 — 输入 / 输出 / 缓存 Token 计费。
 *
 * 价格单位：USD / 百万 token（与 model.cost 字段保持一致）。
 * 提供单次调用计费、累计计费、会话计费等能力。
 */
import type { Model, Usage } from './types.js';
import { calculateCost } from './model-utils.js';

/** 单次调用的计费明细。 */
export type CostBreakdown = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

/** 计费记录条目。 */
export type BillingEntry = {
  modelId: string;
  provider: string;
  usage: Usage;
  cost: CostBreakdown;
  timestamp: number;
};

/** 根据模型与 token 数量计算费用。 */
export function computeCost(
  model: Model,
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number },
): CostBreakdown {
  const usage: Usage = {
    input: tokens.input,
    output: tokens.output,
    cacheRead: tokens.cacheRead ?? 0,
    cacheWrite: tokens.cacheWrite ?? 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  calculateCost(model, usage);
  return { ...usage.cost };
}

/** 从已有 Usage（可能已含 cost）重新计算。 */
export function recomputeCost(model: Model, usage: Usage): CostBreakdown {
  return computeCost(model, {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
  });
}

/** 累计计费器：跨多次调用累计费用。 */
export class CostAccumulator {
  private entries: BillingEntry[] = [];
  private totals: CostBreakdown = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

  /** 记录一次调用。 */
  record(model: Model, usage: Usage): BillingEntry {
    const cost = computeCost(model, usage);
    const entry: BillingEntry = {
      modelId: model.id,
      provider: model.provider,
      usage: { ...usage, cost: { ...cost } },
      cost,
      timestamp: Date.now(),
    };
    this.entries.push(entry);
    this.totals.input += cost.input;
    this.totals.output += cost.output;
    this.totals.cacheRead += cost.cacheRead;
    this.totals.cacheWrite += cost.cacheWrite;
    this.totals.total += cost.total;
    return entry;
  }

  /** 返回累计费用。 */
  getTotals(): CostBreakdown {
    return { ...this.totals };
  }

  /** 按模型分组返回费用。 */
  getByModel(): Map<string, CostBreakdown> {
    const map = new Map<string, CostBreakdown>();
    for (const e of this.entries) {
      const key = `${e.provider}/${e.modelId}`;
      const cur = map.get(key) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
      cur.input += e.cost.input;
      cur.output += e.cost.output;
      cur.cacheRead += e.cost.cacheRead;
      cur.cacheWrite += e.cost.cacheWrite;
      cur.total += e.cost.total;
      map.set(key, cur);
    }
    return map;
  }

  /** 按 Provider 分组返回费用。 */
  getByProvider(): Map<string, CostBreakdown> {
    const map = new Map<string, CostBreakdown>();
    for (const e of this.entries) {
      const cur = map.get(e.provider) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
      cur.input += e.cost.input;
      cur.output += e.cost.output;
      cur.cacheRead += e.cost.cacheRead;
      cur.cacheWrite += e.cost.cacheWrite;
      cur.total += e.cost.total;
      map.set(e.provider, cur);
    }
    return map;
  }

  /** 返回所有计费条目。 */
  getEntries(): BillingEntry[] {
    return [...this.entries];
  }

  /** 重置累计器。 */
  reset(): void {
    this.entries = [];
    this.totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  }

  /** 返回记录数。 */
  count(): number {
    return this.entries.length;
  }
}

/** 货币类型。 */
export type Currency = 'USD' | 'CNY';

/** 美元对人民币汇率（默认 7.2，可通过 setExchangeRate 更新）。 */
let USD_TO_CNY_RATE = 7.2;

/** 设置美元对人民币汇率。 */
export function setExchangeRate(rate: number): void {
  USD_TO_CNY_RATE = rate;
}

/** 获取当前美元对人民币汇率。 */
export function getExchangeRate(): number {
  return USD_TO_CNY_RATE;
}

/** 将 USD 费用转换为指定货币。 */
export function convertCost(cost: number, currency: Currency = 'USD'): number {
  if (currency === 'CNY') return cost * USD_TO_CNY_RATE;
  return cost;
}

/** 格式化费用为人类可读字符串。 */
export function formatCost(cost: number, currency: Currency = 'USD'): string {
  if (cost === 0) return currency === 'CNY' ? '¥0.00' : '$0.00';
  const converted = convertCost(cost, currency);
  if (currency === 'CNY') {
    if (converted < 0.01) return `¥${converted.toFixed(6)}`;
    if (converted < 1) return `¥${converted.toFixed(4)}`;
    return `¥${converted.toFixed(2)}`;
  }
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/** 同时显示 USD 和 CNY 费用。 */
export function formatCostDual(cost: number): string {
  const usd = formatCost(cost, 'USD');
  const cny = formatCost(cost, 'CNY');
  return `${usd} (${cny})`;
}

/** 格式化 token 数量。 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${tokens}`;
}

/** 计算缓存节省金额（缓存读 vs 普通输入的差价）。 */
export function computeCacheSavings(
  model: Model,
  cacheReadTokens: number,
): number {
  // 缓存读比普通输入便宜，节省 = (input - cacheRead) * cacheReadTokens / 1M
  const normalCost = (model.cost.input / 1_000_000) * cacheReadTokens;
  const cachedCost = (model.cost.cacheRead / 1_000_000) * cacheReadTokens;
  return Math.max(0, normalCost - cachedCost);
}
