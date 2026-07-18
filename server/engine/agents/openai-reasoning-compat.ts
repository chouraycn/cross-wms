/**
 * OpenAI reasoning-effort compatibility helpers.
 *
 * Keeps provider metadata and built-in model exceptions on one path before request payloads are built.
 *
 * 移植自 openclaw/src/agents/openai-reasoning-compat.ts。
 * 注意：原 openclaw 实现依赖 @openclaw/normalization-core/string-coerce 中的
 * normalizeLowercaseStringOrEmpty。本地降级实现：内联该函数。
 */

// 内联降级实现：返回 lower-case 后的字符串，非字符串或空串返回 ""。
function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed;
}

/** Minimal model fields needed to resolve OpenAI reasoning effort compatibility. */
type OpenAIReasoningCompatModel = {
  provider?: string | null;
  id?: string | null;
  compat?: unknown;
};

// These OpenAI models reject minimal/low reasoning but accept medium. Map lower
// efforts up unless provider metadata supplies a more specific compat map.
const OPENAI_MEDIUM_ONLY_REASONING_MODEL_IDS = new Set(["gpt-5.1-codex-mini"]);

// Provider metadata can remap reasoning effort names. Keep only string pairs so
// malformed compat data cannot poison request parameters.
function readCompatReasoningEffortMap(compat: unknown): Record<string, string> {
  if (!compat || typeof compat !== "object") {
    return {};
  }
  const rawMap = (compat as { reasoningEffortMap?: unknown }).reasoningEffortMap;
  if (!rawMap || typeof rawMap !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(rawMap).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}

/** Resolves the reasoning effort remap for an OpenAI-compatible model. */
export function resolveOpenAIReasoningEffortMap(
  model: OpenAIReasoningCompatModel,
  fallbackMap: Record<string, string> = {},
): Record<string, string> {
  const provider = normalizeLowercaseStringOrEmpty(model.provider ?? "");
  const id = normalizeLowercaseStringOrEmpty(model.id ?? "");
  const builtinMap: Record<string, string> =
    provider === "openai" && OPENAI_MEDIUM_ONLY_REASONING_MODEL_IDS.has(id)
      ? { minimal: "medium", low: "medium" }
      : {};
  return {
    ...fallbackMap,
    ...builtinMap,
    ...readCompatReasoningEffortMap(model.compat),
  };
}
