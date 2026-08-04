/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/bootstrap.ts
 *
 * 简化版：仅包含 sanitizeGoogleTurnOrdering。
 * 完整的 bootstrap.ts 模块（476 行）负责构建/清理 embedded-agent session 的 bootstrap
 * 上下文，依赖较深（config 类型、agent-scope、workspace 等），此处仅提取被
 * google.ts 引用的核心函数。
 *
 * 注：原始 sanitizeGoogleTurnOrdering 委托给 ../../shared/google-turn-ordering.ts
 * 的 sanitizeGoogleAssistantFirstOrdering。cross-wms 中没有该文件，因此将其内联。
 */

/**
 * 本地 AgentMessage 类型 — 仅描述此函数实际访问的字段。
 * 通过 role 字面量支持类型推断，并保留 [key: string]: unknown 以兼容历史数据。
 */
type AgentMessage = { role?: unknown; content?: unknown; [key: string]: unknown };

const GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT = "(session bootstrap)";

/** Add a synthetic user bootstrap when Google-style providers receive assistant-first turns. */
function sanitizeGoogleAssistantFirstOrdering(messages: AgentMessage[]): AgentMessage[] {
  const first = messages[0] as { role?: unknown; content?: unknown } | undefined;
  const role = first?.role;
  const content = first?.content;
  if (
    role === "user" &&
    typeof content === "string" &&
    content.trim() === GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT
  ) {
    return messages;
  }
  if (role !== "assistant") {
    return messages;
  }

  // Google chat APIs reject assistant-first transcripts. The bootstrap marker
  // makes the mutation idempotent while preserving the original assistant turn.
  const bootstrap: AgentMessage = {
    role: "user",
    content: GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT,
    timestamp: Date.now(),
  } as AgentMessage;

  return [bootstrap, ...messages];
}

export function sanitizeGoogleTurnOrdering(messages: AgentMessage[]): AgentMessage[] {
  return sanitizeGoogleAssistantFirstOrdering(messages);
}

// ============================================================================
// WMS 兼容：barrel embedded-agent-helpers.ts 期望以下导出。
// openclaw 完整 bootstrap.ts（476 行）依赖 config 类型、agent-scope、workspace 等，
// 此处提供常量与最小可运行 stub 函数，避免运行时 SyntaxError。
// ============================================================================

export const DEFAULT_BOOTSTRAP_MAX_CHARS = 20_000;
export const DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS = 60_000;
export const DEFAULT_BOOTSTRAP_PROMPT_TRUNCATION_WARNING_MODE = "always" as const;

/** 解析 bootstrap 最大字符数。Stub: 返回默认值。 */
export function resolveBootstrapMaxChars(..._args: unknown[]): number {
  return DEFAULT_BOOTSTRAP_MAX_CHARS;
}

/** 解析 bootstrap 总最大字符数。Stub: 返回默认值。 */
export function resolveBootstrapTotalMaxChars(..._args: unknown[]): number {
  return DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS;
}

/** 解析 bootstrap 提示截断警告模式。Stub: 返回默认值。 */
export function resolveBootstrapPromptTruncationWarningMode(..._args: unknown[]): string {
  return DEFAULT_BOOTSTRAP_PROMPT_TRUNCATION_WARNING_MODE;
}

/** 确保会话头部存在。Stub: 返回 undefined。 */
export function ensureSessionHeader(..._args: unknown[]): unknown {
  return undefined;
}

/** 构建 bootstrap 上下文文件。Stub: 返回空数组。 */
export function buildBootstrapContextFiles(..._args: unknown[]): unknown[] {
  return [];
}

// ============================================================================
// 移植自 openclaw/src/agents/embedded-agent-helpers/bootstrap.ts
// images.ts 依赖 stripThoughtSignatures 清理 Claude 风格的 thought_signature 字段。
// ============================================================================

type ThoughtSignatureSanitizeOptions = {
  allowBase64Only?: boolean;
  includeCamelCase?: boolean;
};

type ContentBlockWithSignature = {
  thought_signature?: unknown;
  thoughtSignature?: unknown;
  [key: string]: unknown;
};

function isBase64Signature(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/**
 * Strips Claude-style thought_signature fields from content blocks.
 * Gemini expects thought signatures as base64-encoded bytes, but Claude stores message ids
 * like "msg_abc123...". We only strip "msg_*" to preserve any provider-valid signatures.
 */
export function stripThoughtSignatures<T>(
  content: T,
  options?: ThoughtSignatureSanitizeOptions,
): T {
  if (!Array.isArray(content)) {
    return content;
  }
  const allowBase64Only = options?.allowBase64Only ?? false;
  const includeCamelCase = options?.includeCamelCase ?? false;
  const shouldStripSignature = (value: unknown): boolean => {
    if (!allowBase64Only) {
      return typeof value === "string" && value.startsWith("msg_");
    }
    return typeof value !== "string" || !isBase64Signature(value);
  };
  return content.map((block) => {
    if (!block || typeof block !== "object") {
      return block;
    }
    const rec = block as ContentBlockWithSignature;
    const stripSnake = shouldStripSignature(rec.thought_signature);
    const stripCamel = includeCamelCase ? shouldStripSignature(rec.thoughtSignature) : false;
    if (!stripSnake && !stripCamel) {
      return block;
    }
    const next = { ...rec };
    if (stripSnake) {
      delete next.thought_signature;
    }
    if (stripCamel) {
      delete next.thoughtSignature;
    }
    return next;
  }) as T;
}
