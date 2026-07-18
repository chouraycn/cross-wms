/**
 * 思考模式（thinking mode）控制器 — 开关与流式解析。
 *
 * 参考 openclaw/src/auto-reply/thinking.ts 的设计，但聚焦于任务描述中
 * 要求的核心能力：思考模式开关、流式思考内容解析，以及与 DeepSeek R1
 * `reasoning_content` 字段的对接（参见
 * server/engine/llm/providers/deepseek.ts）。
 *
 * 注意：openclaw 的 thinking.ts 主要处理 provider/model 级别的能力目录
 * （profile/catalog/level 解析）。本文件不复刻那套目录逻辑，只实现
 * auto-reply 层在流式回复中需要的「开关 + 解析」能力，避免与
 * server/engine/llm/model-utils.ts 中已有的 `clampThinkingLevel` /
 * `getSupportedThinkingLevels` 重复。
 */
import type { ThinkLevel } from './types.js';

/** 思考内容解析结果。 */
export type ThinkingParseResult = {
  /** 本次 chunk 中解析到的思考内容（reasoning）。 */
  reasoning?: string;
  /** 本次 chunk 中解析到的正文内容。 */
  content?: string;
};

/**
 * 流式 chunk 的可接受形态。
 * - 字符串：直接视为 reasoning 内容（适用于上游已识别为思考段的场景）
 * - 对象：兼容 DeepSeek 流式 delta 形态，可包含 `reasoning_content` 与 `content`
 */
export type ThinkingChunk =
  | string
  | {
      reasoning_content?: string;
      content?: string;
      // 兼容其他携带 reasoning 字段的 provider
      reasoning?: string;
    };

/** `ThinkingModeController` 的构造选项。 */
export type ThinkingModeControllerOptions = {
  /** 初始是否启用思考模式，默认 false。 */
  enabled?: boolean;
  /** 初始思考级别（仅作记录，不影响解析逻辑）。 */
  level?: ThinkLevel;
};

/**
 * 思考模式控制器。
 *
 * 维护思考模式开关状态，并负责解析流式 chunk 中的思考内容
 * （DeepSeek R1 的 `reasoning_content` 字段）。
 *
 * 使用方式：
 * ```ts
 * const ctrl = new ThinkingModeController({ enabled: true });
 * for await (const chunk of stream) {
 *   const { reasoning, content } = ctrl.parseThinkingContent(chunk.delta);
 *   if (reasoning) emitThinking(reasoning);
 *   if (content) emitText(content);
 * }
 * ```
 */
export class ThinkingModeController {
  private enabled: boolean;
  private level: ThinkLevel | undefined;
  private reasoningBuffer: string = '';

  constructor(options: ThinkingModeControllerOptions = {}) {
    this.enabled = options.enabled === true;
    this.level = options.level;
  }

  /** 当前是否启用思考模式。 */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** 开启思考模式。 */
  enable(): void {
    this.enabled = true;
  }

  /** 关闭思考模式。 */
  disable(): void {
    this.enabled = false;
  }

  /** 设置思考级别（仅作记录，便于上层读取）。 */
  setLevel(level: ThinkLevel | undefined): void {
    this.level = level;
  }

  /** 读取当前思考级别。 */
  getLevel(): ThinkLevel | undefined {
    return this.level;
  }

  /** 读取已累积的思考内容缓冲区。 */
  getReasoningBuffer(): string {
    return this.reasoningBuffer;
  }

  /** 清空思考内容缓冲区。 */
  reset(): void {
    this.reasoningBuffer = '';
  }

  /**
   * 解析流式 chunk 中的思考内容与正文内容。
   *
   * 与 DeepSeek R1 的 `reasoning_content` 字段对接：
   * - 当 chunk 为对象时，分别读取 `reasoning_content`（兼容 `reasoning`）
   *   与 `content` 字段
   * - 当 chunk 为字符串时，整体视为思考内容
   *
   * 若思考模式被关闭，仍会解析字段，但 reasoning 不会累积到缓冲区，
   * 由调用方根据 `isEnabled()` 决定是否消费。
   */
  parseThinkingContent(chunk: ThinkingChunk | null | undefined): ThinkingParseResult {
    if (chunk == null) return {};

    if (typeof chunk === 'string') {
      const reasoning = chunk;
      if (this.enabled && reasoning) {
        this.reasoningBuffer += reasoning;
      }
      return reasoning ? { reasoning } : {};
    }

    const reasoning =
      chunk.reasoning_content ?? chunk.reasoning ?? undefined;
    const content = chunk.content ?? undefined;

    if (this.enabled && reasoning) {
      this.reasoningBuffer += reasoning;
    }

    const result: ThinkingParseResult = {};
    if (reasoning) result.reasoning = reasoning;
    if (content) result.content = content;
    return result;
  }
}

/**
 * 判定一个流式 delta 对象是否携带 DeepSeek R1 风格的思考内容。
 * 便于上层在分发事件前快速过滤。
 */
export function hasReasoningContent(
  chunk: ThinkingChunk | null | undefined,
): boolean {
  if (!chunk) return false;
  if (typeof chunk === 'string') return chunk.length > 0;
  return Boolean(chunk.reasoning_content ?? chunk.reasoning);
}
