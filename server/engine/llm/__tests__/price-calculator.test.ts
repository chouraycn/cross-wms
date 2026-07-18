/**
 * price-calculator 测试 — 计费、累计、格式化。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  computeCost,
  recomputeCost,
  CostAccumulator,
  formatCost,
  formatCostDual,
  convertCost,
  setExchangeRate,
  getExchangeRate,
  formatTokens,
  computeCacheSavings,
} from '../price-calculator.js';
import type { Model, Usage } from '../types.js';

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    api: 'openai-completions',
    contextWindow: 128_000,
    cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
    ...overrides,
  };
}

function makeUsage(overrides: Partial<Usage> = {}): Usage {
  return {
    input: 1000,
    output: 500,
    cacheRead: 200,
    cacheWrite: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    ...overrides,
  };
}

describe('computeCost', () => {
  it('按每百万 token 单价计算', () => {
    const model = makeModel();
    const cost = computeCost(model, { input: 1_000_000, output: 0 });
    expect(cost.input).toBeCloseTo(2.5, 6);
    expect(cost.total).toBeCloseTo(2.5, 6);
  });

  it('输出 token 单独计价', () => {
    const model = makeModel();
    const cost = computeCost(model, { input: 0, output: 1_000_000 });
    expect(cost.output).toBeCloseTo(10, 6);
  });

  it('缓存读按 cacheRead 单价计费', () => {
    const model = makeModel();
    const cost = computeCost(model, { input: 0, output: 0, cacheRead: 1_000_000 });
    expect(cost.cacheRead).toBeCloseTo(1.25, 6);
  });

  it('total 等于四项之和', () => {
    const model = makeModel();
    const cost = computeCost(model, { input: 100, output: 50, cacheRead: 20, cacheWrite: 10 });
    expect(cost.total).toBeCloseTo(cost.input + cost.output + cost.cacheRead + cost.cacheWrite, 8);
  });
});

describe('recomputeCost', () => {
  it('从已有 Usage 重新计算（忽略原 cost）', () => {
    const model = makeModel();
    const usage = makeUsage({ cost: { input: 999, output: 999, cacheRead: 999, cacheWrite: 999, total: 999 } });
    const cost = recomputeCost(model, usage);
    expect(cost.input).not.toBe(999);
    expect(cost.input).toBeCloseTo((2.5 / 1_000_000) * 1000, 8);
  });
});

describe('CostAccumulator', () => {
  it('累计多次调用的费用', () => {
    const model = makeModel();
    const acc = new CostAccumulator();
    acc.record(model, makeUsage({ input: 1000, output: 500 }));
    acc.record(model, makeUsage({ input: 2000, output: 1000 }));
    const totals = acc.getTotals();
    expect(acc.count()).toBe(2);
    expect(totals.total).toBeGreaterThan(0);
  });

  it('getByModel 按 provider/id 分组', () => {
    const acc = new CostAccumulator();
    acc.record(makeModel({ id: 'gpt-4o', provider: 'openai' }), makeUsage({ input: 100, output: 50 }));
    acc.record(makeModel({ id: 'gpt-4o', provider: 'openai' }), makeUsage({ input: 200, output: 100 }));
    acc.record(makeModel({ id: 'claude', provider: 'anthropic', api: 'anthropic-messages' }), makeUsage({ input: 100, output: 50 }));
    const byModel = acc.getByModel();
    expect(byModel.size).toBe(2);
    expect(byModel.get('openai/gpt-4o')?.total).toBeGreaterThan(0);
  });

  it('getByProvider 按 provider 分组', () => {
    const acc = new CostAccumulator();
    acc.record(makeModel({ provider: 'openai' }), makeUsage());
    acc.record(makeModel({ provider: 'anthropic', api: 'anthropic-messages' }), makeUsage());
    const byProvider = acc.getByProvider();
    expect(byProvider.size).toBe(2);
    expect(byProvider.has('openai')).toBe(true);
  });

  it('reset 清空所有记录', () => {
    const acc = new CostAccumulator();
    acc.record(makeModel(), makeUsage());
    acc.reset();
    expect(acc.count()).toBe(0);
    expect(acc.getTotals().total).toBe(0);
  });
});

describe('formatCost', () => {
  it('0 显示为 $0.00', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('小于 0.01 显示 6 位小数', () => {
    expect(formatCost(0.001)).toBe('$0.001000');
  });

  it('大于等于 1 显示 2 位小数', () => {
    expect(formatCost(1.5)).toBe('$1.50');
  });
});

describe('formatTokens', () => {
  it('小于 1000 直接显示', () => {
    expect(formatTokens(500)).toBe('500');
  });

  it('千级显示 K', () => {
    expect(formatTokens(1500)).toBe('1.5K');
  });

  it('百万级显示 M', () => {
    expect(formatTokens(2_500_000)).toBe('2.50M');
  });
});

describe('computeCacheSavings', () => {
  it('缓存读比普通输入节省的费用', () => {
    const model = makeModel();
    const savings = computeCacheSavings(model, 1_000_000);
    expect(savings).toBeCloseTo(2.5 - 1.25, 6);
  });

  it('cacheRead 为 0 时不节省', () => {
    const model = makeModel({ cost: { input: 2.5, output: 10, cacheRead: 2.5, cacheWrite: 0 } });
    expect(computeCacheSavings(model, 1_000_000)).toBe(0);
  });
});

describe('CNY 人民币显示', () => {
  // 汇率为全局可变状态，每个测试前后重置为默认值 7.2
  beforeEach(() => {
    setExchangeRate(7.2);
  });
  afterEach(() => {
    setExchangeRate(7.2);
  });

  it('formatCost(0.5, "CNY") 返回 ¥ 开头', () => {
    const formatted = formatCost(0.5, 'CNY');
    expect(formatted.startsWith('¥')).toBe(true);
  });

  it('formatCost(0, "CNY") 返回 ¥0.00', () => {
    expect(formatCost(0, 'CNY')).toBe('¥0.00');
  });

  it('convertCost(1, "CNY") 约等于 7.2（默认汇率）', () => {
    expect(convertCost(1, 'CNY')).toBeCloseTo(7.2, 6);
  });

  it('setExchangeRate(7.0) 后 getExchangeRate() 返回 7.0', () => {
    setExchangeRate(7.0);
    expect(getExchangeRate()).toBe(7.0);
  });

  it('formatCostDual(0.5) 同时包含 $ 和 ¥', () => {
    const dual = formatCostDual(0.5);
    expect(dual).toContain('$');
    expect(dual).toContain('¥');
  });
});
