import { describe, it, expect, vi } from 'vitest';
import { BudgetManager, DEFAULT_BUDGET_CONFIG } from '../budgetManager.js';

describe('BudgetManager', () => {
  it('should use default config when no config provided', () => {
    const bm = new BudgetManager();
    expect(bm.getMaxTurns()).toBe(DEFAULT_BUDGET_CONFIG.maxTurns);
    expect(bm.getMaxTokens()).toBe(DEFAULT_BUDGET_CONFIG.maxTokens);
  });

  it('should merge custom config with defaults', () => {
    const bm = new BudgetManager({ maxTurns: 5 });
    expect(bm.getMaxTurns()).toBe(5);
    expect(bm.getMaxTokens()).toBe(DEFAULT_BUDGET_CONFIG.maxTokens);
  });

  it('should not exceed budget initially', () => {
    const bm = new BudgetManager();
    const result = bm.checkBudget();
    expect(result.exceeded).toBe(false);
    expect(result.consumedTurns).toBe(0);
    expect(result.consumedTokens).toBe(0);
  });

  it('should detect turns exceeded', () => {
    const bm = new BudgetManager({ maxTurns: 3 });
    bm.incrementTurn();
    bm.incrementTurn();
    bm.incrementTurn();
    const result = bm.checkBudget();
    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('turns_exceeded');
  });

  it('should detect tokens exceeded', () => {
    const bm = new BudgetManager({ maxTokens: 100 });
    bm.accumulateTokens({ promptTokens: 50, completionTokens: 60, totalTokens: 110 });
    const result = bm.checkBudget();
    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('tokens_exceeded');
  });

  it('should accumulate tokens with usage', () => {
    const bm = new BudgetManager();
    bm.accumulateTokens({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    expect(bm.getConsumedTokens()).toBe(150);
  });

  it('should accumulate tokens with fallback text', () => {
    const bm = new BudgetManager();
    bm.accumulateTokens(undefined, 'hello world');
    expect(bm.getConsumedTokens()).toBeGreaterThan(0);
  });

  it('should increment turn correctly', () => {
    const bm = new BudgetManager();
    expect(bm.getCurrentTurn()).toBe(0);
    bm.incrementTurn();
    expect(bm.getCurrentTurn()).toBe(1);
  });

  it('should report isExceeded correctly', () => {
    const bm = new BudgetManager({ maxTurns: 2, maxTokens: 1000 });
    expect(bm.isExceeded()).toBe(false);
    bm.incrementTurn();
    bm.incrementTurn();
    expect(bm.isExceeded()).toBe(true);
  });

  it('should calculate remaining budget', () => {
    const bm = new BudgetManager({ maxTurns: 10, maxTokens: 1000 });
    bm.incrementTurn();
    bm.accumulateTokens({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    const remaining = bm.getRemaining();
    expect(remaining.remainingTurns).toBe(9);
    expect(remaining.remainingTokens).toBe(850);
  });

  it('should set adaptive maxTurns for simple complexity', () => {
    const bm = new BudgetManager();
    bm.setAdaptiveMaxTurns('simple');
    expect(bm.getMaxTurns()).toBe(3);
  });

  it('should set adaptive maxTurns for complex complexity', () => {
    const bm = new BudgetManager();
    bm.setAdaptiveMaxTurns('complex');
    expect(bm.getMaxTurns()).toBe(15);
  });

  it('should not override explicit maxTurns with adaptive', () => {
    const bm = new BudgetManager({ maxTurns: 7 });
    bm.setAdaptiveMaxTurns('simple');
    expect(bm.getMaxTurns()).toBe(7);
  });

  it('should send SSE event on adaptive adjustment', () => {
    const onSSEEvent = vi.fn();
    const bm = new BudgetManager();
    bm.setAdaptiveMaxTurns('moderate', onSSEEvent);
    expect(onSSEEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'budget_adjusted',
        newMaxTurns: 8,
      })
    );
  });

  it('should handle edge case: zero maxTurns', () => {
    const bm = new BudgetManager({ maxTurns: 0 });
    const result = bm.checkBudget();
    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('turns_exceeded');
  });

  it('should handle edge case: zero maxTokens', () => {
    const bm = new BudgetManager({ maxTokens: 0 });
    bm.accumulateTokens({ promptTokens: 1, completionTokens: 0, totalTokens: 1 });
    const result = bm.checkBudget();
    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('tokens_exceeded');
  });
});
