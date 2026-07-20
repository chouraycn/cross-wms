/**
 * Builds prepared runtime plans consumed by embedded agent runs.
 * Ported from openclaw/src/agents/runtime-plan/build.ts
 *
 * The full implementation requires the complete runtime-plan type system,
 * provider hooks, auth plans, transcript policy, transport params, delivery,
 * and observability infrastructure. This adapted version provides the core
 * plan-building logic with sensible defaults for cross-wms.
 */

type AgentRuntimeDeliveryPlan = {
  isSilentPayload: (payload: { text?: string }) => boolean;
  resolveFollowupRoute: (routeParams: Record<string, unknown>) => unknown;
};

type AgentRuntimeOutcomePlan = {
  classifyRunResult: (result: unknown) => string | null;
};

type AgentRuntimePlan = {
  resolvedRef: { provider: string; modelId: string };
  auth: { forwardedAuthProfileId?: string };
  delivery: AgentRuntimeDeliveryPlan;
  outcome: AgentRuntimeOutcomePlan;
};

const SILENT_REPLY_TOKEN = "__silent_reply__";

function isSilentReplyPayloadText(text: string | undefined, token: string): boolean {
  return typeof text === "string" && (text === token || text.trim() === token);
}

/** Build delivery-specific runtime decisions for one provider/model. */
export function buildAgentRuntimeDeliveryPlan(params: {
  provider: string;
  modelId?: string;
  config?: unknown;
  workspaceDir?: string;
  agentDir?: string;
}): AgentRuntimeDeliveryPlan {
  return {
    isSilentPayload(payload): boolean {
      return isSilentReplyPayloadText(payload.text, SILENT_REPLY_TOKEN);
    },
    resolveFollowupRoute(_routeParams) {
      // Full followup route resolution requires the provider runtime plugin system.
      return null;
    },
  };
}

/** Build run-outcome classification hooks for model fallback decisions. */
export function buildAgentRuntimeOutcomePlan(): AgentRuntimeOutcomePlan {
  return {
    classifyRunResult(_result: unknown): string | null {
      // Full classification requires the embedded-agent-runner result classifier.
      return null;
    },
  };
}

/** Build the complete runtime plan for an embedded agent attempt. */
export function buildAgentRuntimePlan(params: {
  provider: string;
  modelId: string;
  config?: unknown;
  workspaceDir?: string;
  agentDir?: string;
  modelApi?: string;
  authProfileProvider?: string;
  authProfileMode?: string;
  sessionAuthProfileId?: string;
  harnessId?: string;
}): AgentRuntimePlan {
  return {
    resolvedRef: {
      provider: params.provider,
      modelId: params.modelId,
    },
    auth: {},
    delivery: buildAgentRuntimeDeliveryPlan({
      provider: params.provider,
      modelId: params.modelId,
      config: params.config,
      workspaceDir: params.workspaceDir,
      agentDir: params.agentDir,
    }),
    outcome: buildAgentRuntimeOutcomePlan(),
  };
}
