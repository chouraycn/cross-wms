/**
 * budgetManager 预算管理 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock 依赖
vi.mock('./contextTruncate.js', () => ({
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
}));

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { BudgetManager, DEFAULT_BUDGET_CONFIG } from './budgetManager.js';
import { estimateTokens } from './contextTruncate.js';

describe('BudgetManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('默认配置', () => {
    it('DEFAULT_BUDGET_CONFIG 暴露默认值', () => {
      expect(DEFAULT_BUDGET_CONFIG.maxTurns).toBe(25);
      expect(DEFAULT_BUDGET_CONFIG.maxTokens).toBe(100000);
      expect(DEFAULT_BUDGET_CONFIG.windowSize).toBe(5);
    });

    it('无参构造使用默认配置', () => {
      const bm = new BudgetManager();
      expect(bm.getMaxTurns()).toBe(25);
      expect(bm.getMaxTokens()).toBe(100000);
      expect(bm.getCurrentTurn()).toBe(0);
      expect(bm.getConsumedTokens()).toBe(0);
    });

    it('部分配置覆盖默认值', () => {
      const bm = new BudgetManager({ maxTurns: 5 });
      expect(bm.getMaxTurns()).toBe(5);
      expect(bm.getMaxTokens()).toBe(100000);
    });
  });

  describe('checkBudget', () => {
    it('初始状态未超限', () => {
      const bm = new BudgetManager();
      const result = bm.checkBudget();
      expect(result.exceeded).toBe(false);
      expect(result.reason).toBe('');
      expect(result.consumedTurns).toBe(0);
      expect(result.consumedTokens).toBe(0);
    });

    it('轮数超限时返回 turns_exceeded', () => {
      const bm = new BudgetManager({ maxTurns: 2 });
      bm.incrementTurn();
      bm.incrementTurn();
      const result = bm.checkBudget();
      expect(result.exceeded).toBe(true);
      expect(result.reason).toBe('turns_exceeded');
      expect(result.consumedTurns).toBe(2);
    });

    it('token 超限时返回 tokens_exceeded', () => {
      const bm = new BudgetManager({ maxTokens: 100 });
      bm.accumulateTokens({ promptTokens: 60, completionTokens: 50, totalTokens: 110 });
      const result = bm.checkBudget();
      expect(result.exceeded).toBe(true);
      expect(result.reason).toBe('tokens_exceeded');
    });

    it('轮数优先于 token 判断（先检查 turns）', () => {
      const bm = new BudgetManager({ maxTurns: 1, maxTokens: 10 });
      bm.incrementTurn(); // 达到 maxTurns
      bm.accumulateTokens({ promptTokens: 1, completionTokens: 1, totalTokens: 2 });
      const result = bm.checkBudget();
      expect(result.exceeded).toBe(true);
      expect(result.reason).toBe('turns_exceeded');
    });
  });

  describe('accumulateTokens', () => {
    it('有 usage 时精确累计 totalTokens', () => {
      const bm = new BudgetManager();
      bm.accumulateTokens({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
      expect(bm.getConsumedTokens()).toBe(150);
    });

    it('多次累计累加', () => {
      const bm = new BudgetManager();
      bm.accumulateTokens({ promptTokens: 10, completionTokens: 10, totalTokens: 20 });
      bm.accumulateTokens({ promptTokens: 10, completionTokens: 10, totalTokens: 20 });
      expect(bm.getConsumedTokens()).toBe(40);
    });

    it('usage.totalTokens 为 0 时不累计', () => {
      const bm = new BudgetManager();
      bm.accumulateTokens({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
      expect(bm.getConsumedTokens()).toBe(0);
    });

    it('无 usage 时使用 estimateTokens 估算 fallbackText', () => {
      const bm = new BudgetManager();
      const text = 'hello world test'; // length 16 -> ceil(16/4)=4
      bm.accumulateTokens(undefined, text);
      expect(estimateTokens).toHaveBeenCalledWith(text);
      expect(bm.getConsumedTokens()).toBe(4);
    });

    it('无 usage 且无 fallbackText 时不累计', () => {
      const bm = new BudgetManager();
      bm.accumulateTokens(undefined, undefined);
      expect(bm.getConsumedTokens()).toBe(0);
    });
  });

  describe('incrementTurn', () => {
    it('递增轮数', () => {
      const bm = new BudgetManager();
      expect(bm.getCurrentTurn()).toBe(0);
      bm.incrementTurn();
      expect(bm.getCurrentTurn()).toBe(1);
      bm.incrementTurn();
      expect(bm.getCurrentTurn()).toBe(2);
    });
  });

  describe('isExceeded', () => {
    it('未超限时返回 false', () => {
      const bm = new BudgetManager({ maxTurns: 5, maxTokens: 1000 });
      expect(bm.isExceeded()).toBe(false);
    });

    it('轮数超限返回 true', () => {
      const bm = new BudgetManager({ maxTurns: 1 });
      bm.incrementTurn();
      expect(bm.isExceeded()).toBe(true);
    });

    it('token 超限返回 true', () => {
      const bm = new BudgetManager({ maxTokens: 10 });
      bm.accumulateTokens({ promptTokens: 5, completionTokens: 6, totalTokens: 11 });
      expect(bm.isExceeded()).toBe(true);
    });
  });

  describe('getRemaining', () => {
    it('初始剩余等于最大值', () => {
      const bm = new BudgetManager({ maxTurns: 10, maxTokens: 1000 });
      const rem = bm.getRemaining();
      expect(rem.remainingTurns).toBe(10);
      expect(rem.remainingTokens).toBe(1000);
    });

    it('消耗后剩余正确递减', () => {
      const bm = new BudgetManager({ maxTurns: 10, maxTokens: 1000 });
      bm.incrementTurn();
      bm.incrementTurn();
      bm.accumulateTokens({ promptTokens: 200, completionTokens: 100, totalTokens: 300 });
      const rem = bm.getRemaining();
      expect(rem.remainingTurns).toBe(8);
      expect(rem.remainingTokens).toBe(700);
    });

    it('超限时剩余为 0 而非负数', () => {
      const bm = new BudgetManager({ maxTurns: 1, maxTokens: 10 });
      bm.incrementTurn();
      bm.incrementTurn();
      bm.accumulateTokens({ promptTokens: 100, completionTokens: 100, totalTokens: 200 });
      const rem = bm.getRemaining();
      expect(rem.remainingTurns).toBe(0);
      expect(rem.remainingTokens).toBe(0);
    });
  });

  describe('setAdaptiveMaxTurns', () => {
    it('显式传入 maxTurns 时不覆盖', () => {
      const bm = new BudgetManager({ maxTurns: 15 });
      const cb = vi.fn();
      bm.setAdaptiveMaxTurns('complex', cb);
      expect(bm.getMaxTurns()).toBe(15);
      expect(cb).not.toHaveBeenCalled();
    });

    it('simple 等级调整 maxTurns 为 8', () => {
      const bm = new BudgetManager();
      bm.setAdaptiveMaxTurns('simple');
      expect(bm.getMaxTurns()).toBe(8);
      expect(bm.getMaxTokens()).toBe(8 * 5000);
    });

    it('moderate 等级调整 maxTurns 为 20', () => {
      const bm = new BudgetManager();
      bm.setAdaptiveMaxTurns('moderate');
      expect(bm.getMaxTurns()).toBe(20);
    });

    it('complex 等级调整 maxTurns 为 40', () => {
      const bm = new BudgetManager();
      bm.setAdaptiveMaxTurns('complex');
      expect(bm.getMaxTurns()).toBe(40);
      expect(bm.getMaxTokens()).toBe(40 * 5000);
    });

    it('触发调整时调用 SSE 回调', () => {
      const bm = new BudgetManager();
      const cb = vi.fn();
      bm.setAdaptiveMaxTurns('simple', cb);
      expect(cb).toHaveBeenCalledTimes(1);
      const event = cb.mock.calls[0][0];
      expect(event.type).toBe('budget_adjusted');
      expect(event.oldMaxTurns).toBe(25);
      expect(event.newMaxTurns).toBe(8);
      expect(event.reason).toBe('complexity_level_simple');
    });

    it('未知等级不调整', () => {
      const bm = new BudgetManager();
      bm.setAdaptiveMaxTurns('unknown-level');
      expect(bm.getMaxTurns()).toBe(25);
    });

    it('与当前值相同时不调整也不回调', () => {
      const bm = new BudgetManager();
      bm.setAdaptiveMaxTurns('simple'); // 调整为 8
      const cb = vi.fn();
      bm.setAdaptiveMaxTurns('simple', cb); // 再次 simple，值相同
      expect(cb).not.toHaveBeenCalled();
      expect(bm.getMaxTurns()).toBe(8);
    });
  });

  describe('getter 方法', () => {
    it('getConsumedTokens 返回累计 token', () => {
      const bm = new BudgetManager();
      bm.accumulateTokens({ promptTokens: 1, completionTokens: 2, totalTokens: 3 });
      expect(bm.getConsumedTokens()).toBe(3);
    });

    it('getCurrentTurn 返回当前轮数', () => {
      const bm = new BudgetManager();
      bm.incrementTurn();
      bm.incrementTurn();
      bm.incrementTurn();
      expect(bm.getCurrentTurn()).toBe(3);
    });
  });
});
