/**
 * Token 计数器 — 不同模型的 Token 计数。
 *
 * 在没有 tiktoken / 真实分词器的情况下，提供基于经验值的估算。
 * 不同模型族（GPT / Claude / Gemini / 中文模型）的字符→token 比例不同。
 *
 * 此模块提供：
 * - `estimateTokensForModel`：根据模型族估算
 * - `estimateTokensForText`：纯文本估算
 * - `countMessageTokens`：消息列表估算（含每条消息的固定开销）
 */
import type { Api, Model } from './types.js';

/** 模型族 token 估算配置。 */
export type TokenEstimatorConfig = {
  /** 每个英文字符的 token 权重（1/4 表示 4 字符 ≈ 1 token）。 */
  latinCharsPerToken: number;
  /** 每个 CJK 字符的 token 权重（1.5 表示 1 字符 ≈ 1.5 token）。 */
  cjkTokensPerChar: number;
  /** 每条消息的固定开销 token。 */
  perMessageOverhead: number;
  /** 整个请求的基础开销 token。 */
  baseOverhead: number;
};

/** 不同 API 的默认估算配置。 */
export const TOKEN_ESTIMATORS: Partial<Record<Api, TokenEstimatorConfig>> = {
  'openai-completions': { latinCharsPerToken: 4, cjkTokensPerChar: 1.5, perMessageOverhead: 4, baseOverhead: 3 },
  'openai-responses': { latinCharsPerToken: 4, cjkTokensPerChar: 1.5, perMessageOverhead: 4, baseOverhead: 3 },
  'azure-openai': { latinCharsPerToken: 4, cjkTokensPerChar: 1.5, perMessageOverhead: 4, baseOverhead: 3 },
  'anthropic-messages': { latinCharsPerToken: 4, cjkTokensPerChar: 1.5, perMessageOverhead: 4, baseOverhead: 3 },
  'google-gemini': { latinCharsPerToken: 4, cjkTokensPerChar: 1.8, perMessageOverhead: 3, baseOverhead: 2 },
  'mistral-chat': { latinCharsPerToken: 4, cjkTokensPerChar: 1.5, perMessageOverhead: 4, baseOverhead: 3 },
  'deepseek-chat': { latinCharsPerToken: 4, cjkTokensPerChar: 1.2, perMessageOverhead: 4, baseOverhead: 3 },
  'moonshot-chat': { latinCharsPerToken: 4, cjkTokensPerChar: 1.2, perMessageOverhead: 4, baseOverhead: 3 },
  'qwen-chat': { latinCharsPerToken: 4, cjkTokensPerChar: 1.0, perMessageOverhead: 4, baseOverhead: 3 },
  'zhipu-chat': { latinCharsPerToken: 4, cjkTokensPerChar: 1.0, perMessageOverhead: 4, baseOverhead: 3 },
  'baichuan-chat': { latinCharsPerToken: 4, cjkTokensPerChar: 1.0, perMessageOverhead: 4, baseOverhead: 3 },
  'minimax-chat': { latinCharsPerToken: 4, cjkTokensPerChar: 1.2, perMessageOverhead: 4, baseOverhead: 3 },
  'ollama': { latinCharsPerToken: 4, cjkTokensPerChar: 1.5, perMessageOverhead: 4, baseOverhead: 3 },
  'aws-bedrock': { latinCharsPerToken: 4, cjkTokensPerChar: 1.5, perMessageOverhead: 4, baseOverhead: 3 },
};

const DEFAULT_ESTIMATOR: TokenEstimatorConfig = {
  latinCharsPerToken: 4,
  cjkTokensPerChar: 1.5,
  perMessageOverhead: 4,
  baseOverhead: 3,
};

/** 统计字符构成。 */
export function countChars(text: string): { cjk: number; latin: number; other: number } {
  let cjk = 0;
  let latin = 0;
  let other = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) {
      cjk++;
    } else if (/[a-zA-Z0-9\s]/.test(ch)) {
      latin++;
    } else {
      other++;
    }
  }
  return { cjk, latin, other };
}

/** 估算纯文本 token 数。 */
export function estimateTokensForText(text: string, api?: Api): number {
  if (!text) return 0;
  const config = (api && TOKEN_ESTIMATORS[api]) ?? DEFAULT_ESTIMATOR;
  const { cjk, latin, other } = countChars(text);
  const cjkTokens = cjk * config.cjkTokensPerChar;
  const latinTokens = latin / config.latinCharsPerToken;
  // 其他字符（标点等）按 1 字符 1 token
  const otherTokens = other;
  return Math.ceil(cjkTokens + latinTokens + otherTokens);
}

/** 估算单条消息 token 数（含开销）。 */
export function estimateMessageTokens(
  message: { role: string; content: string },
  api?: Api,
): number {
  const config = (api && TOKEN_ESTIMATORS[api]) ?? DEFAULT_ESTIMATOR;
  const roleTokens = Math.ceil(message.role.length / config.latinCharsPerToken);
  const contentTokens = estimateTokensForText(message.content, api);
  return roleTokens + contentTokens + config.perMessageOverhead;
}

/** 估算消息列表总 token 数。 */
export function countMessageTokens(
  messages: Array<{ role: string; content: string }>,
  api?: Api,
): number {
  const config = (api && TOKEN_ESTIMATORS[api]) ?? DEFAULT_ESTIMATOR;
  let total = config.baseOverhead;
  for (const m of messages) {
    total += estimateMessageTokens(m, api);
  }
  return total;
}

/** 根据模型估算 token 数。 */
export function estimateTokensForModel(
  text: string,
  model: Model,
): number {
  return estimateTokensForText(text, model.api);
}

/** 判断剩余 token 是否足够生成回复（粗略）。 */
export function hasEnoughContext(
  model: Model,
  messages: Array<{ role: string; content: string }>,
  reservedOutput = 1024,
): boolean {
  const inputTokens = countMessageTokens(messages, model.api);
  return inputTokens + reservedOutput <= model.contextWindow;
}

/** 计算模型剩余可用输入 token。 */
export function remainingInputTokens(
  model: Model,
  messages: Array<{ role: string; content: string }>,
): number {
  const used = countMessageTokens(messages, model.api);
  const reservedOutput = model.maxOutputTokens ?? 1024;
  return Math.max(0, model.contextWindow - used - reservedOutput);
}
