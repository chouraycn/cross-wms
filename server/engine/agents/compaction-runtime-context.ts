/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/compaction-runtime-context.ts
 *
 * Builds runtime context for context-engine backed embedded compaction.
 * In cross-wms the full model selection/routing infrastructure is not available,
 * so both functions return simplified defaults.
 */

/** Resolve the effective compaction target (simplified in cross-wms). */
export function resolveEmbeddedCompactionTarget(params: {
  provider?: string | null;
  modelId?: string | null;
  defaultProvider?: string;
  defaultModel?: string;
}): {
  provider: string | undefined;
  model: string | undefined;
  authProfileId: string | undefined;
} {
  const provider = params.provider?.trim() || params.defaultProvider;
  const model = params.modelId?.trim() || params.defaultModel;
  return {
    provider,
    model,
    authProfileId: undefined,
  };
}

/** Build embedded compaction runtime context (simplified in cross-wms). */
export function buildEmbeddedCompactionRuntimeContext(params: {
  sessionKey?: string | null;
  workspaceDir: string;
  agentDir: string;
  provider?: string | null;
  modelId?: string | null;
  defaultProvider?: string;
  defaultModel?: string;
}): {
  sessionKey: string | undefined;
  workspaceDir: string;
  agentDir: string;
  provider: string | undefined;
  model: string | undefined;
  authProfileId: string | undefined;
} {
  const resolved = resolveEmbeddedCompactionTarget({
    provider: params.provider,
    modelId: params.modelId,
    defaultProvider: params.defaultProvider,
    defaultModel: params.defaultModel,
  });
  return {
    sessionKey: params.sessionKey ?? undefined,
    workspaceDir: params.workspaceDir,
    agentDir: params.agentDir,
    provider: resolved.provider,
    model: resolved.model,
    authProfileId: resolved.authProfileId,
  };
}
