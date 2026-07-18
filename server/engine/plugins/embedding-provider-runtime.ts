/**
 * Embedding provider runtime.
 * 移植自 openclaw/src/plugins/embedding-provider-runtime.ts。
 * 降级策略：返回空/undefined。
 */
import type { EmbeddingProviderAdapter } from "./embedding-provider-types.js";

/** 占位：OpenClawConfig。 */
type OpenClawConfig = unknown;

export function listRegisteredEmbeddingProviderAdapters(): EmbeddingProviderAdapter[] {
  return [];
}

export function listEmbeddingProviders(cfg?: OpenClawConfig): EmbeddingProviderAdapter[] {
  void cfg;
  return [];
}

export function resolveConfiguredEmbeddingProviderId(params: {
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): string | undefined {
  void params;
  return undefined;
}

export function getEmbeddingProvider(params: {
  providerId?: string;
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): EmbeddingProviderAdapter | undefined {
  void params;
  return undefined;
}

export type { RegisteredEmbeddingProvider } from "./embedding-provider-types.js";

export { listRegisteredEmbeddingProviders } from "./embedding-providers.js";
