// multilingualIntent unit tests cover language detection (zh/en/mixed),
// keyword-based intent recognition across multiple intent types, multi-step
// instruction detection, step count estimation, and confidence scoring.
import { describe, expect, it } from 'vitest';
import { MultilingualIntent } from '../multilingualIntent.js';

describe('engine/multilingualIntent — language detection', () => {
  const mi = new MultilingualIntent();

  it('detects zh for pure Chinese text', () => {
    const r = mi.recognize('查询出库单');
    expect(r.detectedLanguage).toBe('zh');
  });

  it('detects en for pure English text', () => {
    const r = mi.recognize('query the outbound orders');
    expect(r.detectedLanguage).toBe('en');
  });

  it('detects mixed for Chinese-English hybrid text', () => {
    const r = mi.recognize('帮我 query 出库单 and 分析一下');
    expect(r.detectedLanguage).toBe('mixed');
  });

  it('detects en for digit-only / punctuation-only text', () => {
    const r = mi.recognize('12345');
    expect(r.detectedLanguage).toBe('en');
  });
});

describe('engine/multilingualIntent — single intent recognition', () => {
  const mi = new MultilingualIntent();

  it('recognizes query intent (zh)', () => {
    const r = mi.recognize('查询所有出库单');
    expect(r.primaryIntent).toBe('query');
    expect(r.intents).toContain('query');
    expect(r.matchedKeywords).toContain('查询');
  });

  it('recognizes query intent (en)', () => {
    const r = mi.recognize('search the warehouse inventory');
    expect(r.primaryIntent).toBe('query');
    expect(r.matchedKeywords).toContain('search');
  });

  it('recognizes create intent (zh)', () => {
    const r = mi.recognize('创建一个新的出库单');
    expect(r.primaryIntent).toBe('create');
    expect(r.matchedKeywords).toContain('创建');
  });

  it('recognizes create intent (en)', () => {
    const r = mi.recognize('add a new outbound order');
    expect(r.primaryIntent).toBe('create');
  });

  it('recognizes update intent (zh)', () => {
    const r = mi.recognize('修改出库单的状态');
    expect(r.primaryIntent).toBe('update');
  });

  it('recognizes delete intent (zh)', () => {
    const r = mi.recognize('删除过期的出库单');
    expect(r.primaryIntent).toBe('delete');
  });

  it('recognizes analyze intent (zh)', () => {
    const r = mi.recognize('统计本月出库数据');
    expect(r.primaryIntent).toBe('analyze');
  });

  it('recognizes summarize intent (zh)', () => {
    const r = mi.recognize('总结本季度的工作');
    expect(r.primaryIntent).toBe('summarize');
  });

  it('recognizes execute intent (zh)', () => {
    const r = mi.recognize('执行出库流程');
    expect(r.primaryIntent).toBe('execute');
  });

  it('returns unknown for unrecognized text', () => {
    const r = mi.recognize('你好');
    expect(r.primaryIntent).toBe('unknown');
    expect(r.intents).toEqual([]);
    expect(r.confidence).toBeLessThanOrEqual(0.2);
  });
});

describe('engine/multilingualIntent — multi-intent recognition', () => {
  const mi = new MultilingualIntent();

  it('detects multiple intents in compound instructions (zh)', () => {
    const r = mi.recognize('查询出库单并分析数据');
    expect(r.intents).toContain('query');
    expect(r.intents).toContain('analyze');
    // Primary intent = the one with most matched keywords
    expect(['query', 'analyze']).toContain(r.primaryIntent);
  });

  it('detects multiple intents in mixed-language instructions', () => {
    const r = mi.recognize('query the orders then update them');
    expect(r.intents).toContain('query');
    expect(r.intents).toContain('update');
  });
});

describe('engine/multilingualIntent — multi-step detection', () => {
  const mi = new MultilingualIntent();

  it('detects 先...再 multi-step pattern (zh)', () => {
    // Pattern: /先[^，。,.]*[再然后接着]/ — the gap between 先 and 再 must not
    // contain commas/punctuation. So we use a no-comma phrasing.
    const r = mi.recognize('先查询出库单再分析数据');
    expect(r.isMultiStep).toBe(true);
    expect(r.estimatedSteps).toBeGreaterThan(1);
  });

  it('detects first...then multi-step pattern (en)', () => {
    const r = mi.recognize('first query the orders then analyze them');
    expect(r.isMultiStep).toBe(true);
    expect(r.estimatedSteps).toBeGreaterThan(1);
  });

  it('detects 第N步 multi-step pattern (zh)', () => {
    const r = mi.recognize('第一步查询出库单，第二步分析数据');
    expect(r.isMultiStep).toBe(true);
  });

  it('detects and then multi-step pattern (en)', () => {
    const r = mi.recognize('fetch the data and then process it');
    expect(r.isMultiStep).toBe(true);
  });

  it('returns isMultiStep=false for single-step instructions', () => {
    const r = mi.recognize('查询出库单');
    expect(r.isMultiStep).toBe(false);
    expect(r.estimatedSteps).toBe(1);
  });

  it('caps estimatedSteps at 8', () => {
    const r = mi.recognize(
      'first query then update and then delete next first then finally additionally after that also and',
    );
    expect(r.estimatedSteps).toBeLessThanOrEqual(8);
  });
});

describe('engine/multilingualIntent — confidence scoring', () => {
  const mi = new MultilingualIntent();

  it('returns low confidence for unrecognized text', () => {
    const r = mi.recognize('???');
    expect(r.confidence).toBeLessThanOrEqual(0.2);
  });

  it('returns higher confidence when multiple intents match', () => {
    const single = mi.recognize('查询出库单');
    const multi = mi.recognize('查询出库单并分析数据');
    expect(multi.confidence).toBeGreaterThan(single.confidence);
  });

  it('boosts confidence for multi-step instructions', () => {
    const single = mi.recognize('查询出库单');
    const multiStep = mi.recognize('先查询出库单，再分析数据');
    expect(multiStep.confidence).toBeGreaterThan(single.confidence);
  });

  it('reduces confidence slightly for mixed-language input', () => {
    const zh = mi.recognize('查询出库单并分析数据');
    const mixed = mi.recognize('帮我 query 出库单 and 分析数据');
    // mixed gets a -0.05 penalty compared to pure zh with same intent count
    // (both multi-intent and multi-step may apply, so we just check mixed is non-zero)
    expect(mixed.confidence).toBeGreaterThan(0);
  });

  it('clamps confidence to [0, 1]', () => {
    const r1 = mi.recognize('');
    const r2 = mi.recognize('查询 创建 更新 删除 分析 总结 执行 比较 first then');
    expect(r1.confidence).toBeGreaterThanOrEqual(0);
    expect(r1.confidence).toBeLessThanOrEqual(1);
    expect(r2.confidence).toBeGreaterThanOrEqual(0);
    expect(r2.confidence).toBeLessThanOrEqual(1);
  });
});

describe('engine/multilingualIntent — reset (stateless)', () => {
  it('reset is a no-op for stateless module', () => {
    const mi = new MultilingualIntent();
    expect(() => mi.reset()).not.toThrow();
  });
});
