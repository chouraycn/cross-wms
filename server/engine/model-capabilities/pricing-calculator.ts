/**
 * 定价计算器
 *
 * 计算模型调用的费用
 */

import type { ModelCapabilityRegistry } from './capability-registry.js';

/**
 * 定价信息
 */
export interface PricingInfo {
  /** 输入 token 价格（元/千tokens） */
  inputRate: number;
  /** 输出 token 价格（元/千tokens） */
  outputRate: number;
  /** 货币单位 */
  currency?: string;
}

/**
 * 计费结果
 */
export interface CostBreakdown {
  /** 输入成本 */
  inputCost: number;
  /** 输出成本 */
  outputCost: number;
  /** 总成本 */
  totalCost: number;
  /** 货币单位 */
  currency: string;
}

/**
 * 定价计算器
 * 用于计算模型调用的费用
 */
export class PricingCalculator {
  private registry: ModelCapabilityRegistry;
  private customRates: Map<string, PricingInfo> = new Map();

  constructor(registry: ModelCapabilityRegistry) {
    this.registry = registry;
  }

  /**
   * 计算调用费用
   * @param modelId 模型ID
   * @param inputTokens 输入 token 数
   * @param outputTokens 输出 token 数
   * @returns 费用（元）
   */
  calculate(modelId: string, inputTokens: number, outputTokens: number): number {
    const rates = this.getRates(modelId);

    // 计算：输入价格 * 输入token数 / 1000 + 输出价格 * 输出token数 / 1000
    const inputCost = rates.inputRate * (inputTokens / 1000);
    const outputCost = rates.outputRate * (outputTokens / 1000);

    return inputCost + outputCost;
  }

  /**
   * 计算详细费用明细
   * @param modelId 模型ID
   * @param inputTokens 输入 token 数
   * @param outputTokens 输出 token 数
   * @returns 费用明细
   */
  calculateBreakdown(modelId: string, inputTokens: number, outputTokens: number): CostBreakdown {
    const rates = this.getRates(modelId);
    const inputCost = rates.inputRate * (inputTokens / 1000);
    const outputCost = rates.outputRate * (outputTokens / 1000);

    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: rates.currency || 'CNY',
    };
  }

  /**
   * 从文本估算费用
   * @param modelId 模型ID
   * @param inputText 输入文本
   * @param outputText 输出文本
   * @returns 费用（元）
   */
  estimateFromText(modelId: string, inputText: string, outputText: string): number {
    // 简化估算：中文字符约 1.5 tokens，英文单词约 1 token
    const inputTokens = this.estimateTokens(inputText);
    const outputTokens = this.estimateTokens(outputText);

    return this.calculate(modelId, inputTokens, outputTokens);
  }

  /**
   * 获取模型定价
   * @param modelId 模型ID
   * @returns 定价信息
   */
  getRates(modelId: string): PricingInfo {
    // 优先使用自定义定价
    const customRate = this.customRates.get(modelId);
    if (customRate) {
      return customRate;
    }

    // 从注册表获取
    const modelInfo = this.registry.getModelInfo(modelId);
    if (modelInfo?.pricing) {
      return {
        inputRate: modelInfo.pricing.inputRate,
        outputRate: modelInfo.pricing.outputRate,
        currency: 'CNY',
      };
    }

    // 默认定价（以 Claude 3.5 Sonnet 为参考）
    return {
      inputRate: 0.003,
      outputRate: 0.015,
      currency: 'CNY',
    };
  }

  /**
   * 设置模型定价
   * @param modelId 模型ID
   * @param inputRate 输入价格（元/千tokens）
   * @param outputRate 输出价格（元/千tokens）
   */
  setRates(modelId: string, inputRate: number, outputRate: number): void {
    this.customRates.set(modelId, {
      inputRate,
      outputRate,
      currency: 'CNY',
    });
  }

  /**
   * 批量设置定价
   * @param rates 定价映射
   */
  setBatchRates(rates: Record<string, PricingInfo>): void {
    Object.entries(rates).forEach(([modelId, pricing]) => {
      this.customRates.set(modelId, pricing);
    });
  }

  /**
   * 清除自定义定价
   * @param modelId 模型ID，如果不提供则清除所有
   */
  clearCustomRates(modelId?: string): void {
    if (modelId) {
      this.customRates.delete(modelId);
    } else {
      this.customRates.clear();
    }
  }

  /**
   * 估算文本的 token 数
   * 使用简化估算方法
   * @param text 文本内容
   * @returns token 数估算值
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;

    // 统计中文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 统计英文字符总数
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    // 统计数字字符总数
    const numberChars = (text.match(/\d/g) || []).length;
    // 其他字符（空格、标点等）
    const otherChars = text.length - chineseChars - englishChars - numberChars;

    // 中文：约 1.5 tokens/字符
    // 英文：约 0.25 token/字符（平均词长约 4 字符，约 1 token）
    // 数字：约 0.25 token/字符
    // 其他：约 0.5 token/字符
    return Math.ceil(chineseChars * 1.5 + englishChars * 0.25 + numberChars * 0.25 + otherChars * 0.5);
  }

  /**
   * 计算批量请求的总费用
   * @param requests 请求列表
   * @returns 总费用（元）
   */
  calculateBatch(
    requests: Array<{
      modelId: string;
      inputTokens: number;
      outputTokens: number;
    }>
  ): number {
    return requests.reduce((total, req) => {
      return total + this.calculate(req.modelId, req.inputTokens, req.outputTokens);
    }, 0);
  }

  /**
   * 格式化费用显示
   * @param cost 费用（元）
   * @returns 格式化字符串
   */
  formatCost(cost: number): string {
    if (cost < 0.001) {
      return `¥${(cost * 1000).toFixed(2)}毫`;
    } else if (cost < 1) {
      return `¥${cost.toFixed(4)}`;
    } else {
      return `¥${cost.toFixed(2)}`;
    }
  }
}