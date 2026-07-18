/**
 * OpenAI 兼容的 reasoning-effort 规范化。
 *
 * 不同 GPT family 暴露的 accepted effort 枚举不同，调用方在构造 provider
 * 负载前在此映射请求值。
 *
 * 注意：原 openclaw 实现依赖：
 *   - @openclaw/normalization-core/string-coerce 中的 normalizeLowercaseStringOrEmpty
 *   - @openclaw/normalization-core/string-normalization 中的 normalizeStringEntries、uniqueStrings
 * 本地降级实现：以上工具函数均内联实现。
 */

// 内联降级实现：返回 lower-case 后的字符串，非字符串或空串返回 ""。
function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed;
}

// 内联降级实现：保留首次出现的顺序，trim 后去重字符串数组。
function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

// 内联降级实现：规范化字符串条目，trim 空串丢弃。
function normalizeStringEntries(values: readonly unknown[]): string[] {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
}

export type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

// eslint-disable-next-line @typescript-eslint/ban-types -- (string & {}) 是 TS 中"字面量联合 + 任意字符串"的惯用模式，保留以匹配 openclaw 原始实现
export type OpenAIApiReasoningEffort = OpenAIReasoningEffort | (string & {});

type OpenAIReasoningModel = {
  provider?: unknown;
  id?: unknown;
  name?: unknown;
  api?: unknown;
  baseUrl?: unknown;
  compat?: unknown;
};

const GPT_5_REASONING_EFFORTS = ["minimal", "low", "medium", "high"] as const;
const GPT_51_REASONING_EFFORTS = ["none", "low", "medium", "high"] as const;
const GPT_52_REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh"] as const;
const GPT_CODEX_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
const GPT_PRO_REASONING_EFFORTS = ["medium", "high", "xhigh"] as const;
const GPT_5_PRO_REASONING_EFFORTS = ["high"] as const;
const GPT_51_CODEX_MAX_REASONING_EFFORTS = ["none", "medium", "high", "xhigh"] as const;
const GPT_51_CODEX_MINI_REASONING_EFFORTS = ["medium"] as const;
const GENERIC_REASONING_EFFORTS = ["low", "medium", "high"] as const;

function normalizeModelId(id: string | null | undefined): string {
  return normalizeLowercaseStringOrEmpty(id ?? "").replace(/-\d{4}-\d{2}-\d{2}$/u, "");
}

/** 返回某模型是否为 GPT-5.4 mini family。 */
export function isOpenAIGpt54MiniModel(model: OpenAIReasoningModel): boolean {
  const id = normalizeModelId(typeof model.id === "string" ? model.id : undefined);
  return /^gpt-5\.4-mini(?:-|$)/u.test(id);
}

/** 返回某模型是否为 GPT-5.5 family。 */
export function isOpenAIGpt55Model(model: OpenAIReasoningModel): boolean {
  const id = normalizeModelId(typeof model.id === "string" ? model.id : undefined);
  const name = normalizeModelId(typeof model.name === "string" ? model.name : undefined);
  return /^gpt-5\.5(?:-|$)/u.test(id) || /^gpt-5\.5(?:\s|\(|-|$)/u.test(name);
}

/** 将面向用户的 reasoning effort 名称规范化为 API effort 名称。 */
export function normalizeOpenAIReasoningEffort(effort: string): string {
  return effort === "minimal" ? "minimal" : effort;
}

function readCompatReasoningEfforts(compat: unknown): OpenAIApiReasoningEffort[] | undefined {
  if (!compat || typeof compat !== "object") {
    return undefined;
  }
  if ((compat as { supportsReasoningEffort?: unknown }).supportsReasoningEffort === false) {
    return [];
  }
  const raw = (compat as { supportedReasoningEfforts?: unknown }).supportedReasoningEfforts;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const supported = uniqueStrings(
    normalizeStringEntries(raw.filter((value) => typeof value === "string")),
  );
  return supported.length > 0 ? supported : undefined;
}

function isDisabledReasoningEffort(effort: string): boolean {
  return effort === "none" || effort === "off";
}

/** 解析某个 OpenAI 兼容模型接受的 reasoning effort。 */
export function resolveOpenAISupportedReasoningEfforts(
  model: OpenAIReasoningModel,
): readonly OpenAIApiReasoningEffort[] {
  const compatEfforts = readCompatReasoningEfforts(model.compat);
  if (compatEfforts) {
    return compatEfforts;
  }

  const id = normalizeModelId(typeof model.id === "string" ? model.id : undefined);
  if (id === "gpt-5.1-codex-mini") {
    return GPT_51_CODEX_MINI_REASONING_EFFORTS;
  }
  if (id === "gpt-5.1-codex-max") {
    return GPT_51_CODEX_MAX_REASONING_EFFORTS;
  }
  if (/^gpt-5(?:\.\d+)?-codex(?:-|$)/u.test(id)) {
    return GPT_CODEX_REASONING_EFFORTS;
  }
  if (id === "gpt-5-pro") {
    return GPT_5_PRO_REASONING_EFFORTS;
  }
  if (/^gpt-5\.[2-9](?:\.\d+)?-pro(?:-|$)/u.test(id)) {
    return GPT_PRO_REASONING_EFFORTS;
  }
  if (/^gpt-5\.[2-9](?:\.\d+)?(?:-|$)/u.test(id)) {
    return GPT_52_REASONING_EFFORTS;
  }
  if (/^gpt-5\.1(?:-|$)/u.test(id)) {
    return GPT_51_REASONING_EFFORTS;
  }
  if (/^gpt-5(?:-|$)/u.test(id)) {
    return GPT_5_REASONING_EFFORTS;
  }
  return GENERIC_REASONING_EFFORTS;
}

/** 返回某模型是否接受请求的 reasoning effort。 */
export function supportsOpenAIReasoningEffort(
  model: OpenAIReasoningModel,
  effort: string,
): boolean {
  return resolveOpenAISupportedReasoningEfforts(model).includes(
    normalizeOpenAIReasoningEffort(effort) as OpenAIApiReasoningEffort,
  );
}

/** 将请求的 reasoning effort 解析为模型支持的最接近值。 */
export function resolveOpenAIReasoningEffortForModel(params: {
  model: OpenAIReasoningModel;
  effort: string;
  fallbackMap?: Record<string, string>;
}): OpenAIApiReasoningEffort | undefined {
  const requested = normalizeOpenAIReasoningEffort(params.effort);
  const mapped = params.fallbackMap?.[requested] ?? requested;
  const normalized = normalizeOpenAIReasoningEffort(mapped);
  const supported = resolveOpenAISupportedReasoningEfforts(params.model);
  if (supported.includes(normalized as OpenAIApiReasoningEffort)) {
    return normalized as OpenAIApiReasoningEffort;
  }
  if (isDisabledReasoningEffort(requested) || isDisabledReasoningEffort(normalized)) {
    return undefined;
  }
  if (requested === "minimal" && supported.includes("low")) {
    return "low";
  }
  if ((requested === "minimal" || requested === "low") && supported.includes("medium")) {
    return "medium";
  }
  if (requested === "xhigh" && supported.includes("high")) {
    return "high";
  }
  return supported.find((effort) => effort !== "none");
}
