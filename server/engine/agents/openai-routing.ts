/**
 * 模型选择、auth profile 与 runtime setup 共享的 OpenAI provider 路由决策。
 *
 * 自定义 OpenAI 兼容 baseUrl 会显式绕过 Codex-runtime 默认值。
 *
 * 注意：原 openclaw 实现依赖：
 *   - @openclaw/model-catalog-core/provider-id 中的 normalizeProviderId
 *   - config/types.openclaw.js 中的 OpenClawConfig
 * 本地降级实现：normalizeProviderId 内联为 trim+lowercase；
 * OpenClawConfig 视为 unknown，仅做运行时字段访问。
 */

// OpenClawConfig 在本地未完整移植，这里以 unknown 降级处理。
type OpenClawConfig = unknown;

// 内联降级实现：trim + lower-case 的 provider 规范化。
function normalizeProviderId(provider: string): string {
  return typeof provider === "string" ? provider.trim().toLowerCase() : "";
}

/** OpenAI 托管模型路由的规范 provider id。 */
export const OPENAI_PROVIDER_ID = "openai";
export const OPENAI_CODEX_PROVIDER_ID = OPENAI_PROVIDER_ID;

// OpenAI 仅对官方 API 端点默认使用 Codex runtime。自定义 baseUrl 保留其已配置的 provider 行为。
function isOfficialOpenAIBaseUrl(baseUrl: unknown): boolean {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return true;
  }
  try {
    const url = new URL(baseUrl.trim());
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "api.openai.com" &&
      (url.pathname === "" ||
        url.pathname === "/" ||
        url.pathname === "/v1" ||
        url.pathname === "/v1/")
    );
  } catch {
    return false;
  }
}

function resolveOpenAIProviderConfig(config: OpenClawConfig | undefined) {
  if (!config || typeof config !== "object") {
    return undefined;
  }
  const providers = (config as { models?: { providers?: Record<string, unknown> } }).models
    ?.providers;
  if (!providers) {
    return undefined;
  }
  const direct = providers.openai;
  if (direct) {
    return direct;
  }
  for (const [providerId, providerConfig] of Object.entries(providers)) {
    if (normalizeProviderId(providerId) === OPENAI_PROVIDER_ID) {
      return providerConfig;
    }
  }
  return undefined;
}

function openAIProviderUsesCustomBaseUrl(config: OpenClawConfig | undefined): boolean {
  const providerConfig = resolveOpenAIProviderConfig(config);
  const baseUrl = (providerConfig as { baseUrl?: unknown } | undefined)?.baseUrl;
  return !isOfficialOpenAIBaseUrl(baseUrl);
}

/** 返回是否为规范化后等于 OpenAI 的 provider id。 */
export function isOpenAIProvider(provider: string | undefined): boolean {
  const normalized = normalizeProviderId(provider ?? "");
  return normalized === OPENAI_PROVIDER_ID;
}

/** 返回此配置下 OpenAI 是否应使用 Codex runtime 默认值。 */
export function openAIProviderUsesCodexRuntimeByDefault(params: {
  provider?: string;
  config?: OpenClawConfig;
}): boolean {
  return isOpenAIProvider(params.provider) && !openAIProviderUsesCustomBaseUrl(params.config);
}

/** 从 provider/model ref 解析 provider 部分。 */
export function parseModelRefProvider(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const slashIndex = value.trim().indexOf("/");
  if (slashIndex <= 0) {
    return undefined;
  }
  return normalizeProviderId(value.trim().slice(0, slashIndex));
}

/** 返回选中的模型配置是否应确保 Codex 插件存在。 */
export function modelSelectionShouldEnsureCodexPlugin(params: {
  model?: string;
  config?: OpenClawConfig;
}): boolean {
  const provider = parseModelRefProvider(params.model);
  return provider === OPENAI_PROVIDER_ID && !openAIProviderUsesCustomBaseUrl(params.config);
}

/** 列出 OpenAI runtime 路由的 auth-profile provider。 */
export function listOpenAIAuthProfileProvidersForAgentRuntime(params: {
  provider: string;
  harnessRuntime?: string;
  agentHarnessId?: string;
  config?: OpenClawConfig;
}): string[] {
  if (!isOpenAIProvider(params.provider)) {
    return [params.provider];
  }
  return [OPENAI_PROVIDER_ID];
}

/** 解析传入 OpenAI runtime auth/执行路径的 provider id。 */
export function resolveOpenAIRuntimeProvider(params: {
  provider: string;
  harnessRuntime?: string;
  agentHarnessId?: string;
  authProfileProvider?: string;
  authProfileId?: string;
  config?: OpenClawConfig;
  workspaceDir?: string;
}): string {
  return isOpenAIProvider(params.provider) ? OPENAI_PROVIDER_ID : params.provider;
}

/** 解析 OpenAI runtime 路由展示的已选中 provider id。 */
export function resolveSelectedOpenAIRuntimeProvider(params: {
  provider: string;
  harnessRuntime?: string;
  agentHarnessId?: string;
  authProfileProvider?: string;
  authProfileId?: string;
  config?: OpenClawConfig;
  workspaceDir?: string;
}): string {
  return isOpenAIProvider(params.provider) ? OPENAI_PROVIDER_ID : params.provider;
}

/** 解析用于 context-window 查询的 config provider。 */
export function resolveContextConfigProviderForRuntime(params: {
  provider: string;
  runtimeId?: string;
  config?: OpenClawConfig;
}): string {
  return isOpenAIProvider(params.provider) ? OPENAI_PROVIDER_ID : params.provider;
}
