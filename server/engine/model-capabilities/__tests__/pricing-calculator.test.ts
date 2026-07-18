import { describe, it, expect, beforeEach } from 'vitest';
import { ModelCapabilityRegistry } from '../capability-registry.js';
import { PricingCalculator } from '../pricing-calculator.js';

describe('PricingCalculator', () => {
  let registry: ModelCapabilityRegistry;
  let calculator: PricingCalculator;

  beforeEach(() => {
    registry = new ModelCapabilityRegistry();
    registry.registerModel({
      modelId: 'test-model',
      name: 'Test Model',
      provider: 'test',
      capabilities: [],
      pricing: {
        inputRate: 0.001, // ¥0.001/千tokens
        outputRate: 0.002, // ¥0.002/千tokens
      },
    });

    calculator = new PricingCalculator(registry);
  });

  // 测试 1: 计算基本费用
  it('should calculate cost correctly', () => {
    // 输入 1000 tokens，输出 500 tokens
    const cost = calculator.calculate('test-model', 1000, 500);

    // 0.001 * 1000/1000 + 0.002 * 500/1000 = 0.001 + 0.001 = 0.002
    expect(cost).toBe(0.002);
  });

  // 测试 2: 从文本估算费用
  it('should estimate cost from text', () => {
    const inputText = '你好世界'; // 约 6 tokens
    const outputText = 'Hello World'; // 约 2 tokens

    const cost = calculator.estimateFromText('test-model', inputText, outputText);

    expect(cost).toBeGreaterThan(0);
    expect(typeof cost).toBe('number');
  });

  // 测试 3: 获取模型定价
  it('should get model rates', () => {
    const rates = calculator.getRates('test-model');

    expect(rates.inputRate).toBe(0.001);
    expect(rates.outputRate).toBe(0.002);
    expect(rates.currency).toBe('CNY');
  });

  // 测试 4: 设置自定义定价
  it('should set custom rates', () => {
    calculator.setRates('custom-model', 0.005, 0.01);

    const rates = calculator.getRates('custom-model');

    expect(rates.inputRate).toBe(0.005);
    expect(rates.outputRate).toBe(0.01);
  });

  // 测试 5: 自定义定价优先级高于注册表
  it('should prioritize custom rates over registry', () => {
    calculator.setRates('test-model', 0.01, 0.02);

    const rates = calculator.getRates('test-model');

    expect(rates.inputRate).toBe(0.01);
    expect(rates.outputRate).toBe(0.02);
  });

  // 测试 6: 使用默认定价
  it('should use default rates for unknown model', () => {
    const rates = calculator.getRates('unknown-model');

    // 默认使用 Claude 3.5 Sonnet 的定价
    expect(rates.inputRate).toBe(0.003);
    expect(rates.outputRate).toBe(0.015);
  });

  // 测试 7: 计算费用明细
  it('should calculate cost breakdown', () => {
    const breakdown = calculator.calculateBreakdown('test-model', 1000, 500);

    expect(breakdown.inputCost).toBe(0.001);
    expect(breakdown.outputCost).toBe(0.001);
    expect(breakdown.totalCost).toBe(0.002);
    expect(breakdown.currency).toBe('CNY');
  });

  // 测试 8: 格式化费用显示
  it('should format cost correctly', () => {
    expect(calculator.formatCost(0.0005)).toBe('¥0.50毫');
    expect(calculator.formatCost(0.005)).toBe('¥0.0050');
    expect(calculator.formatCost(0.05)).toBe('¥0.0500');
    expect(calculator.formatCost(1.5)).toBe('¥1.50');
  });
});