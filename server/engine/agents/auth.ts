/**
 * 移植自 openclaw/src/agents/runtime-plan/auth.ts
 *
 * 降级实现：提供默认的 auth plan 构造，不再抛出 stub 错误。
 */

export type AgentRuntimeAuthPlan = {
  providerForAuth: string;
  authProfileProviderForAuth: string;
  forwardedAuthProfileId?: string;
  forwardedAuthProfileCandidateIds?: string[];
};

export function buildAgentRuntimeAuthPlan(params: {
  provider: string;
  authProfileProvider?: string;
  authProfileMode?: string;
  sessionAuthProfileId?: string;
  sessionAuthProfileCandidateIds?: string[];
  config?: unknown;
  workspaceDir?: string;
  metadataSnapshot?: unknown;
  providerAuthAliasesEnabled?: boolean;
  harnessId?: string;
  harnessRuntime?: string;
  allowHarnessAuthProfileForwarding?: boolean;
}): AgentRuntimeAuthPlan {
  const providerForAuth = params.provider;
  const authProfileProviderForAuth = params.authProfileProvider ?? params.provider;
  const canForwardProfile = providerForAuth === authProfileProviderForAuth;
  return {
    providerForAuth,
    authProfileProviderForAuth,
    ...(canForwardProfile ? { forwardedAuthProfileId: params.sessionAuthProfileId } : {}),
    ...(canForwardProfile && params.sessionAuthProfileCandidateIds?.length
      ? { forwardedAuthProfileCandidateIds: params.sessionAuthProfileCandidateIds }
      : {}),
  };
}
