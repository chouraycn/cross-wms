// 移植自 openclaw/src/gateway/server-methods/agents-config-mutations.ts

export type AgentDeleteMutationResult = unknown;

export class AgentConfigPreconditionError {
  constructor(...args: unknown[]) {
    // Stub: not fully ported
  }
}

export function isConfiguredAgent(...args: unknown[]): unknown {
  return false;
}

export async function createAgentConfigEntry(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function updateAgentConfigEntry(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function deleteAgentConfigEntry(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
