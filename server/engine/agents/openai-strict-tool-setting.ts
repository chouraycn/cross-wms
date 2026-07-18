/**
 * Strict tool-schema default resolution for native OpenAI-compatible routes.
 *
 * Compatible providers can support strict schemas without inheriting OpenAI's required default.
 *
 * 移植自 openclaw/src/agents/openai-strict-tool-setting.ts。
 * 注意：原 openclaw 实现依赖：
 *   - @openclaw/normalization-core/string-coerce 中的 readStringValue
 *   - ./provider-attribution.js 中的 resolveProviderRequestCapabilities
 * 本地降级实现：readStringValue 内联；
 *   resolveProviderRequestCapabilities 降级为本地实现，仅依据 provider/api/baseUrl
 *   做最小路由分类，足以支持 strict-tool 决策。
 */

// 内联降级实现：当输入本身就是字符串时返回它，否则返回 undefined。
function readStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

type ProviderEndpointClass =
  | "default"
  | "openai-public"
  | "openai"
  | "azure-openai"
  | "local"
  | "custom";

type ProviderRequestCapabilities = {
  provider: string;
  endpointClass: ProviderEndpointClass;
  usesKnownNativeOpenAIRoute: boolean;
};

/**
 * 降级实现：根据 provider/api/baseUrl 做最小路由分类。
 *
 * 仅判断 OpenAI 官方路由（api.openai.com、chatgpt.com、azure-openai），
 * 其余情况返回 default 或 custom。
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
  const baseUrl = readStringValue(params.baseUrl)?.trim();
  let endpointClass: ProviderEndpointClass = "default";
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      const host = url.hostname.toLowerCase();
      if (host === "api.openai.com") {
        endpointClass = "openai-public";
      } else if (host === "chatgpt.com") {
        endpointClass = "openai";
      } else if (host.endsWith(".openai.azure.com")) {
        endpointClass = "azure-openai";
      } else if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host.endsWith(".localhost") ||
        host.endsWith(".local")
      ) {
        endpointClass = "local";
      } else {
        endpointClass = "custom";
      }
    } catch {
      endpointClass = "custom";
    }
  }
  const usesKnownNativeOpenAIEndpoint =
    endpointClass === "openai-public" ||
    endpointClass === "openai" ||
    endpointClass === "azure-openai";
  const usesKnownNativeOpenAIRoute =
    endpointClass === "default" ? provider === "openai" : usesKnownNativeOpenAIEndpoint;
  return {
    provider,
    endpointClass,
    usesKnownNativeOpenAIRoute,
  };
}

// Resolves OpenAI strict-tool schema defaults. Native OpenAI routes require
// strict=true, while compatible providers that merely support strict mode get
// false so callers can opt in without forcing provider-specific behavior.
type OpenAITransportKind = "stream" | "websocket";

type OpenAIStrictToolModel = {
  provider?: unknown;
  api?: unknown;
  baseUrl?: unknown;
  id?: unknown;
  compat?: unknown;
};

const optionalString = readStringValue;

function resolvesToNativeOpenAIStrictTools(
  model: OpenAIStrictToolModel,
  transport: OpenAITransportKind,
): boolean {
  const capabilities = resolveProviderRequestCapabilities({
    provider: optionalString(model.provider),
    api: optionalString(model.api),
    baseUrl: optionalString(model.baseUrl),
    capability: "llm",
    transport,
    modelId: optionalString(model.id),
    compat: model.compat,
  });
  if (!capabilities.usesKnownNativeOpenAIRoute) {
    return false;
  }
  return (
    capabilities.provider === "openai" ||
    capabilities.provider === "azure-openai" ||
    capabilities.provider === "azure-openai-responses"
  );
}

/** Resolve the strict-tool setting for one OpenAI-compatible model/transport. */
export function resolveOpenAIStrictToolSetting(
  model: OpenAIStrictToolModel,
  options?: { transport?: OpenAITransportKind; supportsStrictMode?: boolean },
): boolean | undefined {
  if (resolvesToNativeOpenAIStrictTools(model, options?.transport ?? "stream")) {
    return true;
  }
  if (options?.supportsStrictMode) {
    return false;
  }
  return undefined;
}
