/**
 * Web provider types.
 * 移植自 openclaw/src/plugins/web-provider-types.ts。类型定义保留。
 */
export type WebSearchProviderId = string;
export type WebFetchProviderId = string;

export type WebSearchProviderToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type WebFetchProviderToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type WebSearchProviderContext = {
  providerId: WebSearchProviderId;
  query: string;
  maxResults?: number;
};

export type WebSearchProviderToolExecutionContext = WebSearchProviderContext & {
  signal?: AbortSignal;
};

export type WebFetchProviderContext = {
  providerId: WebFetchProviderId;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type WebSearchCredentialResolutionSource = "config" | "secretRef" | "env" | "missing";

export type WebSearchProviderConfiguredCredentialFallback = {
  source: WebSearchCredentialResolutionSource;
  credentialKey?: string;
};

export type WebFetchProviderConfiguredCredentialFallback = {
  source: WebSearchCredentialResolutionSource;
  credentialKey?: string;
};

export type WebSearchRuntimeMetadataContext = {
  providerId: WebSearchProviderId;
  env?: NodeJS.ProcessEnv;
  config?: unknown;
};

export type WebSearchProviderSetupContext = {
  providerId: WebSearchProviderId;
  env?: NodeJS.ProcessEnv;
};

export type WebFetchCredentialResolutionSource = "config" | "secretRef" | "env" | "missing";

export type WebFetchRuntimeMetadataContext = {
  providerId: WebFetchProviderId;
  env?: NodeJS.ProcessEnv;
  config?: unknown;
};

export type WebSearchProviderPlugin = {
  id: WebSearchProviderId;
  label?: string;
  search(ctx: WebSearchProviderToolExecutionContext): Promise<unknown>;
};

export type PluginWebSearchProviderEntry = WebSearchProviderPlugin & {
  pluginId: string;
};

export type WebFetchProviderPlugin = {
  id: WebFetchProviderId;
  label?: string;
  fetch(ctx: WebFetchProviderContext & { signal?: AbortSignal }): Promise<unknown>;
};

export type PluginWebFetchProviderEntry = WebFetchProviderPlugin & {
  pluginId: string;
};
