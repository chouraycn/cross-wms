// guardConfig unit tests cover the guard-parameter registry: defaults matching
// historical hardcoded values, deep partial updates, reset, and the modules
// reading the registry at construction (LoopDetector / CircuitBreaker / BudgetManager).
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_GUARD_CONFIG,
  getGuardConfig,
  resetGuardConfig,
  updateGuardConfig,
} from '../guardConfig.js';
import { LoopDetector } from '../loopDetector.js';
import { CircuitBreaker } from '../circuitBreaker.js';
import { BudgetManager } from '../budgetManager.js';

describe('engine/guardConfig — defaults match historical hardcoded values', () => {
  beforeEach(() => resetGuardConfig());
  afterEach(() => resetGuardConfig());

  it('loopDetector defaults (0.8 / 3 / 20)', () => {
    expect(getGuardConfig().loopDetector).toEqual({
      similarityThreshold: 0.8,
      consecutiveThreshold: 3,
      maxHistorySize: 20,
    });
  });

  it('circuitBreaker defaults (2 / 3 / 60s / 1)', () => {
    expect(getGuardConfig().circuitBreaker).toEqual({
      halfOpenThreshold: 2,
      openThreshold: 3,
      openCooldownMs: 60_000,
      maxHalfOpenConcurrent: 1,
    });
  });

  it('budget / maxToolTurns / compression interval defaults', () => {
    const cfg = getGuardConfig();
    expect(cfg.budget.maxTurns).toBe(25);
    expect(cfg.budget.maxTokens).toBe(100000);
    expect(cfg.budget.windowSize).toBe(5);
    expect(cfg.budget.adaptiveMaxTurns).toEqual({ simple: 8, moderate: 20, complex: 40 });
    expect(cfg.maxToolTurns).toBe(25);
    expect(cfg.contextCompressIntervalTurns).toBe(5);
  });
});

describe('engine/guardConfig — update / merge / reset', () => {
  beforeEach(() => resetGuardConfig());
  afterEach(() => resetGuardConfig());

  it('deep-partial update merges into nested sections', () => {
    updateGuardConfig({
      loopDetector: { similarityThreshold: 0.9 },
      budget: { adaptiveMaxTurns: { complex: 60 } },
    });
    const cfg = getGuardConfig();
    expect(cfg.loopDetector.similarityThreshold).toBe(0.9);
    expect(cfg.loopDetector.consecutiveThreshold).toBe(3); // 未覆盖字段保持
    expect(cfg.budget.adaptiveMaxTurns).toEqual({ simple: 8, moderate: 20, complex: 60 });
    expect(cfg.maxToolTurns).toBe(25);
  });

  it('reset restores defaults', () => {
    updateGuardConfig({ maxToolTurns: 50 });
    resetGuardConfig();
    expect(getGuardConfig().maxToolTurns).toBe(DEFAULT_GUARD_CONFIG.maxToolTurns);
  });
});

describe('engine/guardConfig — modules read the registry at construction', () => {
  beforeEach(() => resetGuardConfig());
  afterEach(() => resetGuardConfig());

  it('LoopDetector() uses registry thresholds when no args passed', () => {
    updateGuardConfig({ loopDetector: { similarityThreshold: 0.99, consecutiveThreshold: 7 } });
    // 构造器无参 → 从 guardConfig 读取；显式传参仍优先
    const fromRegistry = new LoopDetector();
    const explicit = new LoopDetector(0.5, 2);
    expect((fromRegistry as unknown as { threshold: number }).threshold).toBe(0.99);
    expect((fromRegistry as unknown as { consecutiveThreshold: number }).consecutiveThreshold).toBe(7);
    expect((explicit as unknown as { threshold: number }).threshold).toBe(0.5);
    expect((explicit as unknown as { consecutiveThreshold: number }).consecutiveThreshold).toBe(2);
  });

  it('CircuitBreaker() uses registry thresholds when no config passed', () => {
    updateGuardConfig({ circuitBreaker: { openThreshold: 9, halfOpenThreshold: 5 } });
    const cb = new CircuitBreaker();
    expect(cb.getThresholds()).toMatchObject({ openThreshold: 9, halfOpenThreshold: 5 });
    // 显式传参仍优先
    const explicit = new CircuitBreaker({ openThreshold: 1 });
    expect(explicit.getThresholds().openThreshold).toBe(1);
  });

  it('BudgetManager() uses registry budget defaults', () => {
    updateGuardConfig({ budget: { maxTurns: 50, maxTokens: 200000 } });
    const bm = new BudgetManager();
    expect((bm as unknown as { maxTurns: number }).maxTurns).toBe(50);
    expect((bm as unknown as { maxTokens: number }).maxTokens).toBe(200000);
    // 显式传入仍覆盖
    const explicit = new BudgetManager({ maxTurns: 3 });
    expect((explicit as unknown as { maxTurns: number }).maxTurns).toBe(3);
  });
});
