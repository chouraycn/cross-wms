/**
 * Auto Compressor — 主动式自动上下文压缩策略
 *
 * 与现有模块的关系与集成说明：
 *
 * 1. contextCompress.ts（被动式溢出压缩）
 *    - 定位：防御性兜底，当 token 即将超出模型上下文窗口时才触发
 *    - 触发时机：API 调用前检测到 token 超限
 *    - 策略：将旧消息整体压缩为单条摘要，注入到保留消息开头
 *    - 集成方式：AutoCompressor 生成的压缩计划可直接传递给 compressContextWithSummary，
 *      或在 shouldCompress() 返回 true 时调用其进行实际压缩
 *
 * 2. contextTruncate.ts（截断工具）
 *    - 定位：最后手段，直接丢弃旧消息
 *    - 提供能力：estimateMessagesTokens() 用于 token 估算
 *    - 集成方式：AutoCompressor 内部使用其 token 估算能力
 *
 * 3. AutoCompressor（本模块，主动式周期压缩）
 *    - 定位：主动管理上下文健康度，在溢出前就进行渐进式压缩
 *    - 触发时机：按阈值 / 按轮次 / 手动触发
 *    - 策略：多级压缩（Level 1 摘要 → Level 2 合并工具结果 → Level 3 深度压缩）
 *    - 使用场景：长对话中周期性瘦身，避免一次性大规模压缩丢失过多上下文
 *
 * 典型集成流程：
 *   const compressor = new AutoCompressor({ trigger: 'turn_interval', turnInterval: 10 });
 *   // 每轮对话后：
 *   compressor.trackTurn(messages, estimateMessagesTokens(messages));
 *   if (compressor.shouldCompress()) {
 *     const plan = compressor.getCompressionPlan(messages);
 *     // 使用 plan 指导 compressContextWithSummary 或自定义压缩逻辑
 *   }
 */

import { estimateMessagesTokens } from './contextTruncate.js';
import type { ModelCallConfig } from '../aiClient.js';
import { logger } from '../logger.js';
import { compactionProviderRegistry, type CompactionProvider } from './compactionProvider.js';

export type CompressionTrigger = 'threshold' | 'turn_interval' | 'manual';
export type CompressionLevel = 1 | 2 | 3;

export interface CompressionPlanItem {
  index: number;
  role: string;
  action: 'compress' | 'merge' | 'keep' | 'drop';
  estimatedTokens: number;
}

export interface CompressionPlan {
  level: CompressionLevel;
  items: CompressionPlanItem[];
  compressRange: { start: number; end: number };
  beforeTokens: number;
  estimatedAfterTokens: number;
  estimatedSavingsRatio: number;
  isSafeToExecute: boolean;
  safetyWarnings: string[];
}

export interface CompressionHookContext {
  compressor: AutoCompressor;
  plan: CompressionPlan;
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>;
  level: CompressionLevel;
}

export type CompressionHook = (context: CompressionHookContext) => Promise<void> | void;

export interface CompressionHooks {
  beforeCompress?: CompressionHook;
  afterCompress?: CompressionHook;
  onCompressionPlan?: CompressionHook;
}

export interface AutoCompressorConfig {
  trigger: CompressionTrigger;
  thresholdRatio?: number;
  turnInterval?: number;
  preserveRecent?: number;
  preserveSystem?: boolean;
  contextWindow?: number;
  safetyCheckEnabled?: boolean;
  minMessagesBeforeCompression?: number;
  maxCompressionRatio?: number;
  hooks?: CompressionHooks;
  /** 可插拔压缩 Provider ID（可选，使用指定 provider 而非默认） */
  compressionProviderId?: string;
  /** 压缩后回调钩子（用于通知用户已压缩） */
  onCompressed?: (result: { originalTokens: number; compressedTokens: number; savingsRatio: number }) => void;
}

/**
 * 对话轮次记录
 */
interface TurnRecord {
  /** 轮次序号 */
  turnNumber: number;
  /** 该轮结束时的消息总数 */
  messageCount: number;
  /** 该轮结束时的预估 token 数 */
  estimatedTokens: number;
}

/**
 * 主动式自动上下文压缩器
 *
 * 追踪对话轮次，根据配置的触发策略主动判断是否需要压缩，
 * 并生成多级压缩计划，指导上下文压缩操作。
 *
 * 多级压缩策略：
 * - Level 1（轻量）：仅对早期的 user/assistant 消息做摘要，保留所有工具调用
 * - Level 2（中等）：在 Level 1 基础上，合并连续的工具调用结果为摘要
 * - Level 3（深度）：仅保留关键决策点（用户核心需求、重大决策、最终结果），
 *                    大部分中间过程和工具调用都被压缩
 */
export class AutoCompressor {
  private config: Required<Omit<AutoCompressorConfig, 'contextWindow' | 'hooks' | 'compressionProviderId' | 'onCompressed'>> &
    Pick<AutoCompressorConfig, 'contextWindow' | 'hooks' | 'compressionProviderId' | 'onCompressed'>;

  private turnHistory: TurnRecord[] = [];
  private lastCompressionTurn: number = 0;
  private currentTurn: number = 0;
  private hooks: CompressionHooks;

  constructor(config: AutoCompressorConfig) {
    this.config = {
      trigger: config.trigger,
      thresholdRatio: config.thresholdRatio ?? 0.6,
      turnInterval: config.turnInterval ?? 10,
      preserveRecent: config.preserveRecent ?? 5,
      preserveSystem: config.preserveSystem ?? true,
      contextWindow: config.contextWindow,
      safetyCheckEnabled: config.safetyCheckEnabled ?? true,
      minMessagesBeforeCompression: config.minMessagesBeforeCompression ?? 4,
      maxCompressionRatio: config.maxCompressionRatio ?? 0.9,
      hooks: config.hooks,
      compressionProviderId: config.compressionProviderId,
      onCompressed: config.onCompressed,
    };
    this.hooks = config.hooks ?? {};
  }

  registerHook(name: keyof CompressionHooks, hook: CompressionHook): void {
    this.hooks[name] = hook;
    logger.debug(`[AutoCompressor] 已注册钩子: ${name}`);
  }

  unregisterHook(name: keyof CompressionHooks): void {
    delete this.hooks[name];
    logger.debug(`[AutoCompressor] 已注销钩子: ${name}`);
  }

  async executeHook(name: keyof CompressionHooks, context: CompressionHookContext): Promise<void> {
    const hook = this.hooks[name];
    if (!hook) return;
    try {
      await hook(context);
      logger.debug(`[AutoCompressor] 钩子执行成功: ${name}`);
    } catch (error) {
      logger.error(
        `[AutoCompressor] 钩子执行失败: ${name}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 追踪一轮对话
   *
   * 在每轮对话结束后调用，记录当前消息状态和 token 估算，
   * 用于后续的压缩触发判断。
   *
   * @param messages 当前完整消息数组
   * @param estimatedTokens 预估的总 token 数（不传则自动估算）
   */
  trackTurn(
    messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
    estimatedTokens?: number,
  ): void {
    this.currentTurn++;
    const tokens = estimatedTokens ?? estimateMessagesTokens(messages);
    this.turnHistory.push({
      turnNumber: this.currentTurn,
      messageCount: messages.length,
      estimatedTokens: tokens,
    });
  }

  /**
   * 判断是否需要触发压缩
   *
   * 根据配置的触发策略判断当前是否应该进行压缩。
   *
   * @returns 是否需要压缩
   */
  shouldCompress(): boolean {
    const lastTurn = this.turnHistory[this.turnHistory.length - 1];
    if (!lastTurn) return false;

    const turnsSinceLast = this.currentTurn - this.lastCompressionTurn;

    switch (this.config.trigger) {
      case 'threshold':
        if (!this.config.contextWindow) {
          return false;
        }
        const ratio = lastTurn.estimatedTokens / this.config.contextWindow;
        return ratio >= this.config.thresholdRatio;

      case 'turn_interval':
        return turnsSinceLast >= this.config.turnInterval;

      case 'manual':
        return false;

      default:
        return false;
    }
  }

  /**
   * 手动触发压缩标记
   *
   * 当 trigger='manual' 时，调用此方法后 shouldCompress() 会返回 true，
   * 同时生成压缩计划。调用后会重置内部计数。
   */
  triggerManual(): void {
    this.lastCompressionTurn = 0;
  }

  getCompressionPlan(
    messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
    forcedLevel?: CompressionLevel,
  ): CompressionPlan {
    const totalTokens = estimateMessagesTokens(messages);
    const level = forcedLevel ?? this.calculateCompressionLevel(messages, totalTokens);

    const items: CompressionPlanItem[] = [];
    const totalCount = messages.length;
    const preserveCount = Math.min(this.config.preserveRecent, totalCount);
    const preserveStartIdx = totalCount - preserveCount;

    let compressStart = -1;
    let compressEnd = -1;

    for (let i = 0; i < totalCount; i++) {
      const msg = messages[i];
      const msgTokens = estimateMessagesTokens([msg]);
      const isRecent = i >= preserveStartIdx;
      const isSystem = msg.role === 'system';

      let action: CompressionPlanItem['action'] = 'keep';

      if (isRecent) {
        action = 'keep';
      } else if (this.config.preserveSystem && isSystem) {
        action = 'keep';
      } else {
        action = this.getMessageAction(msg, level, i, messages);
      }

      if (action === 'compress' || action === 'merge' || action === 'drop') {
        if (compressStart === -1) compressStart = i;
        compressEnd = i + 1;
      }

      items.push({
        index: i,
        role: msg.role,
        action,
        estimatedTokens: msgTokens,
      });
    }

    if (compressStart === -1) {
      compressStart = 0;
      compressEnd = 0;
    }

    const estimatedAfterTokens = this.estimateAfterTokens(items, level, totalTokens);
    const estimatedSavingsRatio = totalTokens > 0
      ? 1 - estimatedAfterTokens / totalTokens
      : 0;

    const safetyResult = this.performSafetyCheck(messages, items, estimatedAfterTokens, totalTokens);

    const plan: CompressionPlan = {
      level,
      items,
      compressRange: { start: compressStart, end: compressEnd },
      beforeTokens: totalTokens,
      estimatedAfterTokens,
      estimatedSavingsRatio,
      isSafeToExecute: safetyResult.isSafe,
      safetyWarnings: safetyResult.warnings,
    };

    this.executeHook('onCompressionPlan', {
      compressor: this,
      plan,
      messages,
      level,
    });

    return plan;
  }

  async executeCompression(
    messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
    forcedLevel?: CompressionLevel,
  ): Promise<{ plan: CompressionPlan; shouldProceed: boolean }> {
    const plan = this.getCompressionPlan(messages, forcedLevel);

    await this.executeHook('beforeCompress', {
      compressor: this,
      plan,
      messages,
      level: plan.level,
    });

    // 如果指定了 Provider，使用可插拔 Provider（如果存在）
    if (this.config.compressionProviderId) {
      try {
        const result = await this.useCompactionProvider(messages);
        // Provider 成功执行后返回标记
        return {
          plan,
          shouldProceed: true,
          providerResult: result,
        } as any;
      } catch (err) {
        logger.warn(`[AutoCompressor] Provider compression failed, falling back to plan-only:`, err);
      }
    }

    if (!plan.isSafeToExecute && this.config.safetyCheckEnabled) {
      logger.warn(
        `[AutoCompressor] 压缩计划不安全，已阻止执行。警告: ${plan.safetyWarnings.join(', ')}`
      );
      return { plan, shouldProceed: false };
    }

    return { plan, shouldProceed: true };
  }

  /**
   * 使用可插拔 Provider 执行压缩
   *
   * @param messages - 待压缩消息
   * @param options - 压缩选项
   * @returns 压缩结果
   */
  async useCompactionProvider(
    messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
    options: {
      previousSummary?: string;
      preserveRecent?: number;
      providerId?: string;
    } = {},
  ): Promise<{
    summary: string;
    originalTokenCount: number;
    compressedTokenCount: number;
    providerId: string;
  }> {
    const providerId = options.providerId ?? this.config.compressionProviderId ?? 'builtin-summarize';
    const provider = compactionProviderRegistry.get(providerId);

    if (!provider) {
      // 降级到默认 provider
      const defaultProvider = compactionProviderRegistry.getDefault();
      if (!defaultProvider) {
        throw new Error(`No compression provider available (requested: ${providerId})`);
      }
      logger.warn(`[AutoCompressor] Provider '${providerId}' not found, using default '${defaultProvider.id}'`);
      return this.executeWithProvider(defaultProvider, messages, options);
    }

    return this.executeWithProvider(provider, messages, options);
  }

  /**
   * 使用指定 Provider 执行压缩（内部方法）
   */
  private async executeWithProvider(
    provider: CompactionProvider,
    messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
    options: { previousSummary?: string; preserveRecent?: number },
  ): Promise<{
    summary: string;
    originalTokenCount: number;
    compressedTokenCount: number;
    providerId: string;
  }> {
    try {
      const result = await provider.compress(messages, {
        previousSummary: options.previousSummary,
        preserveRecent: options.preserveRecent ?? this.config.preserveRecent,
        identifierPolicy: 'strict',
      });

      // 触发回调
      if (this.config.onCompressed) {
        this.config.onCompressed({
          originalTokens: result.originalTokenCount,
          compressedTokens: result.compressedTokenCount,
          savingsRatio: result.originalTokenCount > 0
            ? 1 - result.compressedTokenCount / result.originalTokenCount
            : 0,
        });
      }

      logger.info(
        `[AutoCompressor] Provider '${provider.id}' compressed ` +
        `${result.originalTokenCount} → ${result.compressedTokenCount} tokens ` +
        `(${(1 - result.compressedTokenCount / Math.max(1, result.originalTokenCount) * 100).toFixed(1)}% savings)`
      );

      return { ...result, providerId: provider.id };
    } catch (err) {
      logger.error(`[AutoCompressor] Provider '${provider.id}' compression failed:`, err);
      throw err;
    }
  }

  async completeCompression(
    messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
    plan: CompressionPlan,
  ): Promise<void> {
    await this.executeHook('afterCompress', {
      compressor: this,
      plan,
      messages,
      level: plan.level,
    });
    this.markCompressed();
  }

  private performSafetyCheck(
    messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
    items: CompressionPlanItem[],
    estimatedAfterTokens: number,
    totalTokens: number,
  ): { isSafe: boolean; warnings: string[] } {
    if (!this.config.safetyCheckEnabled) {
      return { isSafe: true, warnings: [] };
    }

    const warnings: string[] = [];

    if (messages.length < this.config.minMessagesBeforeCompression) {
      warnings.push(`消息数量不足 (${messages.length}/${this.config.minMessagesBeforeCompression})`);
    }

    const keepCount = items.filter(i => i.action === 'keep').length;
    if (keepCount === 0) {
      warnings.push('压缩计划将丢弃所有消息');
    }

    const dropCount = items.filter(i => i.action === 'drop').length;
    if (dropCount > messages.length * 0.5) {
      warnings.push(`丢弃消息过多 (${dropCount}/${messages.length})`);
    }

    const savingsRatio = totalTokens > 0 ? 1 - estimatedAfterTokens / totalTokens : 0;
    if (savingsRatio > this.config.maxCompressionRatio) {
      warnings.push(
        `压缩比例过高 (${(savingsRatio * 100).toFixed(1)}% > ${(this.config.maxCompressionRatio * 100).toFixed(1)}%)`
      );
    }

    const toolMessages = messages.filter(m => m.role === 'tool' || (m.role === 'assistant' && m.tool_calls));
    const toolActions = items.filter(i => {
      const msg = messages[i.index];
      return (msg.role === 'tool' || (msg.role === 'assistant' && msg.tool_calls)) && i.action !== 'keep';
    });

    if (toolMessages.length > 0 && toolActions.length === toolMessages.length) {
      warnings.push('所有工具调用消息将被压缩或丢弃');
    }

    const isSafe = warnings.length === 0;

    if (!isSafe) {
      logger.warn(`[AutoCompressor] 安全检查失败: ${warnings.join(', ')}`);
    }

    return { isSafe, warnings };
  }

  /**
   * 记录一次压缩已执行
   *
   * 在实际执行压缩后调用，更新内部状态（如上次压缩轮次）。
   */
  markCompressed(): void {
    this.lastCompressionTurn = this.currentTurn;
  }

  /**
   * 获取当前统计信息
   *
   * @returns 统计信息对象
   */
  getStats(): {
    currentTurn: number;
    lastCompressionTurn: number;
    turnsSinceLastCompression: number;
    totalTurnsTracked: number;
    lastEstimatedTokens?: number;
  } {
    const lastTurn = this.turnHistory[this.turnHistory.length - 1];
    return {
      currentTurn: this.currentTurn,
      lastCompressionTurn: this.lastCompressionTurn,
      turnsSinceLastCompression: this.currentTurn - this.lastCompressionTurn,
      totalTurnsTracked: this.turnHistory.length,
      lastEstimatedTokens: lastTurn?.estimatedTokens,
    };
  }

  /**
   * 重置压缩器状态
   *
   * 清空所有历史记录和计数，恢复初始状态。
   */
  reset(): void {
    this.turnHistory = [];
    this.lastCompressionTurn = 0;
    this.currentTurn = 0;
  }

  // ===================== 私有方法 =====================

  /**
   * 计算应使用的压缩级别
   *
   * 根据消息数量和 token 使用情况自动选择合适的压缩级别。
   */
  private calculateCompressionLevel(
    messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
    totalTokens: number,
  ): CompressionLevel {
    const contextWindow = this.config.contextWindow;

    if (contextWindow && contextWindow > 0) {
      const ratio = totalTokens / contextWindow;
      if (ratio >= 0.85) return 3;
      if (ratio >= 0.7) return 2;
      if (ratio >= this.config.thresholdRatio) return 1;
    }

    const messageCount = messages.length;
    if (messageCount > 50) return 3;
    if (messageCount > 30) return 2;
    return 1;
  }

  /**
   * 确定单条消息的压缩动作
   */
  private getMessageAction(
    msg: { role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string },
    level: CompressionLevel,
    index: number,
    allMessages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
  ): CompressionPlanItem['action'] {
    const isTool = msg.role === 'tool';
    const hasToolCalls = msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
    const isUser = msg.role === 'user';
    const isAssistant = msg.role === 'assistant';

    switch (level) {
      case 1:
        if (isTool) return 'keep';
        if (hasToolCalls) return 'keep';
        if (isUser || isAssistant) return 'compress';
        return 'compress';

      case 2:
        if (isTool) {
          const prevMsg = allMessages[index - 1];
          if (prevMsg && prevMsg.role === 'tool') {
            return 'merge';
          }
          return 'compress';
        }
        if (hasToolCalls) return 'compress';
        if (isUser || isAssistant) return 'compress';
        return 'compress';

      case 3:
        if (isTool) {
          const prevMsg = allMessages[index - 1];
          if (prevMsg && prevMsg.role === 'tool') {
            return 'drop';
          }
          return 'compress';
        }
        if (hasToolCalls) return 'compress';
        if (isUser || isAssistant) return 'compress';
        return 'compress';

      default:
        return 'keep';
    }
  }

  /**
   * 估算压缩后的 token 数
   */
  private estimateAfterTokens(
    items: CompressionPlanItem[],
    level: CompressionLevel,
    totalTokens: number,
  ): number {
    let keptTokens = 0;
    let compressTokens = 0;
    let mergeTokens = 0;

    for (const item of items) {
      switch (item.action) {
        case 'keep':
          keptTokens += item.estimatedTokens;
          break;
        case 'compress':
          compressTokens += item.estimatedTokens;
          break;
        case 'merge':
          mergeTokens += item.estimatedTokens;
          break;
        case 'drop':
          break;
      }
    }

    const compressionRatio = level === 1 ? 0.3 : level === 2 ? 0.15 : 0.05;
    const mergeRatio = 0.4;

    const compressedResultTokens = compressTokens * compressionRatio;
    const mergedResultTokens = mergeTokens * mergeRatio;

    return Math.ceil(keptTokens + compressedResultTokens + mergedResultTokens);
  }
}

/**
 * 根据压缩计划生成待压缩消息列表（供 compressContextWithSummary 使用）
 *
 * 辅助工具函数：从压缩计划中提取需要被压缩的消息，
 * 转换为 compressContextWithSummary 可直接使用的格式。
 *
 * @param messages 原始消息数组
 * @param plan 压缩计划
 * @returns 待压缩的消息数组（仅包含 role 和 content 字符串）
 */
export function extractMessagesForCompression(
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
  plan: CompressionPlan,
): Array<{ role: string; content: string }> {
  const result: Array<{ role: string; content: string }> = [];

  for (const item of plan.items) {
    if (item.action === 'compress' || item.action === 'merge') {
      const msg = messages[item.index];
      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (msg.content && typeof msg.content === 'object') {
        content = JSON.stringify(msg.content);
      }
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        content += `\n[工具调用: ${msg.tool_calls.map((tc) => (tc as { function?: { name?: string } }).function?.name || 'unknown').join(', ')}]`;
      }
      if (msg.role === 'tool' && msg.tool_call_id) {
        content = `[工具结果 ${msg.tool_call_id}]: ${content}`;
      }
      result.push({ role: msg.role, content });
    }
  }

  return result;
}

/**
 * 应用压缩计划结果
 *
 * 辅助工具函数：将压缩摘要应用到原始消息数组，
 * 返回压缩后的新消息数组。
 *
 * 注意：这是一个简化的应用函数，复杂场景建议直接使用 compressContextWithSummary
 *
 * @param messages 原始消息数组
 * @param plan 压缩计划
 * @param summaryText 压缩摘要文本
 * @returns 压缩后的消息数组
 */
export function applyCompressionPlan(
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
  plan: CompressionPlan,
  summaryText: string,
): Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }> {
  const result: typeof messages = [];
  const { start, end } = plan.compressRange;

  if (start > 0) {
    for (let i = 0; i < start; i++) {
      if (plan.items[i]?.action === 'keep') {
        result.push(messages[i]);
      }
    }
  }

  if (end > start) {
    result.push({ role: 'system', content: summaryText });
  }

  for (let i = end; i < messages.length; i++) {
    result.push(messages[i]);
  }

  return result;
}
