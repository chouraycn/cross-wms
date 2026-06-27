/**
 * Web Provider Plugin Types — Web 服务提供者插件类型定义
 *
 * 定义 Web Search 和 Web Fetch 两类 Provider 的插件接口、上下文、
 * 凭证解析以及运行时元数据等类型。
 */

// ==================== ID 类型 ====================

export type WebSearchProviderId = string;
export type WebFetchProviderId = string;

// ==================== 结果类型 ====================

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface WebSearchResultList {
  query: string;
  results: WebSearchResult[];
  count: number;
  provider: WebSearchProviderId;
}

export interface WebFetchResult {
  url: string;
  finalUrl: string;
  title?: string;
  contentType: string;
  content: string;
  contentLength: number;
  truncated: boolean;
  rendered: boolean;
  provider: WebFetchProviderId;
}

// ==================== 工具定义 ====================

export type WebSearchProviderToolExecuteFn = (
  args: Record<string, unknown>,
  context?: WebSearchProviderToolExecutionContext,
) => Promise<WebSearchResultList>;

export interface WebSearchProviderToolDefinition {
  description: string;
  parameters: Record<string, unknown>;
  execute: WebSearchProviderToolExecuteFn;
}

export type WebFetchProviderToolExecuteFn = (
  args: Record<string, unknown>,
  context?: WebFetchProviderToolExecutionContext,
) => Promise<WebFetchResult>;

export interface WebFetchProviderToolDefinition {
  description: string;
  parameters: Record<string, unknown>;
  execute: WebFetchProviderToolExecuteFn;
}

// ==================== 执行上下文 ====================

export interface WebSearchProviderToolExecutionContext {
  signal?: AbortSignal;
}

export interface WebFetchProviderToolExecutionContext {
  signal?: AbortSignal;
}

// ==================== Provider 上下文 ====================

export interface WebSearchProviderContext {
  searchConfig?: Record<string, unknown>;
  runtimeMetadata?: RuntimeWebSearchMetadata;
  agentDir?: string;
}

export interface WebFetchProviderContext {
  fetchConfig?: Record<string, unknown>;
  runtimeMetadata?: RuntimeWebFetchMetadata;
  agentDir?: string;
}

// ==================== 凭证解析 ====================

export type WebSearchCredentialResolutionSource = "config" | "secretRef" | "env" | "missing";
export type WebFetchCredentialResolutionSource = "config" | "secretRef" | "env" | "missing";

export interface WebSearchProviderConfiguredCredentialFallback {
  path: string;
  value: unknown;
}

export interface WebFetchProviderConfiguredCredentialFallback {
  path: string;
  value: unknown;
}

// ==================== 运行时元数据 ====================

export type RuntimeWebDiagnosticCode =
  | "WEB_SEARCH_PROVIDER_INVALID_AUTODETECT"
  | "WEB_SEARCH_AUTODETECT_SELECTED"
  | "WEB_SEARCH_KEY_UNRESOLVED_FALLBACK_USED"
  | "WEB_SEARCH_KEY_UNRESOLVED_NO_FALLBACK"
  | "WEB_FETCH_PROVIDER_INVALID_AUTODETECT"
  | "WEB_FETCH_AUTODETECT_SELECTED"
  | "WEB_FETCH_PROVIDER_KEY_UNRESOLVED_FALLBACK_USED"
  | "WEB_FETCH_PROVIDER_KEY_UNRESOLVED_NO_FALLBACK";

export interface RuntimeWebDiagnostic {
  code: RuntimeWebDiagnosticCode;
  message: string;
  path?: string;
}

export interface RuntimeWebSearchMetadata {
  providerConfigured?: string;
  providerSource: "configured" | "auto-detect" | "none";
  selectedProvider?: string;
  selectedProviderKeySource?: WebSearchCredentialResolutionSource;
  diagnostics: RuntimeWebDiagnostic[];
}

export interface RuntimeWebFetchMetadata {
  providerConfigured?: string;
  providerSource: "configured" | "auto-detect" | "none";
  selectedProvider?: string;
  selectedProviderKeySource?: WebFetchCredentialResolutionSource;
  diagnostics: RuntimeWebDiagnostic[];
}

export interface RuntimeWebToolsMetadata {
  search: RuntimeWebSearchMetadata;
  fetch: RuntimeWebFetchMetadata;
  diagnostics: RuntimeWebDiagnostic[];
}

// ==================== 运行时元数据上下文 ====================

export interface WebSearchRuntimeMetadataContext {
  searchConfig?: Record<string, unknown>;
  runtimeMetadata?: RuntimeWebSearchMetadata;
  resolvedCredential?: {
    value?: string;
    source: WebSearchCredentialResolutionSource;
    fallbackEnvVar?: string;
  };
}

export interface WebFetchRuntimeMetadataContext {
  fetchConfig?: Record<string, unknown>;
  runtimeMetadata?: RuntimeWebFetchMetadata;
  resolvedCredential?: {
    value?: string;
    source: WebFetchCredentialResolutionSource;
    fallbackEnvVar?: string;
  };
}

// ==================== 插件接口 ====================

export interface WebSearchProviderPlugin {
  id: WebSearchProviderId;
  label: string;
  hint: string;
  requiresCredential?: boolean;
  credentialLabel?: string;
  envVars: string[];
  authProviderId?: string;
  placeholder: string;
  signupUrl: string;
  docsUrl?: string;
  credentialNote?: string;
  autoDetectOrder?: number;
  credentialPath: string;
  inactiveSecretPaths?: string[];

  getCredentialValue: (searchConfig?: Record<string, unknown>) => unknown;
  setCredentialValue: (searchConfigTarget: Record<string, unknown>, value: unknown) => void;
  getConfiguredCredentialValue?: (config: Record<string, unknown>) => unknown;
  setConfiguredCredentialValue?: (configTarget: Record<string, unknown>, value: unknown) => void;
  getConfiguredCredentialFallback?: (
    config: Record<string, unknown>,
  ) => WebSearchProviderConfiguredCredentialFallback | undefined;
  applySelectionConfig?: (config: Record<string, unknown>) => Record<string, unknown>;

  resolveRuntimeMetadata?: (
    ctx: WebSearchRuntimeMetadataContext,
  ) => Partial<RuntimeWebSearchMetadata> | Promise<Partial<RuntimeWebSearchMetadata>>;

  createTool: (ctx: WebSearchProviderContext) => WebSearchProviderToolDefinition | null;
}

export interface PluginWebSearchProviderEntry extends WebSearchProviderPlugin {
  pluginId: string;
}

export interface WebFetchProviderPlugin {
  id: WebFetchProviderId;
  label: string;
  hint: string;
  requiresCredential?: boolean;
  credentialLabel?: string;
  envVars: string[];
  placeholder: string;
  signupUrl: string;
  docsUrl?: string;
  autoDetectOrder?: number;
  credentialPath: string;
  inactiveSecretPaths?: string[];

  getCredentialValue: (fetchConfig?: Record<string, unknown>) => unknown;
  setCredentialValue: (fetchConfigTarget: Record<string, unknown>, value: unknown) => void;
  getConfiguredCredentialValue?: (config: Record<string, unknown>) => unknown;
  setConfiguredCredentialValue?: (configTarget: Record<string, unknown>, value: unknown) => void;
  getConfiguredCredentialFallback?: (
    config: Record<string, unknown>,
  ) => WebFetchProviderConfiguredCredentialFallback | undefined;
  applySelectionConfig?: (config: Record<string, unknown>) => Record<string, unknown>;

  resolveRuntimeMetadata?: (
    ctx: WebFetchRuntimeMetadataContext,
  ) => Partial<RuntimeWebFetchMetadata> | Promise<Partial<RuntimeWebFetchMetadata>>;

  createTool: (ctx: WebFetchProviderContext) => WebFetchProviderToolDefinition | null;
}

export interface PluginWebFetchProviderEntry extends WebFetchProviderPlugin {
  pluginId: string;
}
