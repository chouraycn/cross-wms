/**
 * Host hooks — re-exports + aggregate types and helpers.
 *
 * 移植自 openclaw/src/plugins/host-hooks.ts。
 * 降级策略：类型定义保留，运行时函数降级。
 */

export { isPluginJsonValue } from "./host-hook-json.js";
export type { PluginJsonPrimitive, PluginJsonValue } from "./host-hook-json.js";
export type {
  PluginNextTurnInjectionPlacement,
  PluginNextTurnInjection,
  PluginNextTurnInjectionRecord,
  PluginNextTurnInjectionEnqueueResult,
  PluginAgentTurnPrepareEvent,
  PluginAgentTurnPrepareResult,
  PluginHeartbeatPromptContributionEvent,
  PluginHeartbeatPromptContributionResult,
} from "./host-hook-turn-types.js";

export type PluginHostCleanupReason = "disable" | "reset" | "delete" | "restart";

export type PluginSessionExtensionProjectionContext = {
  sessionId: string;
  pluginId?: string;
};

export type PluginSessionExtensionRegistration = {
  pluginId: string;
  sessionId: string;
  key: string;
  value: unknown;
};

export type PluginSessionExtensionProjection = {
  pluginId: string;
  sessionId: string;
  value: unknown;
};

export type PluginToolPolicyDecision =
  | "allow"
  | "deny"
  | "allow-with-params"
  | "deny-with-message";

export type PluginTrustedToolPolicyRegistration = {
  pluginId: string;
  policyId: string;
  toolName?: string;
  decision: PluginToolPolicyDecision;
};

export type PluginToolMetadataRegistration = {
  pluginId: string;
  toolName: string;
  metadata: Record<string, unknown>;
};

export type PluginControlUiDescriptor = {
  pluginId: string;
  label?: string;
  kind?: string;
};

export type PluginSessionActionContext = {
  sessionId: string;
  pluginId: string;
  action: string;
  params?: unknown;
};

export type PluginSessionActionResult =
  | { ok: true; result?: unknown }
  | { ok: false; error: string };

export type PluginSessionActionRegistration = {
  pluginId: string;
  action: string;
  handler?: (ctx: PluginSessionActionContext) => Promise<PluginSessionActionResult>;
};

export type PluginRuntimeLifecycleRegistration = {
  pluginId: string;
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
};

export type PluginAgentEventSubscriptionRegistration = {
  pluginId: string;
  event: string;
};

export type PluginAgentEventEmitParams = {
  pluginId: string;
  event: string;
  payload?: unknown;
};

export type PluginAgentEventEmitResult =
  | { ok: true }
  | { ok: false; error: string };

export type PluginRunContextPatch = {
  pluginId: string;
  key: string;
  value: unknown;
};

export type PluginRunContextGetParams = {
  pluginId: string;
  key: string;
};

export type PluginSessionSchedulerJobRegistration = {
  pluginId: string;
  sessionId: string;
  jobId: string;
  tag?: string;
};

export type PluginSessionSchedulerJobHandle = {
  jobId: string;
  cancel: () => Promise<void>;
};

export type PluginSessionAttachmentFile = {
  path: string;
  filename?: string;
  contentType?: string;
};

export type PluginAttachmentChannelHints = {
  maxAttachmentBytes?: number;
  supportedContentTypes?: string[];
};

export type PluginSessionAttachmentCaptionFormat = "plain" | "html" | "markdown";

export type PluginSessionAttachmentParams = {
  sessionId: string;
  pluginId: string;
  file?: PluginSessionAttachmentFile;
  url?: string;
  content?: unknown;
  captionFormat?: PluginSessionAttachmentCaptionFormat;
};

export type PluginSessionAttachmentResult =
  | { ok: true; attachmentId?: string }
  | { ok: false; error: string };

export type PluginSessionTurnSchedule = {
  pluginId: string;
  sessionId: string;
  jobId: string;
  tag?: string;
  cron?: string;
  delayMs?: number;
};

export type PluginSessionTurnScheduleParams = {
  sessionId: string;
  pluginId: string;
  cron?: string;
  delayMs?: number;
  tag?: string;
  payload?: unknown;
};

export type PluginSessionTurnUnscheduleByTagParams = {
  sessionId: string;
  tag?: string;
  pluginId?: string;
};

export type PluginSessionTurnUnscheduleByTagResult = {
  unscheduled: number;
};

/** Normalizes a plugin host hook id. */
export function normalizePluginHostHookId(value: string | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

/** Builds a plugin agent turn prepare context. */
export function buildPluginAgentTurnPrepareContext(params: {
  sessionId: string;
  pluginId?: string;
}): unknown {
  void params;
  return undefined;
}
