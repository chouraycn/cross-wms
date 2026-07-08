import { describe, it, expect, beforeEach } from 'vitest';
import { CostEstimator } from '../usage';
import type { LlmUsage } from '../streaming';

describe('CostEstimator', () => {
  let est: CostEstimator;
  beforeEach(() => {
    est = new CostEstimator();
  });

  it('should set, get and remove pricing', () => {
    est.setPricing('gpt-4', 0.00001, 0.00003, 'USD');
    expect(est.getPricing('gpt-4')?.input).toBe(0.00001);
    expect(est.removePricing('gpt-4')).toBe(true);
    expect(est.getPricing('gpt-4')).toBeUndefined();
  });

  it('should estimate cost from pricing', () => {
    est.setPricing('m', 0.00001, 0.00003);
    const r = est.estimate('m', 1000, 500);
    expect(r?.totalCost).toBeCloseTo(1000 * 0.00001 + 500 * 0.00003, 10);
    expect(r?.currency).toBe('USD');
  });

  it('should return null estimate when no pricing', () => {
    expect(est.estimate('unknown', 10, 10)).toBeNull();
  });

  it('should track usage and compute total cost from shared usage total', () => {
    est.setPricing('a', 0.00001, 0.00003);
    est.setPricing('b', 0.00002, 0.00004);
    const u1: LlmUsage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
    const u2: LlmUsage = { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 };
    est.trackUsage('a', u1);
    est.trackUsage('b', u2);
    expect(est.getTotalUsage().totalTokens).toBe(4500);
    // UsageTracker is shared/global: getTotalCost applies the single accumulated
    // usage total (prompt=3000, completion=1500) against each registered price.
    const expected =
      (3000 * 0.00001 + 1500 * 0.00003) + (3000 * 0.00002 + 1500 * 0.00004);
    expect(est.getTotalCost()).toBeCloseTo(expected, 10);
  });

  it('should compute total cost for a single model', () => {
    est.setPricing('a', 0.00001, 0.00003);
    est.trackUsage('a', { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 });
    expect(est.getTotalCost()).toBeCloseTo(1000 * 0.00001 + 500 * 0.00003, 10);
  });

  it('should reset tracked usage', () => {
    est.setPricing('a', 0.00001, 0.00003);
    est.trackUsage('a', { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    est.reset();
    expect(est.getTotalUsage().totalTokens).toBe(0);
  });

  it('should format small costs as per-1M tokens', () => {
    const formatted = est.formatCost(0.000005, 'USD');
    expect(formatted).toContain('1M tokens');
  });

  it('should format larger costs as currency', () => {
    const formatted = est.formatCost(1.2345, 'USD');
    expect(formatted).toContain('$');
  });
});
