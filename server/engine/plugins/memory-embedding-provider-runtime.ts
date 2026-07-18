/**
 * Memory embedding provider runtime.
 * 移植自 openclaw/src/plugins/memory-embedding-provider-runtime.ts。
 * 降级策略：返回空/undefined。
 */

/** 占位：MemoryEmbeddingProviderAdapter。 */
type MemoryEmbeddingProviderAdapter = unknown;

/** 占位：OpenClawConfig。 */
type OpenClawConfig = unknown;

export function listRegisteredMemoryEmbeddingProviderAdapters(): MemoryEmbeddingProviderAdapter[] {
  return [];
}

export function listMemoryEmbeddingProviders(
  cfg?: OpenClawConfig,
): MemoryEmbeddingProviderAdapter[] {
  void cfg;
  return [];
}

export function getMemoryEmbeddingProvider(params: {
  providerId?: string;
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): MemoryEmbeddingProviderAdapter | undefined {
  void params;
  return undefined;
}

export { listRegisteredMemoryEmbeddingProviders } from "./memory-embedding-providers.js";
