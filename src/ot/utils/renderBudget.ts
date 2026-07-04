/**
 * 渲染预算管理
 *
 * 功能：
 * 1. 消息数限制（CHAT_HISTORY_RENDER_LIMIT = 100）
 * 2. 字符数限制（CHAT_HISTORY_RENDER_CHAR_BUDGET = 240,000）
 * 3. 双维度预算计算（同时满足两个限制）
 * 4. 消息渲染字符数估算
 *
 * 参考：OpenClaw history-limits.ts + build-chat-items.ts
 */

import type { ContentBlock, ThinkingContentBlock, TextContentBlock } from '../types/content-blocks';
import type { Message } from '../types/chat';

/** 最大渲染消息数（参考 OpenClaw） */
export const CHAT_HISTORY_RENDER_LIMIT = 100;

/** 最大渲染字符数（参考 OpenClaw） */
export const CHAT_HISTORY_RENDER_CHAR_BUDGET = 240_000;

/** 初始渲染窗口（首次加载时显示的消息数） */
export const INITIAL_CHAT_HISTORY_RENDER_WINDOW = 30;

/** 渲染窗口批次大小（每次滚动加载的消息数） */
export const CHAT_HISTORY_RENDER_WINDOW_BATCH = 30;

/** 滚动触发扩展的阈值（距离顶部/底部的像素数） */
export const CHAT_HISTORY_RENDER_EXPAND_SCROLL_TOP_PX = 48;

/** 渲染预算计算结果 */
export interface RenderBudgetResult {
  /** 起始渲染索引（从哪条消息开始渲染） */
  startIndex: number;
  /** 实际渲染的消息数 */
  visibleCount: number;
  /** 实际渲染的字符数 */
  renderChars: number;
  /** 是否达到消息数限制 */
  hitMessageLimit: boolean;
  /** 是否达到字符数限制 */
  hitCharLimit: boolean;
  /** 被隐藏的消息数（toolResult 等） */
  hiddenCount: number;
}

/**
 * 估算消息的渲染字符数
 *
 * 规则：
 * 1. 扁平消息（content + thinking）：content.length + thinking.length
 * 2. ContentBlock 数组：累加所有 text/thinking 块的长度
 * 3. 上限为 remainingBudget（避免单条消息耗尽预算）
 */
export function estimateMessageRenderChars(
  message: Message,
  remainingBudget: number = CHAT_HISTORY_RENDER_CHAR_BUDGET,
): number {
  // 扁平消息
  if (typeof message.content === 'string') {
    let chars = message.content.length;
    if (message.thinking) {
      chars += message.thinking.length;
    }
    return Math.min(chars, remainingBudget);
  }

  // ContentBlock 数组
  if (Array.isArray(message.contentBlocks)) {
    let chars = 0;
    for (const block of message.contentBlocks) {
      if (chars >= remainingBudget) break;

      if (block.type === 'text') {
        chars += (block as TextContentBlock).text.length;
      } else if (block.type === 'thinking') {
        chars += (block as ThinkingContentBlock).thinking.length;
      }
      // 其他类型（toolCall/toolResult/image/audio/video/file/canvas）不计入字符预算
    }
    return Math.min(chars, remainingBudget);
  }

  // 默认估算：每条消息平均 500 字符
  return Math.min(500, remainingBudget);
}

/**
 * 判断消息是否应该隐藏（不渲染）
 *
 * 隐藏规则：
 * 1. toolResult 类型 + showToolCalls=false → 隐藏
 * 2. 空消息（content 为空） → 隐藏
 */
export function isHiddenMessage(
  message: Message,
  options?: { showToolCalls?: boolean },
): boolean {
  const showToolCalls = options?.showToolCalls ?? true;

  // 空消息
  if (!message.content && !message.contentBlocks?.length) {
    return true;
  }

  // 工具调用结果消息（assistant 角色且包含 toolCalls）
  if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && !showToolCalls) {
    return true;
  }

  return false;
}

/**
 * 解析渲染限制参数
 *
 * 规则：
 * 1. 未提供 → 使用默认值 CHAT_HISTORY_RENDER_LIMIT
 * 2. 超出范围 → 截断到 [1, CHAT_HISTORY_RENDER_LIMIT]
 */
export function resolveHistoryRenderLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return CHAT_HISTORY_RENDER_LIMIT;
  }
  return Math.max(1, Math.min(CHAT_HISTORY_RENDER_LIMIT, Math.floor(limit)));
}

/**
 * 计算渲染预算（双维度）
 *
 * 从后往前遍历消息，同时检查：
 * 1. 消息数是否达到 renderLimit
 * 2. 字符数是否达到 CHAT_HISTORY_RENDER_CHAR_BUDGET
 *
 * 任一条件满足即停止。
 *
 * 参考：OpenClaw build-chat-items.ts resolveHistoryStartIndex
 */
export function calculateRenderBudget(
  messages: Message[],
  options?: {
    /** 渲染消息数上限 */
    renderLimit?: number;
    /** 是否显示工具调用消息 */
    showToolCalls?: boolean;
  },
): RenderBudgetResult {
  const renderLimit = resolveHistoryRenderLimit(options?.renderLimit);
  const showToolCalls = options?.showToolCalls ?? true;

  let visibleCount = 0;
  let renderChars = 0;
  let startIndex = messages.length;
  let hiddenCount = 0;

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];

    // 隐藏消息跳过
    if (isHiddenMessage(message, { showToolCalls })) {
      hiddenCount++;
      continue;
    }

    // 消息数限制检查
    if (visibleCount >= renderLimit) {
      break;
    }

    // 字符数预算检查
    const remainingBudget = Math.max(1, CHAT_HISTORY_RENDER_CHAR_BUDGET - renderChars + 1);
    const messageChars = estimateMessageRenderChars(message, remainingBudget);

    // 双维度检查：visibleCount > 0 确保至少渲染一条消息
    if (visibleCount > 0 && renderChars + messageChars > CHAT_HISTORY_RENDER_CHAR_BUDGET) {
      break;
    }

    renderChars += messageChars;
    visibleCount++;
    startIndex = index;
  }

  return {
    startIndex,
    visibleCount,
    renderChars,
    hitMessageLimit: visibleCount >= renderLimit,
    hitCharLimit: renderChars >= CHAT_HISTORY_RENDER_CHAR_BUDGET,
    hiddenCount,
  };
}

/**
 * 从 ContentBlock 数组计算渲染字符数
 *
 * 用于实时流式渲染场景：估算当前正在渲染的内容块字符数。
 */
export function calculateContentBlockChars(blocks: ContentBlock[]): number {
  let chars = 0;
  for (const block of blocks) {
    if (block.type === 'text') {
      chars += (block as TextContentBlock).text.length;
    } else if (block.type === 'thinking') {
      chars += (block as ThinkingContentBlock).thinking.length;
    }
  }
  return chars;
}

/**
 * 判断是否需要扩展渲染窗口
 *
 * 触发条件：
 * 1. scrollTop <= CHAT_HISTORY_RENDER_EXPAND_SCROLL_TOP_PX（顶部触发）
 * 2. distanceFromBottom <= CHAT_HISTORY_RENDER_EXPAND_SCROLL_TOP_PX（底部触发）
 */
export function shouldExpandRenderWindow(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): { expandAtTop: boolean; expandAtBottom: boolean } {
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

  const expandAtTop = scrollTop <= CHAT_HISTORY_RENDER_EXPAND_SCROLL_TOP_PX;
  const expandAtBottom =
    scrollTop > 0 && distanceFromBottom <= CHAT_HISTORY_RENDER_EXPAND_SCROLL_TOP_PX;

  return { expandAtTop, expandAtBottom };
}

/**
 * 计算新的渲染窗口大小（滚动扩展）
 *
 * 规则：
 * 1. 当前窗口 + CHAT_HISTORY_RENDER_WINDOW_BATCH
 * 2. 不超过 CHAT_HISTORY_RENDER_LIMIT
 */
export function expandRenderWindow(
  currentLimit: number,
  maxCap: number = CHAT_HISTORY_RENDER_LIMIT,
): number {
  return Math.min(maxCap, currentLimit + CHAT_HISTORY_RENDER_WINDOW_BATCH);
}

/**
 * 计算初始渲染窗口大小
 *
 * 规则：
 * 1. 新会话：INITIAL_CHAT_HISTORY_RENDER_WINDOW
 * 2. 已有消息：min(INITIAL_CHAT_HISTORY_RENDER_WINDOW, 消息总数)
 */
export function calculateInitialRenderWindow(
  messageCount: number,
): number {
  return Math.min(INITIAL_CHAT_HISTORY_RENDER_WINDOW, messageCount);
}

/**
 * 判断是否需要渲染"加载更多"指示器
 *
 * 条件：startIndex > 0（有历史消息未渲染）
 */
export function needsLoadMoreIndicator(
  startIndex: number,
): boolean {
  return startIndex > 0;
}

/**
 * 统计渲染预算使用率
 *
 * 用于 UI 展示：显示当前渲染的消息数/字符数占比。
 */
export function calculateBudgetUsage(
  result: RenderBudgetResult,
): {
  messageUsageRatio: number;
  charUsageRatio: number;
  budgetExhausted: boolean;
} {
  const messageUsageRatio = result.visibleCount / CHAT_HISTORY_RENDER_LIMIT;
  const charUsageRatio = result.renderChars / CHAT_HISTORY_RENDER_CHAR_BUDGET;
  const budgetExhausted = result.hitMessageLimit || result.hitCharLimit;

  return {
    messageUsageRatio,
    charUsageRatio,
    budgetExhausted,
  };
}

/**
 * 压缩估算：如果超出预算，估算需要压缩多少历史消息
 *
 * 用于上下文压缩系统：提前判断是否需要触发压缩。
 */
export function estimateCompressionNeeded(
  messages: Message[],
  currentContextTokens: number,
  maxContextTokens: number,
): {
  needsCompression: boolean;
  excessTokens: number;
  messagesToCompact: number;
  suggestedSummaryTokens: number;
} {
  const needsCompression = currentContextTokens > maxContextTokens;
  const excessTokens = needsCompression ? currentContextTokens - maxContextTokens : 0;

  // 估算需要压缩的消息数：假设每条消息平均 500 tokens
  const messagesToCompact = Math.ceil(excessTokens / 500);

  // 建议摘要长度：压缩后节省 80% 的 tokens
  const suggestedSummaryTokens = Math.floor(excessTokens * 0.8);

  return {
    needsCompression,
    excessTokens,
    messagesToCompact,
    suggestedSummaryTokens,
  };
}