// @ts-nocheck
// Host backend config types for memory hosts.
// The package implementation may own schema/default details;
// core imports through this stable barrel path.

export type MemoryHostBackendConfig = {
  provider: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
  embeddingModel?: string;
  dimensions?: number;
};

export function resolveMemoryHostBackendConfig(config: Partial<MemoryHostBackendConfig>): MemoryHostBackendConfig {
  return {
    provider: "default",
    ...config,
  };
}
