/**
 * 移植自 openclaw/src/agents/codex-native-web-search-core.ts
 *
 * Activates and injects OpenAI/Codex native web-search tools when config,
 * model API, and auth state allow it.
 * cross-wms 简化实现：提供基本的 Codex 原生搜索激活和注入逻辑。
 */

type CodexNativeSearchMode = "auto" | "live" | "off";

type CodexNativeSearchActivation = {
  globalWebSearchEnabled: boolean;
  codexNativeEnabled: boolean;
  codexMode: CodexNativeSearchMode;
  nativeEligible: boolean;
  hasRequiredAuth: boolean;
  state: "managed_only" | "native_active";
  inactiveReason?:
    | "globally_disabled"
    | "codex_not_enabled"
    | "model_not_eligible"
    | "codex_auth_missing"
    | "tool_policy_denied";
};

type CodexNativeSearchPayloadPatchResult = {
  status: "payload_not_object" | "native_tool_already_present" | "injected";
};

function resolveCodexNativeWebSearchConfig(config?: any): {
  enabled: boolean;
  mode: CodexNativeSearchMode;
  allowedDomains?: string[];
  contextSize?: string;
  userLocation?: Record<string, any>;
} {
  const cfg = config as Record<string, any> | undefined;
  const codexConfig = cfg?.codex as Record<string, any> | undefined;
  const webSearch = codexConfig?.webSearch as Record<string, any> | undefined;
  return {
    enabled: webSearch?.enabled !== false,
    mode: (webSearch?.mode as CodexNativeSearchMode) ?? "auto",
    allowedDomains: Array.isArray(webSearch?.allowedDomains) ? webSearch.allowedDomains as string[] : undefined,
    contextSize: typeof webSearch?.contextSize === "string" ? webSearch.contextSize : undefined,
    userLocation: webSearch?.userLocation && typeof webSearch.userLocation === "object" ? webSearch.userLocation as Record<string, any> : undefined,
  };
}

function isRecord(value: any): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const OPENAI_AUTH_PROVIDER_IDS = ["openai"] as const;

function isOpenAIAuthProviderId(provider: string | undefined): boolean {
  return OPENAI_AUTH_PROVIDER_IDS.some((candidate) => candidate === provider);
}

/** Returns whether a model API can accept the native Codex web_search tool. */
export function isCodexNativeSearchEligibleModel(params: {
  modelProvider?: string;
  modelApi?: string;
}): boolean {
  return params.modelApi === "openai-chatgpt-responses";
}

/** Checks whether OpenAI/Codex auth is available for native web search. */
export function hasAvailableCodexAuth(params: {
  config?: any;
  agentDir?: string;
}): boolean {
  const cfg = params.config as Record<string, any> | undefined;
  const auth = cfg?.auth as Record<string, any> | undefined;
  const profiles = auth?.profiles as Record<string, any> | undefined;
  if (profiles) {
    for (const profile of Object.values(profiles)) {
      if (
        isRecord(profile) &&
        isOpenAIAuthProviderId(profile.provider as string) &&
        (profile.mode === "oauth" || profile.mode === "token")
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Resolves whether native search is active or why managed search should remain. */
export function resolveCodexNativeSearchActivation(params: {
  config?: any;
  modelProvider?: string;
  modelApi?: string;
  modelId?: string;
  agentId?: string;
  sessionKey?: string;
  sandboxToolPolicy?: any;
  messageProvider?: string;
  agentAccountId?: string | null;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  spawnedBy?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
  agentDir?: string;
}): CodexNativeSearchActivation {
  const cfg = params.config as Record<string, any> | undefined;
  const tools = cfg?.tools as Record<string, any> | undefined;
  const web = tools?.web as Record<string, any> | undefined;
  const search = web?.search as Record<string, any> | undefined;
  const globalWebSearchEnabled = search?.enabled !== false;
  const codexConfig = resolveCodexNativeWebSearchConfig(params.config);
  const nativeEligible = isCodexNativeSearchEligibleModel(params);
  const hasRequiredAuth =
    params.modelApi !== "openai-chatgpt-responses" ||
    !isOpenAIAuthProviderId(params.modelProvider) ||
    hasAvailableCodexAuth(params);

  if (!globalWebSearchEnabled) {
    return {
      globalWebSearchEnabled,
      codexNativeEnabled: codexConfig.enabled,
      codexMode: codexConfig.mode,
      nativeEligible,
      hasRequiredAuth,
      state: "managed_only",
      inactiveReason: "globally_disabled",
    };
  }
  if (!codexConfig.enabled) {
    return {
      globalWebSearchEnabled,
      codexNativeEnabled: false,
      codexMode: codexConfig.mode,
      nativeEligible,
      hasRequiredAuth,
      state: "managed_only",
      inactiveReason: "codex_not_enabled",
    };
  }
  if (!nativeEligible) {
    return {
      globalWebSearchEnabled,
      codexNativeEnabled: true,
      codexMode: codexConfig.mode,
      nativeEligible: false,
      hasRequiredAuth,
      state: "managed_only",
      inactiveReason: "model_not_eligible",
    };
  }
  if (!hasRequiredAuth) {
    return {
      globalWebSearchEnabled,
      codexNativeEnabled: true,
      codexMode: codexConfig.mode,
      nativeEligible: true,
      hasRequiredAuth: false,
      state: "managed_only",
      inactiveReason: "codex_auth_missing",
    };
  }
  return {
    globalWebSearchEnabled,
    codexNativeEnabled: true,
    codexMode: codexConfig.mode,
    nativeEligible: true,
    hasRequiredAuth: true,
    state: "native_active",
  };
}

/** Builds the OpenAI Responses `web_search` tool payload from config. */
export function buildCodexNativeWebSearchTool(
  config: any,
): Record<string, any> {
  const nativeConfig = resolveCodexNativeWebSearchConfig(config);
  const tool: Record<string, any> = {
    type: "web_search",
    external_web_access: nativeConfig.mode === "live",
  };
  if (nativeConfig.allowedDomains) {
    tool.filters = { allowed_domains: nativeConfig.allowedDomains };
  }
  if (nativeConfig.contextSize) {
    tool.search_context_size = nativeConfig.contextSize;
  }
  if (nativeConfig.userLocation) {
    tool.user_location = { type: "approximate", ...nativeConfig.userLocation };
  }
  return tool;
}

function hasCodexNativeWebSearchTool(tools: any): boolean {
  if (!Array.isArray(tools)) {
    return false;
  }
  return tools.some(
    (tool) => isRecord(tool) && typeof tool.type === "string" && tool.type === "web_search",
  );
}

/** Injects a native Codex web-search tool into a mutable provider payload. */
export function patchCodexNativeWebSearchPayload(params: {
  payload: any;
  config?: any;
}): CodexNativeSearchPayloadPatchResult {
  if (!isRecord(params.payload)) {
    return { status: "payload_not_object" };
  }
  const payload = params.payload;
  if (hasCodexNativeWebSearchTool(payload.tools)) {
    return { status: "native_tool_already_present" };
  }
  const tools = Array.isArray(payload.tools) ? [...payload.tools] : [];
  tools.push(buildCodexNativeWebSearchTool(params.config));
  payload.tools = tools;
  return { status: "injected" };
}

/** Returns whether the managed OpenClaw web-search tool should be hidden. */
export function shouldSuppressManagedWebSearchTool(params: {
  config?: any;
  modelProvider?: string;
  modelApi?: string;
  modelId?: string;
  agentId?: string;
  sessionKey?: string;
  sandboxToolPolicy?: any;
  messageProvider?: string;
  agentAccountId?: string | null;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  spawnedBy?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
  agentDir?: string;
}): boolean {
  return resolveCodexNativeSearchActivation(params).state === "native_active";
}

/** Parameters for evaluating native web search against a sandbox tool policy. */
export type NativeWebSearchToolPolicyParams = {
  config?: any;
  sandboxToolPolicy?: any;
  modelProvider?: string;
  modelApi?: string;
  modelId?: string;
  agentId?: string;
};

/** Stub: native web search is never allowed by tool policy in cross-wms. */
export function isNativeWebSearchAllowedByToolPolicy(_params: NativeWebSearchToolPolicyParams): boolean {
  return false;
}
