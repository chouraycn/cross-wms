/**
 * Tool Context Guard — 工具结果上下文保护
 *
 * 防止工具结果撑爆 context window：
 * 1. 估算当前消息上下文总大小
 * 2. 如果加入工具结果会超限，自动截断
 * 3. 多工具调用结果累积保护
 * 4. 保留最新最重要的结果
 *
 * v11.1: 新增工具结果上下文保护
 */

import { logger } from '../logger.js';
import type { ApiMessage } from './contextTruncate.js';

// ===================== 常量 =====================

/** 单个工具结果最大字符数 */
const MAX_TOOL_RESULT_CHARS = 20000;

/** 工具结果占总 context 的最大比例 */
const MAX_CONTEXT_RATIO = 0.3;

/** 安全余量（token 数） */
const SAFETY_MARGIN_TOKENS = 2000;

/** 粗略的 token 估算（4 字符 ≈ 1 token） */
const CHARS_PER_TOKEN = 4;

// ===================== 核心函数 =====================

/**
 * 估算消息列表的总字符数
 */
function estimateMessagesChars(messages: ApiMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += msg.content.length;
    }
    if (msg.tool_calls) {
      total += JSON.stringify(msg.tool_calls).length;
    }
    if (typeof msg.reasoning_content === 'string') {
      total += msg.reasoning_content.length;
    }
  }
  return total;
}

/**
 * 智能截断工具结果：保留头部和尾部
 */
function smartTruncateResult(result: string, maxChars: number): string {
  if (result.length <= maxChars) {
    return result;
  }

  const headRatio = 0.6;
  const tailRatio = 0.3;
  const headChars = Math.floor(maxChars * headRatio);
  const tailChars = Math.floor(maxChars * tailRatio);

  const head = result.slice(0, headChars);
  const tail = result.slice(result.length - tailChars);
  const skipped = result.length - headChars - tailChars;

  return `${head}\n\n... [中间 ${skipped} 字符已省略] ...\n\n${tail}\n\n[结果已截断，原大小 ${result.length} 字符]`;
}

/**
 * 保护 context window 不被工具结果撑爆
 *
 * @param result 工具执行结果
 * @param messages 当前消息上下文
 * @param contextWindow 模型 context window 大小（token 数）
 * @returns 处理后的工具结果
 */
export function guardToolResultContext(
  result: string,
  messages: ApiMessage[],
  contextWindow: number,
): string {
  // 1. 单个结果大小限制
  if (result.length > MAX_TOOL_RESULT_CHARS) {
    logger.debug(
      `[ContextGuard] Tool result exceeds single limit: ${result.length} > ${MAX_TOOL_RESULT_CHARS} chars, truncating`
    );
    result = smartTruncateResult(result, MAX_TOOL_RESULT_CHARS);
  }

  // 2. 估算当前上下文总大小
  const currentChars = estimateMessagesChars(messages);
  const currentTokens = Math.ceil(currentChars / CHARS_PER_TOKEN);
  const contextLimit = contextWindow - SAFETY_MARGIN_TOKENS;

  // 3. 计算工具结果可用的 token 预算
  const resultTokens = Math.ceil(result.length / CHARS_PER_TOKEN);
  const projectedTokens = currentTokens + resultTokens;

  // 4. 如果加入结果后不会超限，直接返回
  if (projectedTokens <= contextLimit) {
    return result;
  }

  // 5. 计算可用预算
  const availableTokens = contextLimit - currentTokens;
  const maxResultChars = Math.floor(availableTokens * CHARS_PER_TOKEN * MAX_CONTEXT_RATIO);

  // 6. 如果可用预算太小，至少保留 2000 字符
  const minResultChars = 2000;
  const finalMaxChars = Math.max(minResultChars, Math.min(maxResultChars, MAX_TOOL_RESULT_CHARS));

  if (result.length > finalMaxChars) {
    logger.warn(
      `[ContextGuard] Context window protection: truncating result from ${result.length} to ${finalMaxChars} chars ` +
      `(current context: ${currentTokens} tokens, limit: ${contextLimit} tokens)`
    );
    result = smartTruncateResult(result, finalMaxChars);
  }

  return result;
}

/**
 * 批量保护多个工具结果
 */
export function guardMultipleToolResults(
  results: string[],
  messages: ApiMessage[],
  contextWindow: number,
): string[] {
  const contextLimit = contextWindow - SAFETY_MARGIN_TOKENS;
  const currentChars = estimateMessagesChars(messages);
  let accumulatedChars = currentChars;

  return results.map((result, index) => {
    const resultTokens = Math.ceil(result.length / CHARS_PER_TOKEN);
    const projectedChars = accumulatedChars + result.length;

    if (projectedChars / CHARS_PER_TOKEN > contextLimit) {
      // 需要截断
      const remainingTokens = contextLimit - Math.ceil(accumulatedChars / CHARS_PER_TOKEN);
      const maxChars = Math.max(2000, Math.floor(remainingTokens * CHARS_PER_TOKEN * 0.5));

      if (result.length > maxChars) {
        logger.warn(
          `[ContextGuard] Batch protection: truncating result ${index} from ${result.length} to ${maxChars} chars`
        );
        result = smartTruncateResult(result, maxChars);
      }
    }

    accumulatedChars += result.length;
    return result;
  });
}