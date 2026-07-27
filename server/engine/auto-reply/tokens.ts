/**
 * Token 计数与用量统计 — auto-reply 层的轻量封装。
 *
 * 参考 openclaw/src/auto-reply/tokens.ts 的设计，但根据任务要求不复用
 * openclaw 的 silent-reply token 逻辑，而是与 cross-wms 已有的
 * server/engine/llm/token-counter.ts 与 server/engine/llm/price-calculator.ts
 * 集成：本文件只做适配与累计，底层估算 / 计费调用既有实现。
 *
 * 提供的能力：
 * - `countTokens(text, model?)`：估算单段文本的 token 数
 * - `TokenCounter` 类：跨多次调用累计 token 用量与费用，并提供 `getStats()`
 *
 * 同时保留 openclaw 中静默回复相关的 token 常量和工具函数。
 */
import type { Api, Model, Usage } from '../llm/types.js';
import {
  estimateTokensForText,
  estimateTokensForModel,
} from '../llm/token-counter.js';
import {
  computeCost,
  type CostBreakdown,
} from '../llm/price-calculator.js';

/** Token that marks a heartbeat response as an acknowledgement with no user notification. */
export const HEARTBEAT_TOKEN = 'HEARTBEAT_OK';
/** Token that marks an auto-reply response as intentionally silent. */
export const SILENT_REPLY_TOKEN = 'NO_REPLY';

const HARMONY_CHANNEL_MARKER_RE = /^\s*(?:set-thought\s+)?<[\w]*\|[^>]*>\s*$/;
const BOX_DRAWING_HR_ONLY_RE = /^\s*─{3,}\s*$/;

export function isInternalFormattingArtifact(text: string | undefined): boolean {
  if (!text) return false;
  return HARMONY_CHANNEL_MARKER_RE.test(text) || BOX_DRAWING_HR_ONLY_RE.test(text);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const silentExactRegexByToken = new Map<string, RegExp>();
const silentTrailingRegexByToken = new Map<string, RegExp>();
const silentLeadingAttachedRegexByToken = new Map<string, RegExp>();
const silentLeadingRegexByToken = new Map<string, RegExp>();

function getSilentExactRegex(token: string): RegExp {
  const cached = silentExactRegexByToken.get(token);
  if (cached) return cached;
  const escaped = escapeRegExp(token);
  const regex = new RegExp(`^\\s*${escaped}(?:\\s+${escaped})*\\s*$`, 'i');
  silentExactRegexByToken.set(token, regex);
  return regex;
}

function getSilentTrailingRegex(token: string): RegExp {
  const cached = silentTrailingRegexByToken.get(token);
  if (cached) return cached;
  const escaped = escapeRegExp(token);
  const regex = new RegExp(`(?:^|\\s+|\\*+)${escaped}\\s*$`, 'i');
  silentTrailingRegexByToken.set(token, regex);
  return regex;
}

export function isSilentReplyText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) return false;
  return getSilentExactRegex(token).test(text);
}

type SilentReplyActionEnvelope = { action?: unknown };

function isSilentReplyJsonStringText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"') || !trimmed.includes(token)) return false;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === 'string' && parsed.trim() === token;
  } catch {
    return false;
  }
}

function isSilentReplyEnvelopeText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed || !trimmed.startsWith('{') || !trimmed.endsWith('}') || !trimmed.includes(token)) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed) as SilentReplyActionEnvelope;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const keys = Object.keys(parsed);
    return (
      keys.length === 1 &&
      keys[0] === 'action' &&
      typeof parsed.action === 'string' &&
      parsed.action.trim() === token
    );
  } catch {
    return false;
  }
}

const taggedReasoningPrefixRe =
  /^\s*<\s*(?:(?:antml:|mm:)?(?:think(?:ing)?|thought)|antthinking)\b[^<>]*>[\s\S]*?<\s*\/\s*(?:(?:antml:|mm:)?(?:think(?:ing)?|thought)|antthinking)\s*>\s*/i;
const openReasoningPrefixRe =
  /^\s*<\s*(?:(?:antml:|mm:)?(?:think(?:ing)?|thought)|antthinking)\b[^<>]*>/i;
const plainReasoningPrefixRe = /^\s*(?:think(?:ing)?|thought|analysis|reasoning)\s*:?\s*\r?\n/i;

function stripLeadingReasoningBlocks(text: string): string {
  let current = text;
  while (true) {
    const next = current.replace(taggedReasoningPrefixRe, '');
    if (next === current) return current;
    current = next;
  }
}

function stripFinalSilentToken(text: string, token: string): string | null {
  const escaped = escapeRegExp(token);
  const stripped = text.replace(new RegExp(`(?:^|[\\s*.])${escaped}\\s*$`, 'i'), '').trim();
  return stripped === text.trim() ? null : stripped;
}

const silentIntentTextRe =
  /^\s*(?:i|i'll|i\s+will|i'm|i\s+am|we|we'll|we\s+will|the\s+assistant|assistant|the\s+bot|bot|openclaw)\s+(?:(?:will\s+)?(?:stay|remain|keep|be)\s+(?:quiet|silent)(?:\s+(?:here|for\s+now|on\s+this|in\s+this\s+(?:chat|thread|channel|conversation)))?|(?:do\s+not|don't|dont|will\s+not|won't|would\s+not|should\s+not)\s+(?:reply|respond)(?:\s+(?:here|for\s+now|on\s+this|in\s+this\s+(?:chat|thread|channel|conversation)))?|(?:have|has)\s+nothing\s+(?:to|for)\s+(?:say|add|reply|respond))(?:[.!?]+)?\s*$/i;

function hasSilentIntentFinalSilentToken(text: string, token: string): boolean {
  const withoutToken = stripFinalSilentToken(text, token);
  if (withoutToken === null) return false;
  return !withoutToken || silentIntentTextRe.test(withoutToken);
}

const substantiveAnswerCueRe =
  /\b(?:answer|here(?:'s|\s+is)|tell\s+them|you\s+(?:should|can|could|need|must)|please|try|use|send|service\s+is|resolved|retry|yes|no,|sure)\b/i;
const bareReasoningPlaceholderRe =
  /^\s*(?:(?:internal|private)\s+)?(?:reasoning|thinking|thoughts?|analysis)(?:\s+notes?)?\s*$/i;

function hasPlainReasoningFinalSilentToken(text: string, token: string): boolean {
  const withoutToken = stripFinalSilentToken(text, token);
  if (withoutToken === null) return false;
  if (!withoutToken || silentIntentTextRe.test(withoutToken)) return true;
  const lines = withoutToken
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const finalLine = lines.at(-1);
  const previousLines = lines.slice(0, -1).join('\n');
  return (
    Boolean(
      finalLine &&
      silentIntentTextRe.test(finalLine) &&
      previousLines &&
      !substantiveAnswerCueRe.test(previousLines),
    ) || bareReasoningPlaceholderRe.test(withoutToken)
  );
}

function isReasoningPrefixedSilentReplyText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  const withoutLeadingReasoningBlocks = stripLeadingReasoningBlocks(trimmed);
  if (withoutLeadingReasoningBlocks !== trimmed) {
    return (
      isSilentReplyText(withoutLeadingReasoningBlocks, token) ||
      hasSilentIntentFinalSilentToken(withoutLeadingReasoningBlocks, token)
    );
  }

  if (openReasoningPrefixRe.test(trimmed)) {
    const withoutOpenReasoningPrefix = trimmed.replace(openReasoningPrefixRe, '');
    return (
      isSilentReplyText(withoutOpenReasoningPrefix, token) ||
      hasPlainReasoningFinalSilentToken(withoutOpenReasoningPrefix, token)
    );
  }
  if (!plainReasoningPrefixRe.test(trimmed)) return false;
  const withoutPlainReasoningPrefix = trimmed.replace(plainReasoningPrefixRe, '');
  return (
    isSilentReplyText(withoutPlainReasoningPrefix, token) ||
    hasPlainReasoningFinalSilentToken(withoutPlainReasoningPrefix, token)
  );
}

export function isSilentReplyPayloadText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  return (
    isSilentReplyText(text, token) ||
    isSilentReplyJsonStringText(text, token) ||
    isSilentReplyEnvelopeText(text, token) ||
    isReasoningPrefixedSilentReplyText(text, token)
  );
}

export function stripSilentToken(text: string, token: string = SILENT_REPLY_TOKEN): string {
  return text.replace(getSilentTrailingRegex(token), '').trim();
}

function getSilentLeadingAttachedRegex(token: string): RegExp {
  const cached = silentLeadingAttachedRegexByToken.get(token);
  if (cached) return cached;
  const escaped = escapeRegExp(token);
  const regex = new RegExp(`^\\s*(?:${escaped}\\s+)*${escaped}(?=[\\p{L}\\p{N}])`, 'iu');
  silentLeadingAttachedRegexByToken.set(token, regex);
  return regex;
}

function getSilentLeadingRegex(token: string): RegExp {
  const cached = silentLeadingRegexByToken.get(token);
  if (cached) return cached;
  const escaped = escapeRegExp(token);
  const regex = new RegExp(`^(?:\\s*${escaped})+\\s*`, 'i');
  silentLeadingRegexByToken.set(token, regex);
  return regex;
}

export function stripLeadingSilentToken(text: string, token: string = SILENT_REPLY_TOKEN): string {
  return text.replace(getSilentLeadingRegex(token), '').trim();
}

export function startsWithSilentToken(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) return false;
  return getSilentLeadingAttachedRegex(token).test(text);
}

export function isSilentReplyPrefixText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) return false;
  const trimmed = text.trimStart();
  if (!trimmed) return false;
  if (trimmed !== trimmed.toUpperCase()) return false;
  const normalized = trimmed.toUpperCase();
  if (!normalized) return false;
  if (normalized.length < 2) return false;
  if (/[^A-Z_]/.test(normalized)) return false;
  const tokenUpper = token.toUpperCase();
  if (!tokenUpper.startsWith(normalized)) return false;
  if (normalized.includes('_')) return true;
  return tokenUpper === SILENT_REPLY_TOKEN && normalized === 'NO';
}

/** 用量统计快照。 */
export type TokenStats = {
  /** 累计估算的输入 token（仅由 `count` 累计，未经真实 usage 校正）。 */
  estimatedInput: number;
  /** 通过 `recordUsage` 记录的真实输入 token 累计。 */
  input: number;
  /** 通过 `recordUsage` 记录的真实输出 token 累计。 */
  output: number;
  /** 通过 `recordUsage` 记录的缓存读 token 累计。 */
  cacheRead: number;
  /** 通过 `recordUsage` 记录的缓存写 token 累计。 */
  cacheWrite: number;
  /** 累计费用（USD）。 */
  cost: CostBreakdown;
  /** 已记录的调用次数。 */
  calls: number;
};

/** `TokenCounter` 的构造选项。 */
export type TokenCounterOptions = {
  /** 默认 API，用于在没有 model 时按 API 选择估算器。 */
  api?: Api;
  /** 默认模型，用于 `count` 与 `estimateCost`。 */
  model?: Model;
};

/** 用量记录入参（部分字段可省略，缺省按 0 处理）。 */
export type UsageInput = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

/**
 * 估算一段文本的 token 数。
 *
 * 若提供 `model`，则按模型族（API）估算；否则按默认估算器。
 * 该函数是对 `server/engine/llm/token-counter.ts` 中
 * `estimateTokensForText` / `estimateTokensForModel` 的转发。
 */
export function countTokens(text: string, model?: Model): number {
  if (!text) return 0;
  if (model) return estimateTokensForModel(text, model);
  return estimateTokensForText(text);
}

/**
 * Token 计数器：累计跨多次调用的 token 用量与费用。
 *
 * 设计要点：
 * - `count(text)` 仅做估算累计（无真实 usage 时使用），不会触发计费
 * - `recordUsage(usage, model)` 记录一次真实调用用量并计算费用
 * - `estimateCost(usage, model)` 计算单次费用但不写入累计
 * - `getStats()` 返回当前累计快照
 */
export class TokenCounter {
  private readonly options: TokenCounterOptions;
  private estimatedInput: number = 0;
  private input: number = 0;
  private output: number = 0;
  private cacheRead: number = 0;
  private cacheWrite: number = 0;
  private cost: CostBreakdown = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  };
  private calls: number = 0;

  constructor(options: TokenCounterOptions = {}) {
    this.options = options;
  }

  /** 估算单段文本的 token 数，并累加到 `estimatedInput`。 */
  count(text: string): number {
    const tokens = this.estimateTokens(text);
    this.estimatedInput += tokens;
    return tokens;
  }

  /** 仅估算 token 数，不做累计。 */
  estimateTokens(text: string): number {
    if (!text) return 0;
    if (this.options.model) {
      return estimateTokensForModel(text, this.options.model);
    }
    return estimateTokensForText(text, this.options.api);
  }

  /**
   * 记录一次真实调用的用量并累计费用。
   *
   * 若未提供 `model` 则回退到构造时配置的默认模型；若两者均缺失，
   * 则仅累计 token，跳过计费。
   */
  recordUsage(usage: UsageInput, model?: Model): CostBreakdown {
    const input = usage.input ?? 0;
    const output = usage.output ?? 0;
    const cacheRead = usage.cacheRead ?? 0;
    const cacheWrite = usage.cacheWrite ?? 0;

    this.input += input;
    this.output += output;
    this.cacheRead += cacheRead;
    this.cacheWrite += cacheWrite;
    this.calls += 1;

    const targetModel = model ?? this.options.model;
    if (!targetModel) {
      return { ...this.cost };
    }

    const breakdown = computeCost(targetModel, {
      input,
      output,
      cacheRead,
      cacheWrite,
    });
    this.cost.input += breakdown.input;
    this.cost.output += breakdown.output;
    this.cost.cacheRead += breakdown.cacheRead;
    this.cost.cacheWrite += breakdown.cacheWrite;
    this.cost.total += breakdown.total;
    return breakdown;
  }

  /**
   * 估算单次用量的费用，不写入累计。
   *
   * 若未提供 `model` 则回退到构造时配置的默认模型；若两者均缺失，
   * 返回全零的 `CostBreakdown`。
   */
  estimateCost(usage: UsageInput, model?: Model): CostBreakdown {
    const targetModel = model ?? this.options.model;
    if (!targetModel) {
      return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
    }
    return computeCost(targetModel, {
      input: usage.input ?? 0,
      output: usage.output ?? 0,
      cacheRead: usage.cacheRead ?? 0,
      cacheWrite: usage.cacheWrite ?? 0,
    });
  }

  /** 返回当前累计统计快照。 */
  getStats(): TokenStats {
    return {
      estimatedInput: this.estimatedInput,
      input: this.input,
      output: this.output,
      cacheRead: this.cacheRead,
      cacheWrite: this.cacheWrite,
      cost: { ...this.cost },
      calls: this.calls,
    };
  }

  /** 重置所有累计值。 */
  reset(): void {
    this.estimatedInput = 0;
    this.input = 0;
    this.output = 0;
    this.cacheRead = 0;
    this.cacheWrite = 0;
    this.cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
    this.calls = 0;
  }
}

/** 兼容类型导出：便于上层复用 llm 层的 Usage 形态。 */
export type { Usage, Model, Api };