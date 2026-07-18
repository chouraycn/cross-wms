/**
 * OpenAI text verbosity normalization for provider-owned stream parameters.
 *
 * Invalid operator-supplied values are ignored with a warning instead of leaking into API payloads.
 *
 * 移植自 openclaw/src/agents/openai-text-verbosity.ts。
 * 注意：原 openclaw 实现依赖：
 *   - @openclaw/normalization-core/string-coerce 中的 normalizeOptionalLowercaseString
 *   - ./embedded-agent-runner/logger.js 中的 log
 * 本地降级实现：normalizeOptionalLowercaseString 内联实现；log 降级为 console。
 */

// 内联降级实现：返回 lower-case 后的字符串，非字符串或空串返回 undefined。
function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

// 内联降级实现：仅输出到 console.warn，避免引入完整 logger 依赖。
const log = {
  warn(message: string): void {
    // eslint-disable-next-line no-console
    console.warn(`[openai-text-verbosity] ${message}`);
  },
};

/** @deprecated OpenAI provider-owned stream helper; do not use from third-party plugins. */
export type OpenAITextVerbosity = "low" | "medium" | "high";

function normalizeOpenAITextVerbosity(value: unknown): OpenAITextVerbosity | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = normalizeOptionalLowercaseString(value);
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return undefined;
}

/** @deprecated OpenAI provider-owned stream helper; do not use from third-party plugins. */
export function resolveOpenAITextVerbosity(
  extraParams: Record<string, unknown> | undefined,
): OpenAITextVerbosity | undefined {
  const raw = extraParams?.textVerbosity ?? extraParams?.text_verbosity;
  const normalized = normalizeOpenAITextVerbosity(raw);
  if (raw !== undefined && normalized === undefined) {
    const rawSummary = typeof raw === "string" ? raw : typeof raw;
    log.warn(`ignoring invalid OpenAI text verbosity param: ${rawSummary}`);
  }
  return normalized;
}
