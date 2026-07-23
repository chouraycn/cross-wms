// 移植自 openclaw/src/plugins/runtime/runtime-llm.runtime.ts

export type RuntimeLlmAuthority = {
  caller?: { kind: string; id: string; name?: string };
  pluginIdForPolicy?: string;
  sessionKey?: string;
  agentId?: string;
  preferredProfile?: string;
  requiresBoundAgent?: boolean;
  allowAgentIdOverride?: boolean;
  allowModelOverride?: boolean;
  allowedModels?: readonly string[];
  allowComplete?: boolean;
  denyReason?: string;
};

export type CreateRuntimeLlmOptions = {
  getConfig?: () => unknown;
  authority?: RuntimeLlmAuthority;
  logger?: unknown;
};

export type RuntimeLlm = {
  complete: (request: unknown) => Promise<unknown>;
};

export function createRuntimeLlm(_options: CreateRuntimeLlmOptions): RuntimeLlm {
  return {
    complete: async () => undefined,
  };
}
