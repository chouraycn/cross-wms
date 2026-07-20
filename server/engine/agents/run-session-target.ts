/**
 * 移植自 openclaw/src/agents/run-session-target.ts
 *
 * Agent run session target resolution.
 * In cross-wms the full session target resolution infrastructure is not available,
 * so resolveAgentRunSessionTarget returns a simple default and
 * applyAgentRunSessionTargetIdentity is a no-op.
 */

/** The target session for an agent run. */
export type AgentRunSessionTarget = {
  sessionKey?: string;
  agentId?: string;
  mainKey?: string;
};

/** A resolved agent run session target. */
export type ResolvedAgentRunSessionTarget = {
  sessionKey: string;
  agentId?: string;
  mainKey?: string;
};

/** Resolve the agent run session target (returns passed key in cross-wms). */
export async function resolveAgentRunSessionTarget(params: {
  sessionKey?: string;
  agentId?: string;
  mainKey?: string;
}): Promise<ResolvedAgentRunSessionTarget> {
  return {
    sessionKey: params.sessionKey ?? "",
    agentId: params.agentId,
    mainKey: params.mainKey,
  };
}

/** Apply agent run session target identity (no-op in cross-wms). */
export function applyAgentRunSessionTargetIdentity(..._args: unknown[]): void {
  // No-op in cross-wms.
}
