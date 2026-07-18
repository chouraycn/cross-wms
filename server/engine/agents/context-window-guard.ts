/**
 * Resolves effective model context windows and formats guard warnings/blocks.
 *
 * Configured model values can cap provider metadata, and local endpoints get
 * more actionable remediation text.
 *
 * 移植自 openclaw/src/agents/context-window-guard.ts。
 * 降级策略：
 *   - `findNormalizedProviderValue` 来自 @openclaw/model-catalog-core/provider-id，
 *     本地降级为基于 normalizeProviderId 的最小实现。
 *   - `resolveProviderEndpoint` 来自 ./provider-attribution.js（cross-wms 未实现），
 *     本地降级为基于 baseUrl host 的最小分类。
 *   - `OpenClawConfig` 用本地最小子集类型 `OpenClawConfigLike`。
 */

import { normalizeProviderId } from "../models/model-selection.js";

export const CONTEXT_WINDOW_HARD_MIN_TOKENS = 4_000;
const CONTEXT_WINDOW_WARN_BELOW_TOKENS = 8_000;
const CONTEXT_WINDOW_HARD_MIN_RATIO = 0.1;
const CONTEXT_WINDOW_WARN_BELOW_RATIO = 0.2;

type ProviderEndpointClass =
  | "default"
  | "anthropic-public"
  | "cerebras-native"
  | "chutes-native"
  | "deepseek-native"
  | "github-copilot-native"
  | "groq-native"
  | "mistral-public"
  | "moonshot-native"
  | "modelstudio-native"
  | "nvidia-native"
  | "openai-public"
  | "openai"
  | "opencode-native"
  | "azure-openai"
  | "openrouter"
  | "xai-native"
  | "xiaomi-native"
  | "zai-native"
  | "google-generative-ai"
  | "google-vertex"
  | "local"
  | "custom"
  | "invalid";

type ProviderEndpoint = {
  endpointClass: ProviderEndpointClass;
};

type ContextWindowSource = "model" | "modelsConfig" | "agentContextTokens" | "default";

export type ContextWindowInfo = {
  tokens: number;
  referenceTokens?: number;
  source: ContextWindowSource;
};

/**
 * 本地降级类型：仅保留 context-window-guard 关心的字段。
 * 对应 openclaw 的 OpenClawConfig 的最小子集。
 */
type OpenClawConfigLike = {
  models?: {
    providers?: Record<
      string,
      { models?: Array<{ id?: string; contextTokens?: number; contextWindow?: number }> } | undefined
    > | undefined;
  } | undefined;
  agents?: {
    defaults?: {
      contextTokens?: number;
    } | undefined;
  } | undefined;
};

function normalizePositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const int = Math.floor(value);
  return int > 0 ? int : null;
}

/**
 * 降级实现：基于 normalizeProviderId 在 providers 字典中查找匹配的键对应的值。
 * 对应 openclaw 的 findNormalizedProviderValue。
 */
function findNormalizedProviderValue<T>(
  providers: Record<string, T | undefined> | undefined,
  provider: string,
): T | undefined {
  if (!providers) {
    return undefined;
  }
  const normalizedTarget = normalizeProviderId(provider);
  if (!normalizedTarget) {
    return undefined;
  }
  // 先尝试精确键
  for (const [key, value] of Object.entries(providers)) {
    if (key === provider && value !== undefined) {
      return value;
    }
  }
  // 再尝试归一化匹配
  for (const [key, value] of Object.entries(providers)) {
    if (normalizeProviderId(key) === normalizedTarget && value !== undefined) {
      return value;
    }
  }
  return undefined;
}

const LOCAL_ENDPOINT_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLocalEndpointHost(host: string): boolean {
  return (
    LOCAL_ENDPOINT_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  );
}

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return suffix.startsWith(".") || suffix.startsWith("-")
    ? host.endsWith(suffix)
    : host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * 降级实现：基于 baseUrl host 做最小 endpoint 分类。
 * 对应 openclaw 的 resolveProviderEndpoint。
 */
function resolveProviderEndpoint(baseUrl: string | undefined): ProviderEndpoint {
  const trimmed = typeof baseUrl === "string" ? baseUrl.trim() : "";
  if (!trimmed) {
    return { endpointClass: "default" };
  }
  let host: string | undefined;
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    try {
      host = new URL(`https://${trimmed}`).hostname.toLowerCase();
    } catch {
      return { endpointClass: "invalid" };
    }
  }
  if (!host) {
    return { endpointClass: "invalid" };
  }
  switch (host) {
    case "api.anthropic.com":
      return { endpointClass: "anthropic-public" };
    case "api.cerebras.ai":
      return { endpointClass: "cerebras-native" };
    case "llm.chutes.ai":
      return { endpointClass: "chutes-native" };
    case "api.deepseek.com":
      return { endpointClass: "deepseek-native" };
    case "api.groq.com":
      return { endpointClass: "groq-native" };
    case "api.mistral.ai":
      return { endpointClass: "mistral-public" };
    case "api.openai.com":
      return { endpointClass: "openai-public" };
    case "chatgpt.com":
      return { endpointClass: "openai" };
    case "generativelanguage.googleapis.com":
      return { endpointClass: "google-generative-ai" };
    case "aiplatform.googleapis.com":
      return { endpointClass: "google-vertex" };
    case "api.x.ai":
      return { endpointClass: "xai-native" };
    case "api.z.ai":
      return { endpointClass: "zai-native" };
  }
  if (hostMatchesSuffix(host, ".githubcopilot.com")) {
    return { endpointClass: "github-copilot-native" };
  }
  if (hostMatchesSuffix(host, ".openai.azure.com")) {
    return { endpointClass: "azure-openai" };
  }
  if (hostMatchesSuffix(host, "openrouter.ai")) {
    return { endpointClass: "openrouter" };
  }
  if (hostMatchesSuffix(host, "opencode.ai")) {
    return { endpointClass: "opencode-native" };
  }
  if (isLocalEndpointHost(host)) {
    return { endpointClass: "local" };
  }
  return { endpointClass: "custom" };
}

function modelIdMatchesProviderScope(params: {
  configuredId?: string;
  provider: string;
  modelId: string;
}): boolean {
  const configuredId = params.configuredId?.trim();
  if (!configuredId) {
    return false;
  }
  if (configuredId === params.modelId) {
    return true;
  }
  const providerPrefix = params.provider ? `${params.provider}/` : "";
  if (!providerPrefix) {
    return false;
  }
  const stripProvider = (id: string) =>
    id.startsWith(providerPrefix) ? id.slice(providerPrefix.length) : id;
  return stripProvider(configuredId) === stripProvider(params.modelId);
}

/** Resolve the effective context window and source for one provider/model. */
export function resolveContextWindowInfo(params: {
  cfg: OpenClawConfigLike | undefined;
  provider: string;
  modelId: string;
  modelContextTokens?: number;
  modelContextWindow?: number;
  defaultTokens: number;
}): ContextWindowInfo {
  const fromModelsConfig = (() => {
    const providers = params.cfg?.models?.providers;
    const providerEntry = findNormalizedProviderValue(providers, params.provider);
    const models = Array.isArray(providerEntry?.models) ? providerEntry!.models! : [];
    const match = models.find((model) =>
      modelIdMatchesProviderScope({
        configuredId: model?.id,
        provider: params.provider,
        modelId: params.modelId,
      }),
    );
    return normalizePositiveInt(match?.contextTokens) ?? normalizePositiveInt(match?.contextWindow);
  })();
  const fromModel =
    normalizePositiveInt(params.modelContextTokens) ??
    normalizePositiveInt(params.modelContextWindow);
  const defaultTokens =
    normalizePositiveInt(params.defaultTokens) ?? CONTEXT_WINDOW_WARN_BELOW_TOKENS;
  const baseInfo = fromModelsConfig
    ? { tokens: fromModelsConfig, source: "modelsConfig" as const }
    : fromModel
      ? { tokens: fromModel, source: "model" as const }
      : { tokens: defaultTokens, source: "default" as const };

  const capTokens = normalizePositiveInt(params.cfg?.agents?.defaults?.contextTokens);
  if (capTokens && capTokens < baseInfo.tokens) {
    // Agent defaults can intentionally cap a larger model context window.
    return { tokens: capTokens, referenceTokens: baseInfo.tokens, source: "agentContextTokens" };
  }

  return baseInfo;
}

type ContextWindowGuardResult = ContextWindowInfo & {
  hardMinTokens: number;
  warnBelowTokens: number;
  shouldWarn: boolean;
  shouldBlock: boolean;
};

type ContextWindowGuardThresholds = {
  hardMinTokens: number;
  warnBelowTokens: number;
};

type ContextWindowGuardHint = {
  endpointClass: ProviderEndpointClass;
  likelySelfHosted: boolean;
};

function resolveContextWindowGuardHint(params: {
  runtimeBaseUrl?: string | null;
}): ContextWindowGuardHint {
  const endpoint = resolveProviderEndpoint(params.runtimeBaseUrl ?? undefined);
  return {
    endpointClass: endpoint.endpointClass,
    likelySelfHosted: endpoint.endpointClass === "local",
  };
}

/** Derive warning/block floors from the resolved model context window. */
function resolveContextWindowGuardThresholds(
  contextWindowTokens: number,
): ContextWindowGuardThresholds {
  const tokens = normalizePositiveInt(contextWindowTokens) ?? 0;
  return {
    hardMinTokens: Math.max(
      CONTEXT_WINDOW_HARD_MIN_TOKENS,
      Math.floor(tokens * CONTEXT_WINDOW_HARD_MIN_RATIO),
    ),
    warnBelowTokens: Math.max(
      CONTEXT_WINDOW_WARN_BELOW_TOKENS,
      Math.floor(tokens * CONTEXT_WINDOW_WARN_BELOW_RATIO),
    ),
  };
}

/** Format a non-blocking low-context warning message. */
export function formatContextWindowWarningMessage(params: {
  provider: string;
  modelId: string;
  guard: ContextWindowGuardResult;
  runtimeBaseUrl?: string | null;
}): string {
  const base = `low context window: ${params.provider}/${params.modelId} ctx=${params.guard.tokens} (warn<${params.guard.warnBelowTokens}) source=${params.guard.source}`;
  const hint = resolveContextWindowGuardHint({ runtimeBaseUrl: params.runtimeBaseUrl });
  if (!hint.likelySelfHosted) {
    return base;
  }
  if (params.guard.source === "agentContextTokens") {
    return (
      `${base}; OpenClaw is capped by agents.defaults.contextTokens, so raise that cap ` +
      `if you want to use more of the model context window`
    );
  }
  if (params.guard.source === "modelsConfig") {
    return (
      `${base}; OpenClaw is using the configured model context limit for this model, ` +
      `so raise contextWindow/contextTokens if it is set too low`
    );
  }
  return (
    `${base}; local/self-hosted runs work best at ` +
    `${params.guard.warnBelowTokens}+ tokens and may show weaker tool use or more compaction until the server/model context limit is raised`
  );
}

/** Format a blocking context-window guard message. */
export function formatContextWindowBlockMessage(params: {
  guard: ContextWindowGuardResult;
  runtimeBaseUrl?: string | null;
}): string {
  const base =
    `Model context window too small (${params.guard.tokens} tokens; ` +
    `source=${params.guard.source}). Minimum is ${params.guard.hardMinTokens}.`;
  const hint = resolveContextWindowGuardHint({ runtimeBaseUrl: params.runtimeBaseUrl });
  if (!hint.likelySelfHosted) {
    return base;
  }
  if (params.guard.source === "agentContextTokens") {
    return `${base} OpenClaw is capped by agents.defaults.contextTokens. Raise that cap.`;
  }
  if (params.guard.source === "modelsConfig") {
    return (
      `${base} OpenClaw is using the configured model context limit for this model. ` +
      `Raise contextWindow/contextTokens or choose a larger model.`
    );
  }
  return (
    `${base} This looks like a local model endpoint. ` +
    `Raise the server/model context limit or choose a larger model. ` +
    `OpenClaw local/self-hosted runs work best at ${params.guard.warnBelowTokens}+ tokens.`
  );
}

/** Evaluate whether the resolved context window should warn or block. */
export function evaluateContextWindowGuard(params: {
  info: ContextWindowInfo;
  warnBelowTokens?: number;
  hardMinTokens?: number;
}): ContextWindowGuardResult {
  const normalizedTokens = normalizePositiveInt(params.info.tokens);
  const tokens = normalizedTokens ?? 0;
  const referenceTokens = normalizePositiveInt(params.info.referenceTokens) ?? tokens;
  const resolvedThresholds = resolveContextWindowGuardThresholds(referenceTokens);
  const warnBelow = Math.max(
    1,
    Math.floor(params.warnBelowTokens ?? resolvedThresholds.warnBelowTokens),
  );
  const defaultHardMin = Math.min(
    resolvedThresholds.hardMinTokens,
    Math.max(tokens, CONTEXT_WINDOW_HARD_MIN_TOKENS),
  );
  const hardMin = Math.max(1, Math.floor(params.hardMinTokens ?? defaultHardMin));
  return {
    ...params.info,
    tokens,
    hardMinTokens: hardMin,
    warnBelowTokens: warnBelow,
    shouldWarn: !normalizedTokens || tokens < warnBelow,
    shouldBlock: !normalizedTokens || tokens < hardMin,
  };
}

export type { ContextWindowGuardResult, OpenClawConfigLike };
