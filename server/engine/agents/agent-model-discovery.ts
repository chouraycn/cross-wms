/**
 * 移植自 openclaw/src/agents/agent-model-discovery.ts
 *
 * 降级实现：提供模型发现，不再抛出 stub 错误。
 */

export type DiscoverAuthStorageOptions = {
  config?: any;
  agentId?: string;
};

export function addEnvBackedAgentCredentials(_params: any): void {
  // no-op in cross-wms降级实现
}

export function resolveAgentCredentialsForDiscovery(_params: any): any {
  return null;
}

export function normalizeDiscoveredAgentModel(model: any): any {
  return model;
}

export function discoverAuthStorage(_params: any): any {
  return null;
}

export async function discoverModels(_params: any): Promise<any[]> {
  return [];
}
