// 移植自 openclaw/src/gateway/server-methods/agents-config-mutations.ts

export type AgentDeleteMutationResult = unknown;

export class AgentConfigPreconditionError {
  constructor(...args: any[]) {
    // Stub: not fully ported
  }
}

export function isConfiguredAgent(...args: any[]): any {
  return false;
}

export async function createAgentConfigEntry(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function updateAgentConfigEntry(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function deleteAgentConfigEntry(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
