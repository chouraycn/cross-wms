// 移植自 openclaw/src/gateway/server-methods/agents-config-mutations.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type AgentDeleteMutationResult = unknown;

export class AgentConfigPreconditionError {
  constructor(...args: unknown[]) {
    throw new Error("not implemented: AgentConfigPreconditionError constructor");
  }
}

export function isConfiguredAgent(...args: unknown[]): unknown {
  throw new Error("not implemented: isConfiguredAgent");
}

export async function createAgentConfigEntry(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: createAgentConfigEntry");
}

export async function updateAgentConfigEntry(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: updateAgentConfigEntry");
}

export async function deleteAgentConfigEntry(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: deleteAgentConfigEntry");
}
