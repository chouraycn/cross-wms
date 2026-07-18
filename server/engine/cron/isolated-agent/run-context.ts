import type { CronJob } from "../types.js";
import type {
  IsolatedAgentRunMode,
  IsolatedAgentRunOrigin,
  IsolatedAgentRuntimeConfig,
  IsolatedAgentAuthProfile,
  IsolatedAgentModelSelection,
  IsolatedAgentDeliveryOptions,
  IsolatedAgentSessionState,
} from "./types.js";
import type { IsolatedAgentRunContext, IsolatedAgentRunParams } from "./run-types.js";
import { resolveIsolatedAgentRuntimeConfig } from "./run-config.js";
import { resolveIsolatedAgentAuthProfile } from "./run-auth-profile.js";
import { resolveIsolatedAgentModelSelection } from "./run-model-selection.js";
import { resolveIsolatedAgentDeliveryOptions } from "./run-delivery.js";
import { resolveIsolatedAgentSessionState } from "./run-session-state.js";

export function createIsolatedAgentRunContext(params: IsolatedAgentRunParams): IsolatedAgentRunContext {
  const startTimeMs = Date.now();

  const config = resolveRuntimeConfigFromJob(params.job);
  const authProfile = resolveIsolatedAgentAuthProfile(params.job);
  const modelSelection = resolveIsolatedAgentModelSelection(params.job);
  const deliveryOptions = resolveIsolatedAgentDeliveryOptions(params.job);
  const sessionState = resolveIsolatedAgentSessionState(params.job);

  return {
    job: params.job,
    runId: params.runId,
    mode: params.mode,
    origin: params.origin,
    abortSignal: params.abortSignal,
    startTimeMs,
    config,
    authProfile,
    modelSelection,
    deliveryOptions,
    sessionState,
    diagnostics: { entries: [] },
  };
}

function resolveRuntimeConfigFromJob(job: CronJob): IsolatedAgentRuntimeConfig {
  if (job.payload.kind === "agentTurn") {
    return resolveIsolatedAgentRuntimeConfig({
      allowUnsafeExternalContent: job.payload.allowUnsafeExternalContent,
      lightContext: job.payload.lightContext,
      toolsAllow: job.payload.toolsAllow,
      timeoutSeconds: job.payload.timeoutSeconds,
    });
  }
  if (job.payload.kind === "command") {
    return resolveIsolatedAgentRuntimeConfig({
      timeoutSeconds: job.payload.timeoutSeconds,
      noOutputTimeoutSeconds: job.payload.noOutputTimeoutSeconds,
      maxOutputBytes: job.payload.outputMaxBytes,
    });
  }
  return resolveIsolatedAgentRuntimeConfig();
}