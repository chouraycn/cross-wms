/**
 * SemanticCompressor — 语义保留压缩
 *
 * 替代 WorkingMemory 的通用 LLM 压缩，实现语义感知的上下文压缩。
 * 保留：关键实体名、数字/数量、操作指令、错误信息
 * 压缩：冗余描述、重复信息、低价值上下文
 *
 * v6.0: P2-5 上下文感知压缩
 */

import { callAIModelStream } from '../aiClient.js';
import type { ModelCallConfig, MessageContent } from '../aiClient.js';
import type { Observation } from './observer.js';

// ===================== 类型定义 =====================

/** 压缩策略 */
export type CompressionStrategy = 'semantic' | 'extractive' | 'fallback';

/** 压缩结果 */
export interface CompressionResult {
  /** 压缩后的文本 */
  compressed: string;
  /** 使用的策略 */
  strategy: CompressionStrategy;
  /** 原始长度 */
  originalLength: number;
  /** 压缩后长度 */
  compressedLength: number;
  /** 压缩比 */
  ratio: number;
  /** 保留的关键实体 */
  preservedEntities: string[];
}

/** 提取的关键信息 */
export interface ExtractedKeyInfo {
  /** 实体名（仓库名、商品名等） */
  entities: string[];
  /** 数值（数量、金额等） */
  numbers: string[];
  /** 操作指令（查询、创建、更新等） */
  actions: string[];
  /** 错误/异常信息 */
  errors: string[];
}

// ===================== 常量 =====================

/** 语义压缩 prompt */
const SEMANTIC_COMPRESS_PROMPT = `你是一个上下文压缩专家。请将以下 ReAct 循环历史压缩为简洁摘要，严格遵循以下规则：

1. **必须保留**：
   - 关键实体名（仓库名、SKU、订单号等）
   - 具体数字和数量（库存数量、金额等）
   - 操作结果（成功/失败及原因）
   - 错误信息和异常状态

2. **可以压缩**：
   - 重复的描述性文本
   - 工具调用的中间过程细节
   - 冗余的上下文信息

3. **格式要求**：
   - 使用结构化格式：[实体]操作→结果
   - 每条信息一行
   - 总长度 ≤ 200 字

历史内容：`;

/** 关键信息提取正则 */
const ENTITY_PATTERN = /[A-Z][a-zA-Z0-9_]*(?:仓|库|区|位)/g;
const NUMBER_PATTERN = /\d+(?:\.\d+)?(?:件|个|箱|台|元|kg|KG|吨|ml|ML)/g;
const ACTION_PATTERN = /(?:查询|创建|更新|删除|入库|出库|调拨|盘点|审核|确认|取消|修改)/g;
const ERROR_PATTERN = /(?:错误|失败|异常|超时|不存在|已存在|不足|超过)/g;

// ===================== SemanticCompressor 类 =====================

export class SemanticCompressor {
  private lastStrategy: CompressionStrategy;

  constructor() {
    this.lastStrategy = 'fallback';
  }

  /**
   * 压缩观察结果和反思。
   * 优先使用语义压缩（LLM），失败时降级为提取式压缩，再失败降级为截断。
   *
   * @param observations - 观察结果列表
   * @param existingSummary - 已有摘要
   * @param modelConfig - 模型配置
   * @param signal - 取消信号
   */
  async compress(
    observations: Observation[],
    existingSummary: string,
    modelConfig: ModelCallConfig,
    signal?: AbortSignal,
  ): Promise<CompressionResult> {
    // 构造输入文本
    const inputText = this.buildInputText(observations, existingSummary);
    const originalLength = inputText.length;

    // 策略1：语义压缩（LLM）
    try {
      const semanticResult = await this.semanticCompress(inputText, modelConfig, signal);
      if (semanticResult) {
        this.lastStrategy = 'semantic';
        return {
          compressed: semanticResult,
          strategy: 'semantic',
          originalLength,
          compressedLength: semanticResult.length,
          ratio: semanticResult.length / originalLength,
          preservedEntities: this.extractKeyInfo(inputText).entities,
        };
      }
    } catch (err) {
      console.warn('[SemanticCompressor] 语义压缩失败，降级为提取式:', err instanceof Error ? err.message : String(err));
    }

    // 策略2：提取式压缩（规则）
    const extractiveResult = this.extractiveCompress(inputText);
    this.lastStrategy = 'extractive';
    return {
      compressed: extractiveResult,
      strategy: 'extractive',
      originalLength,
      compressedLength: extractiveResult.length,
      ratio: extractiveResult.length / originalLength,
      preservedEntities: this.extractKeyInfo(inputText).entities,
    };
  }

  /**
   * 语义压缩（LLM 辅助）。
   */
  private async semanticCompress(
    inputText: string,
    modelConfig: ModelCallConfig,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const messages: Array<{ role: string; content: MessageContent }> = [
      { role: 'system', content: '你是一个上下文压缩专家。请保留关键实体、数字和操作结果，压缩冗余描述。' },
      { role: 'user', content: SEMANTIC_COMPRESS_PROMPT + '\n' + inputText },
    ];

    const response = await callAIModelStream(
      modelConfig,
      messages,
      () => {},
      signal,
      undefined,
      undefined,
      undefined,
      'low',
      modelConfig.capabilities,
    );

    const result = response.content?.trim() || '';
    return result.length > 0 ? result.substring(0, 200) : null;
  }

  /**
   * 提取式压缩（规则，无 LLM）。
   * 保留关键实体、数字、操作和错误信息，删除其他。
   */
  private extractiveCompress(inputText: string): string {
    const keyInfo = this.extractKeyInfo(inputText);

    const parts: string[] = [];
    if (keyInfo.entities.length > 0) {
      parts.push(`实体: ${keyInfo.entities.slice(0, 10).join(', ')}`);
    }
    if (keyInfo.numbers.length > 0) {
      parts.push(`数量: ${keyInfo.numbers.slice(0, 10).join(', ')}`);
    }
    if (keyInfo.actions.length > 0) {
      parts.push(`操作: ${keyInfo.actions.slice(0, 10).join(', ')}`);
    }
    if (keyInfo.errors.length > 0) {
      parts.push(`异常: ${keyInfo.errors.slice(0, 5).join(', ')}`);
    }

    // 如果提取不到关键信息，直接截断
    if (parts.length === 0) {
      return inputText.substring(0, 200);
    }

    return parts.join('; ').substring(0, 200);
  }

  /**
   * 从文本中提取关键信息。
   */
  extractKeyInfo(text: string): ExtractedKeyInfo {
    const entities = (text.match(ENTITY_PATTERN) || []) as string[];
    const numbers = (text.match(NUMBER_PATTERN) || []) as string[];
    const actions = (text.match(ACTION_PATTERN) || []) as string[];
    const errors = (text.match(ERROR_PATTERN) || []) as string[];

    return {
      entities: [...new Set(entities)],
      numbers: [...new Set(numbers)],
      actions: [...new Set(actions)],
      errors: [...new Set(errors)],
    };
  }

  /**
   * 构造压缩输入文本。
   */
  private buildInputText(observations: Observation[], existingSummary: string): string {
    const parts: string[] = [];

    if (existingSummary) {
      parts.push(`[已有摘要] ${existingSummary}`);
    }

    for (const obs of observations) {
      const resultPreview = obs.result.length > 300
        ? obs.result.slice(0, 300) + '...'
        : obs.result;
      parts.push(`[${obs.toolCall.name}] ${obs.assessment.level}: ${resultPreview}`);
    }

    return parts.join('\n');
  }

  /**
   * 获取上次使用的压缩策略。
   */
  getLastStrategy(): CompressionStrategy {
    return this.lastStrategy;
  }

  /**
   * 重置。
   */
  reset(): void {
    this.lastStrategy = 'fallback';
  }
}
