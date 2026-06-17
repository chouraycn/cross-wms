/**
 * WorkingMemory — 工作记忆滑窗管理模块
 *
 * 维护 ReAct 循环的滑动窗口记忆，超 K 轮时惰性压缩旧轮摘要。
 * 压缩使用 LLM（reasoningEffort='low'），产出 ≤200 字摘要。
 *
 * 核心方法：
 * - addTurn: 添加轮次记录
 * - getContextMessages: 获取滑窗内的上下文消息
 * - compressOldTurns: 压缩旧轮摘要
 * - getWindowSize: 获取滑窗大小
 *
 * v5.0.0: ReAct 循环优化
 */

import { callAIModelStream } from '../aiClient.js';
import type { ModelCallConfig, MessageContent } from '../aiClient.js';
import type { Observation } from './observer.js';

// ===================== 类型定义 =====================

/** 反思决策（简化版，避免循环依赖） */
export interface MemoryReflectionDecision {
  shouldContinue: boolean;
  reason: string;
  reflectionMessage?: string;
}

/** Working Memory 轮次记录 */
export interface WorkingMemoryTurn {
  turnIndex: number;
  observations: Observation[];
  reflectionDecision: MemoryReflectionDecision;
  timestamp: number;
}

// ===================== 常量 =====================

/** 默认滑窗大小 */
const DEFAULT_WINDOW_SIZE = 5;

/** 摘要最大长度（字） */
const MAX_SUMMARY_LENGTH = 200;

// ===================== WorkingMemory 类 =====================

/**
 * 工作记忆管理器 — 滑动窗口 + 惰性 LLM 压缩。
 *
 * 设计：
 * - 滑窗大小 K=5，仅保留最近 K 轮的完整记录
 * - 超出 K 轮时，最旧的一轮被压缩为摘要（≤200 字）
 * - 压缩使用 reasoningEffort='low' 节省 token
 * - 摘要缓存，避免重复压缩
 * - 压缩失败时降级为直接截断
 */
export class WorkingMemory {
  private windowSize: number;
  private turns: WorkingMemoryTurn[];
  private summaryCache: string;

  constructor(windowSize?: number) {
    this.windowSize = windowSize ?? DEFAULT_WINDOW_SIZE;
    this.turns = [];
    this.summaryCache = '';
  }

  /**
   * 添加一轮记录。
   * 当轮次超过滑窗大小时，标记需要压缩。
   *
   * @param turn - 轮次记录
   */
  addTurn(turn: WorkingMemoryTurn): void {
    this.turns.push(turn);
  }

  /**
   * 获取滑窗内的上下文消息。
   * 包含旧轮摘要（如有）+ 滑窗内各轮的观察和反思。
   *
   * @returns 上下文消息列表
   */
  getContextMessages(): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // 如果有旧轮摘要，先添加摘要
    if (this.summaryCache) {
      messages.push({
        role: 'system',
        content: `[Working Memory 摘要] ${this.summaryCache}`,
      });
    }

    // 添加滑窗内的各轮记录
    for (const turn of this.turns) {
      // 添加观察结果摘要
      for (const obs of turn.observations) {
        const obsPreview = obs.result.length > 200
          ? obs.result.slice(0, 200) + '...'
          : obs.result;
        messages.push({
          role: 'system',
          content: `[轮次 ${turn.turnIndex} 观察] 工具: ${obs.toolCall.name}, 结果: ${obsPreview}`,
        });
      }

      // 添加反思决策
      if (turn.reflectionDecision.reflectionMessage) {
        messages.push({
          role: 'system',
          content: `[轮次 ${turn.turnIndex} 反思] ${turn.reflectionDecision.reflectionMessage}`,
        });
      }
    }

    return messages;
  }

  /**
   * 压缩旧轮摘要。
   * 将滑窗外的旧轮次压缩为 ≤200 字的摘要。
   * 使用 LLM（reasoningEffort='low'）进行压缩。
   *
   * @param modelConfig - 模型调用配置
   * @param signal - 取消信号
   * @returns 压缩后的摘要文本，失败时降级为直接截断
   */
  async compressOldTurns(
    modelConfig: ModelCallConfig,
    signal?: AbortSignal,
  ): Promise<string> {
    // 检查是否有需要压缩的旧轮
    if (this.turns.length <= this.windowSize) {
      return this.summaryCache;
    }

    // 获取需要压缩的旧轮
    const oldTurns = this.turns.slice(0, this.turns.length - this.windowSize);
    if (oldTurns.length === 0) {
      return this.summaryCache;
    }

    // 构造压缩请求内容
    const oldTurnsText = oldTurns
      .map(t => {
        const obsSummary = t.observations
          .map(o => `${o.toolCall.name}: ${o.assessment.level}`)
          .join(', ');
        const reflection = t.reflectionDecision.reflectionMessage || '';
        return `轮次${t.turnIndex}: [${obsSummary}] ${reflection}`;
      })
      .join('\n');

    const compressPrompt = `请将以下 ReAct 循环的历史轮次摘要压缩为不超过 200 字的简洁摘要，保留关键信息和工具执行结果：

${oldTurnsText}

${this.summaryCache ? `已有摘要: ${this.summaryCache}` : ''}

请输出压缩后的摘要（≤200字）：`;

    try {
      const compressMessages: Array<{ role: string; content: MessageContent }> = [
        { role: 'system', content: '你是一个文本压缩助手。请将输入压缩为简洁的摘要，保留关键信息。' },
        { role: 'user', content: compressPrompt },
      ];

      const response = await callAIModelStream(
        modelConfig,
        compressMessages,
        () => {}, // 不需要流式回调
        signal,
        undefined,
        undefined,
        undefined,
        'low', // reasoningEffort='low' 节省 token
        modelConfig.capabilities,
      );

      const newSummary = response.content?.trim() || '';

      if (newSummary.length > 0) {
        // 截断到 200 字
        this.summaryCache = newSummary.length > MAX_SUMMARY_LENGTH
          ? newSummary.slice(0, MAX_SUMMARY_LENGTH)
          : newSummary;
      }

      // 移除已压缩的旧轮
      this.turns = this.turns.slice(this.turns.length - this.windowSize);

      console.log(`[WorkingMemory] 压缩完成: ${oldTurns.length} 轮 → ${this.summaryCache.length} 字摘要`);
      return this.summaryCache;
    } catch (err) {
      // 压缩失败，降级为直接截断
      console.error('[WorkingMemory] 压缩失败（降级为直接截断）:', err instanceof Error ? err.message : String(err));

      // 降级策略：取旧轮的关键信息拼接
      const fallbackSummary = oldTurns
        .map(t => `轮次${t.turnIndex}: ${t.observations.map(o => o.toolCall.name).join('+')}`)
        .join('; ');

      this.summaryCache = (this.summaryCache + ' ' + fallbackSummary).slice(0, MAX_SUMMARY_LENGTH).trim();

      // 移除已处理的旧轮
      this.turns = this.turns.slice(this.turns.length - this.windowSize);

      return this.summaryCache;
    }
  }

  /**
   * 获取滑窗大小。
   */
  getWindowSize(): number {
    return this.windowSize;
  }

  /**
   * 获取当前轮次数。
   */
  getTurnCount(): number {
    return this.turns.length;
  }

  /**
   * 获取当前摘要缓存。
   */
  getSummary(): string {
    return this.summaryCache;
  }

  /**
   * 判断是否需要压缩。
   */
  needsCompression(): boolean {
    return this.turns.length > this.windowSize;
  }

  /**
   * 获取需要压缩的旧轮次（滑窗之外的）。
   * v6.0: P2-5 语义压缩支持
   */
  getOldTurnsForCompression(): WorkingMemoryTurn[] {
    if (this.turns.length <= this.windowSize) {
      return [];
    }
    return this.turns.slice(0, this.turns.length - this.windowSize);
  }

  /**
   * 更新摘要缓存。
   * v6.0: P2-5 语义压缩支持
   */
  updateSummaryCache(summary: string): void {
    this.summaryCache = summary;
  }

  /**
   * 移除已压缩的轮次。
   * v6.0: P2-5 语义压缩支持
   */
  removeCompressedTurns(count: number): void {
    this.turns = this.turns.slice(Math.min(count, this.turns.length - this.windowSize));
  }

  /**
   * 重置工作记忆。
   */
  reset(): void {
    this.turns = [];
    this.summaryCache = '';
  }
}
