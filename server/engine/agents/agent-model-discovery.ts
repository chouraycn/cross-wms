/**
 * 移植自 openclaw/src/agents/agent-model-discovery.ts
 *
 * 降级实现：提供模型发现，不再抛出 stub 错误。
 */

export type DiscoverAuthStorageOptions = {
  config?: unknown;
  agentId?: string;
};

export function addEnvBackedAgentCredentials(_params: unknown): void {
  // no-op in cross-wms降级实现
}

export function resolveAgentCredentialsForDiscovery(_params: unknown): unknown {
  return null;
}

export function normalizeDiscoveredAgentModel(model: unknown): unknown {
  return model;
}

export function discoverAuthStorage(_params: unknown): unknown {
  return null;
}

export async function discoverModels(_params: unknown): Promise<unknown[]> {
  return [];
}
