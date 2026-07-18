/**
 * OpenAI-completions compatibility defaults.
 *
 * Provider transports use these helpers to derive OpenAI-compatible request
 * behavior from endpoint attribution without scattering provider-specific flags.
 *
 * 移植自 openclaw/src/agents/openai-completions-compat.ts。
 * 注意：原 openclaw 实现依赖：
 *   - ../llm/types.js 中的 Model 类型
 *   - ./provider-attribution.js 中的 ProviderEndpointClass、ProviderRequestCapabilities、resolveProviderRequestCapabilities
 * 本地降级实现：Model 用本地最小子集类型；
 *   provider-attribution 降级为本地实现，仅依据 provider/baseUrl 做最小路由分类。
 */

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

type ProviderRequestCapabilities = {
  provider: string;
  endpointClass: ProviderEndpointClass;
  knownProviderFamily: string;
  usesKnownNativeOpenAIRoute: boolean;
  usesConfiguredBaseUrl: boolean;
  usesExplicitProxyLikeEndpoint: boolean;
  supportsNativeStreamingUsageCompat: boolean;
  supportsOpenAICompletionsStreamingUsageCompat: boolean;
};

// 内联降级实现：当输入本身就是字符串时返回它，否则返回 undefined。
function readStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const LOCAL_ENDPOINT_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return suffix.startsWith(".") || suffix.startsWith("-")
    ? host.endsWith(suffix)
    : host === suffix || host.endsWith(`.${suffix}`);
}

function isLocalEndpointHost(host: string): boolean {
  return (
    LOCAL_ENDPOINT_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  );
}

function resolveBundledEndpointClass(baseUrl: unknown): ProviderEndpointClass {
  const trimmed = readStringValue(baseUrl)?.trim();
  if (!trimmed) {
    return "default";
  }
  let host: string | undefined;
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    try {
      host = new URL(`https://${trimmed}`).hostname.toLowerCase();
    } catch {
      return "invalid";
    }
  }
  if (!host) {
    return "invalid";
  }
  switch (host) {
    case "api.anthropic.com":
      return "anthropic-public";
    case "api.cerebras.ai":
      return "cerebras-native";
    case "llm.chutes.ai":
      return "chutes-native";
    case "api.deepseek.com":
      return "deepseek-native";
    case "api.groq.com":
      return "groq-native";
    case "api.mistral.ai":
      return "mistral-public";
    case "api.openai.com":
      return "openai-public";
    case "chatgpt.com":
      return "openai";
    case "generativelanguage.googleapis.com":
      return "google-generative-ai";
    case "aiplatform.googleapis.com":
      return "google-vertex";
    case "api.x.ai":
      return "xai-native";
    case "api.z.ai":
      return "zai-native";
  }
  if (hostMatchesSuffix(host, ".githubcopilot.com")) {
    return "github-copilot-native";
  }
  if (hostMatchesSuffix(host, ".openai.azure.com")) {
    return "azure-openai";
  }
  if (hostMatchesSuffix(host, "openrouter.ai")) {
    return "openrouter";
  }
  if (hostMatchesSuffix(host, "opencode.ai")) {
    return "opencode-native";
  }
  if (isLocalEndpointHost(host)) {
    return "local";
  }
  return "custom";
}

/**
 * 降级实现：根据 provider/api/baseUrl 做最小路由分类。
 *
 * 已知 provider family 与 endpoint class 的映射保留 openclaw 的核心逻辑，
 * 但移除了对 manifest 元数据的查询。
 */
function resolveProviderRequestCapabilities(params: {
  provider?: string | undefined;
  api?: string | undefined;
  baseUrl?: string | undefined;
  capability?: string;
  transport?: string;
  modelId?: string | undefined;
  compat?: unknown;
}): ProviderRequestCapabilities {
  const provider = (readStringValue(params.provider) ?? "").trim().toLowerCase();
  const endpointClass = resolveBundledEndpointClass(params.baseUrl);
  const usesConfiguredBaseUrl = endpointClass !== "default";
  const usesKnownNativeOpenAIEndpoint =
    endpointClass === "openai-public" ||
    endpointClass === "openai" ||
    endpointClass === "azure-openai";
  const usesKnownNativeOpenAIRoute =
    endpointClass === "default" ? provider === "openai" : usesKnownNativeOpenAIEndpoint;
  const usesExplicitProxyLikeEndpoint = usesConfiguredBaseUrl && !usesKnownNativeOpenAIEndpoint;
  const knownProviderFamily =
    provider === "openrouter" || endpointClass === "openrouter"
      ? "openrouter"
      : provider === "mistral" || endpointClass === "mistral-public"
        ? "mistral"
        : provider === "together"
          ? "together"
          : provider === "moonshot" || endpointClass === "moonshot-native"
            ? "moonshot"
            : provider === "modelstudio" ||
                endpointClass === "modelstudio-native" ||
                provider === "dashscope" ||
                provider === "qwen"
              ? "modelstudio"
              : "";
  return {
    provider,
    endpointClass,
    knownProviderFamily,
    usesKnownNativeOpenAIRoute,
    usesConfiguredBaseUrl,
    usesExplicitProxyLikeEndpoint,
    supportsNativeStreamingUsageCompat: false,
    supportsOpenAICompletionsStreamingUsageCompat: false,
  };
}

type OpenAICompletionsCompatDefaultsInput = {
  provider?: string;
  endpointClass: ProviderEndpointClass;
  knownProviderFamily: string;
  supportsNativeStreamingUsageCompat?: boolean;
  supportsOpenAICompletionsStreamingUsageCompat?: boolean;
  usesExplicitProxyLikeEndpoint?: boolean;
};

type OpenAICompletionsCompatDefaults = {
  supportsStore: boolean;
  supportsDeveloperRole: boolean;
  supportsReasoningEffort: boolean;
  supportsUsageInStreaming: boolean;
  maxTokensField: "max_completion_tokens" | "max_tokens";
  thinkingFormat: "openai" | "openrouter" | "deepseek" | "together" | "zai";
  visibleReasoningDetailTypes: string[];
  supportsStrictMode: boolean;
  requiresReasoningContentOnAssistantMessages: boolean;
  requiresNonEmptyUserOrAssistantMessage: boolean;
};

type DetectedOpenAICompletionsCompat = {
  capabilities: ProviderRequestCapabilities;
  defaults: OpenAICompletionsCompatDefaults;
};

function isDefaultRouteProvider(provider: string | undefined, ...ids: string[]) {
  return provider !== undefined && ids.includes(provider);
}

/** Resolves default request flags for an OpenAI-compatible completions endpoint. */
export function resolveOpenAICompletionsCompatDefaults(
  input: OpenAICompletionsCompatDefaultsInput,
): OpenAICompletionsCompatDefaults {
  const {
    provider,
    endpointClass,
    knownProviderFamily,
    supportsNativeStreamingUsageCompat = false,
    supportsOpenAICompletionsStreamingUsageCompat = false,
    usesExplicitProxyLikeEndpoint = false,
  } = input;
  const isDefaultRoute = endpointClass === "default";
  const usesConfiguredNonOpenAIEndpoint =
    endpointClass !== "default" && endpointClass !== "openai-public";
  const isMoonshotLike =
    knownProviderFamily === "moonshot" ||
    knownProviderFamily === "modelstudio" ||
    endpointClass === "moonshot-native" ||
    endpointClass === "modelstudio-native";
  const isModelStudioLike =
    knownProviderFamily === "modelstudio" ||
    endpointClass === "modelstudio-native" ||
    (isDefaultRoute && isDefaultRouteProvider(provider, "dashscope", "modelstudio", "qwen"));
  const isZai =
    endpointClass === "zai-native" ||
    (isDefaultRoute && isDefaultRouteProvider(input.provider, "zai"));
  const isDeepSeek =
    endpointClass === "deepseek-native" ||
    (isDefaultRoute && isDefaultRouteProvider(input.provider, "deepseek"));
  const isTogether =
    knownProviderFamily === "together" ||
    (isDefaultRoute && isDefaultRouteProvider(input.provider, "together"));
  const isXiaomi =
    endpointClass === "xiaomi-native" ||
    (isDefaultRoute && isDefaultRouteProvider(input.provider, "xiaomi"));
  const isNonStandard =
    endpointClass === "cerebras-native" ||
    endpointClass === "chutes-native" ||
    endpointClass === "deepseek-native" ||
    endpointClass === "mistral-public" ||
    endpointClass === "opencode-native" ||
    endpointClass === "xai-native" ||
    isXiaomi ||
    isZai ||
    (isDefaultRoute &&
      isDefaultRouteProvider(input.provider, "cerebras", "chutes", "deepseek", "opencode", "xai"));
  const isOpenRouterLike = input.provider === "openrouter" || endpointClass === "openrouter";
  const isLocalEndpoint = endpointClass === "local";
  const usesMaxTokens =
    endpointClass === "chutes-native" ||
    endpointClass === "mistral-public" ||
    knownProviderFamily === "mistral" ||
    isTogether ||
    (isDefaultRoute && isDefaultRouteProvider(provider, "chutes"));
  return {
    supportsStore:
      !isNonStandard && knownProviderFamily !== "mistral" && !usesExplicitProxyLikeEndpoint,
    supportsDeveloperRole: !isNonStandard && !isMoonshotLike && !usesConfiguredNonOpenAIEndpoint,
    supportsReasoningEffort:
      !isZai &&
      !isTogether &&
      knownProviderFamily !== "mistral" &&
      endpointClass !== "xai-native" &&
      !usesExplicitProxyLikeEndpoint,
    supportsUsageInStreaming:
      supportsOpenAICompletionsStreamingUsageCompat ||
      (!isNonStandard &&
        (isLocalEndpoint ||
          !usesConfiguredNonOpenAIEndpoint ||
          supportsNativeStreamingUsageCompat)),
    maxTokensField: usesMaxTokens ? "max_tokens" : "max_completion_tokens",
    thinkingFormat:
      isDeepSeek || isXiaomi
        ? "deepseek"
        : isZai
          ? "zai"
          : isTogether
            ? "together"
            : isOpenRouterLike
              ? "openrouter"
              : "openai",
    visibleReasoningDetailTypes: isOpenRouterLike ? ["response.output_text", "response.text"] : [],
    supportsStrictMode: !isZai && !usesConfiguredNonOpenAIEndpoint,
    requiresReasoningContentOnAssistantMessages: isDeepSeek || isXiaomi,
    requiresNonEmptyUserOrAssistantMessage: isModelStudioLike,
  };
}

function resolveOpenAICompletionsCompatDefaultsFromCapabilities(
  input: Pick<
    ProviderRequestCapabilities,
    | "endpointClass"
    | "knownProviderFamily"
    | "supportsNativeStreamingUsageCompat"
    | "supportsOpenAICompletionsStreamingUsageCompat"
    | "usesExplicitProxyLikeEndpoint"
  > & {
    provider?: string;
  },
): OpenAICompletionsCompatDefaults {
  return resolveOpenAICompletionsCompatDefaults(input);
}

/** 最小 Model 类型子集，仅包含 detectOpenAICompletionsCompat 所需字段。 */
type OpenAICompletionsCompatModel = {
  provider: string;
  baseUrl?: string;
  id: string;
  compat?: { supportsStore?: boolean } | null;
};

/** Detects endpoint capabilities and defaults for an OpenAI-completions model. */
export function detectOpenAICompletionsCompat(
  model: OpenAICompletionsCompatModel,
): DetectedOpenAICompletionsCompat {
  const capabilities = resolveProviderRequestCapabilities({
    provider: model.provider,
    api: "openai-completions",
    baseUrl: model.baseUrl,
    capability: "llm",
    transport: "stream",
    modelId: model.id,
    compat:
      model.compat && typeof model.compat === "object"
        ? (model.compat as { supportsStore?: boolean })
        : undefined,
  });
  return {
    capabilities,
    defaults: resolveOpenAICompletionsCompatDefaultsFromCapabilities({
      ...capabilities,
    }),
  };
}
