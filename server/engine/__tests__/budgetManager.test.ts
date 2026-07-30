// BudgetManager unit tests cover turn/token budget accounting, dual-mode token
// accumulation (usage-based vs estimated), and v6.0 adaptive budget adjustments.
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../contextTruncate.js', () => ({
  // Stable deterministic estimator: 1 token per character for test predictability.
  estimateTokens: (text: string) => text.length,
}));

import {
  BudgetManager,
  DEFAULT_BUDGET_CONFIG,
} from '../budgetManager.js';

describe('engine/budgetManager — DEFAULT_BUDGET_CONFIG', () => {
  it('exposes default maxTurns/maxTokens/windowSize values', () => {
    expect(DEFAULT_BUDGET_CONFIG.maxTurns).toBe(25);
    expect(DEFAULT_BUDGET_CONFIG.maxTokens).toBe(100000);
    expect(DEFAULT_BUDGET_CONFIG.windowSize).toBe(5);
  });
});

describe('engine/budgetManager — constructor & defaults', () => {
  it('uses default config when no overrides provided', () => {
    const bm = new BudgetManager();
    expect(bm.getMaxTurns()).toBe(25);
    expect(bm.getMaxTokens()).toBe(100000);
    expect(bm.getCurrentTurn()).toBe(0);
    expect(bm.getConsumedTokens()).toBe(0);
  });

  it('merges partial config overrides', () => {
    const bm = new BudgetManager({ maxTurns: 5 });
    expect(bm.getMaxTurns()).toBe(5);
    expect(bm.getMaxTokens()).toBe(100000);
  });

  it('marks explicitMaxTurns=true when maxTurns passed', () => {
    const bm = new BudgetManager({ maxTurns: 3 });
    // Adaptive adjustment should be a no-op when explicit
    const cb = vi.fn();
    bm.setAdaptiveMaxTurns('complex', cb);
    expect(cb).not.toHaveBeenCalled();
    expect(bm.getMaxTurns()).toBe(3);
  });
});

describe('engine/budgetManager — checkBudget', () => {
  it('returns not exceeded at init', () => {
    const bm = new BudgetManager();
    const result = bm.checkBudget();
    expect(result.exceeded).toBe(false);
    expect(result.reason).toBe('');
    expect(result.consumedTurns).toBe(0);
    expect(result.consumedTokens).toBe(0);
  });

  it('detects turns_exceeded when currentTurn >= maxTurns', () => {
    const bm = new BudgetManager({ maxTurns: 2 });
    bm.incrementTurn();
    bm.incrementTurn();
    const result = bm.checkBudget();
    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('turns_exceeded');
  });

  it('detects tokens_exceeded when consumedTokens >= maxTokens', () => {
    const bm = new BudgetManager({ maxTokens: 100 });
    bm.accumulateTokens({ promptTokens: 30, completionTokens: 80, totalTokens: 110 });
    const result = bm.checkBudget();
    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('tokens_exceeded');
  });

  it('turns check takes priority over tokens when both exceeded', () => {
    const bm = new BudgetManager({ maxTurns: 1, maxTokens: 10 });
    bm.incrementTurn();
    bm.accumulateTokens({ promptTokens: 5, completionTokens: 10, totalTokens: 15 });
    const result = bm.checkBudget();
    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('turns_exceeded');
  });
});

describe('engine/budgetManager — accumulateTokens dual-mode', () => {
  it('uses usage.totalTokens when provided', () => {
    const bm = new BudgetManager();
    bm.accumulateTokens({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    expect(bm.getConsumedTokens()).toBe(30);
  });

  it('falls back to estimateTokens(fallbackText) when usage missing', () => {
    const bm = new BudgetManager();
    bm.accumulateTokens(undefined, 'hello world');
    expect(bm.getConsumedTokens()).toBe(11);
  });

  it('skips when neither usage nor fallbackText provided', () => {
    const bm = new BudgetManager();
    bm.accumulateTokens();
    expect(bm.getConsumedTokens()).toBe(0);
  });

  it('skips when usage.totalTokens is zero (falls back to estimateTokens)', () => {
    const bm = new BudgetManager();
    bm.accumulateTokens({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }, 'ignored');
    // usage.totalTokens=0 → falls back to estimateTokens('ignored') = 7 chars
    expect(bm.getConsumedTokens()).toBe(7);
  });

  it('accumulates across multiple calls', () => {
    const bm = new BudgetManager();
    bm.accumulateTokens({ promptTokens: 1, completionTokens: 2, totalTokens: 3 });
    bm.accumulateTokens(undefined, 'ab');
    expect(bm.getConsumedTokens()).toBe(5);
  });
});

describe('engine/budgetManager — incrementTurn & isExceeded', () => {
  it('incrementTurn advances turn counter', () => {
    const bm = new BudgetManager({ maxTurns: 3 });
    bm.incrementTurn();
    expect(bm.getCurrentTurn()).toBe(1);
    bm.incrementTurn();
    expect(bm.getCurrentTurn()).toBe(2);
  });

  it('isExceeded true when turns exceeded', () => {
    const bm = new BudgetManager({ maxTurns: 1, maxTokens: 100000 });
    bm.incrementTurn();
    expect(bm.isExceeded()).toBe(true);
  });

  it('isExceeded true when tokens exceeded', () => {
    const bm = new BudgetManager({ maxTurns: 100, maxTokens: 5 });
    bm.accumulateTokens(undefined, 'abcdefg');
    expect(bm.isExceeded()).toBe(true);
  });

  it('isExceeded false when within budget', () => {
    const bm = new BudgetManager({ maxTurns: 10, maxTokens: 1000 });
    bm.incrementTurn();
    bm.accumulateTokens(undefined, 'hello');
    expect(bm.isExceeded()).toBe(false);
  });
});

describe('engine/budgetManager — getRemaining', () => {
  it('returns full budget at init', () => {
    const bm = new BudgetManager({ maxTurns: 10, maxTokens: 500 });
    const r = bm.getRemaining();
    expect(r.remainingTurns).toBe(10);
    expect(r.remainingTokens).toBe(500);
  });

  it('subtracts consumed amounts', () => {
    const bm = new BudgetManager({ maxTurns: 10, maxTokens: 500 });
    bm.incrementTurn();
    bm.incrementTurn();
    bm.accumulateTokens(undefined, 'hello');
    const r = bm.getRemaining();
    expect(r.remainingTurns).toBe(8);
    expect(r.remainingTokens).toBe(495);
  });

  it('clamps to zero when over budget', () => {
    const bm = new BudgetManager({ maxTurns: 1, maxTokens: 5 });
    bm.incrementTurn();
    bm.incrementTurn();
    bm.accumulateTokens(undefined, 'abcdefghij');
    const r = bm.getRemaining();
    expect(r.remainingTurns).toBe(0);
    expect(r.remainingTokens).toBe(0);
  });
});

describe('engine/budgetManager — setAdaptiveMaxTurns (v6.0)', () => {
  it('adjusts maxTurns/maxTokens when not explicit', () => {
    const bm = new BudgetManager();
    const cb = vi.fn();
    bm.setAdaptiveMaxTurns('simple', cb);
    expect(bm.getMaxTurns()).toBe(8);
    expect(bm.getMaxTokens()).toBe(8 * 5000);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      type: 'budget_adjusted',
      newMaxTurns: 8,
      newMaxTokens: 40000,
      reason: 'complexity_level_simple',
    }));
  });

  it('moderate level maps to 20 turns', () => {
    const bm = new BudgetManager();
    bm.setAdaptiveMaxTurns('moderate');
    expect(bm.getMaxTurns()).toBe(20);
    expect(bm.getMaxTokens()).toBe(20 * 5000);
  });

  it('complex level maps to 40 turns', () => {
    const bm = new BudgetManager();
    bm.setAdaptiveMaxTurns('complex');
    expect(bm.getMaxTurns()).toBe(40);
    expect(bm.getMaxTokens()).toBe(40 * 5000);
  });

  it('no-ops when level already matches current maxTurns', () => {
    const bm = new BudgetManager({ maxTurns: 8 });
    // explicitMaxTurns=true since maxTurns was provided
    const cb = vi.fn();
    bm.setAdaptiveMaxTurns('simple', cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('no-ops on unknown complexity level', () => {
    const bm = new BudgetManager();
    const cb = vi.fn();
    bm.setAdaptiveMaxTurns('unknown_level', cb);
    expect(cb).not.toHaveBeenCalled();
    expect(bm.getMaxTurns()).toBe(25);
  });

  it('does not call onSSEEvent when not provided', () => {
    const bm = new BudgetManager();
    bm.setAdaptiveMaxTurns('complex');
    expect(bm.getMaxTurns()).toBe(40);
  });
});
