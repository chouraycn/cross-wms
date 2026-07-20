/**
 * before_tool_call policy runtime for agent tools.
 * Ported from openclaw/src/agents/agent-tools.before-tool-call.ts
 * Simplified: plugin hooks, trusted policies, approvals, diagnostics, and loop detection
 * replaced with pass-through defaults.
 */

export { consumeAdjustedParamsForToolCall, consumePreExecutionBlockedToolCall, peekAdjustedParamsForToolCall } from "./agent-tools.before-tool-call.state.js";

export type ToolOutcomeObservation = {
  toolName: string;
  argsHash: string;
  resultHash: string;
  toolCallOrdinal?: number;
  terminalPresentation?: string;
  presentationOnly?: boolean;
};

export type ToolOutcomeObserver = (observation: ToolOutcomeObservation) => void;

export type HookContext = {
  agentId?: string;
  config?: unknown;
  cwd?: string;
  workspaceDir?: string;
  sessionKey?: string;
  sessionId?: string;
  runId?: string;
  trace?: unknown;
  channelId?: string;
  turnSourceChannel?: string;
  turnSourceTo?: string;
  turnSourceAccountId?: string;
  turnSourceThreadId?: string | number;
  loopDetection?: unknown;
  onToolOutcome?: ToolOutcomeObserver;
  allocateToolOutcomeOrdinal?: (toolCallId?: string) => number;
  skillsSnapshot?: unknown;
  skillCommand?: {
    commandName: string;
    skillName: string;
    skillSource?: unknown;
    toolName?: string;
  };
  sandbox?: {
    root: string;
    bridge: unknown;
  };
};

export type DeferredPluginToolApproval = {
  approval: unknown;
  toolName: string;
  toolCallId?: string;
  ctx?: HookContext;
  baseParams: unknown;
  overrideParams?: unknown;
};

export type BeforeToolCallPolicyDiagnosticState = {
  hasBeforeToolCallHook: boolean;
  trustedToolPolicies: Array<{
    id: string;
    pluginId: string;
    pluginName?: string;
  }>;
};

/**
 * Error used when before_tool_call intentionally vetoes a tool call.
 */
export class BeforeToolCallBlockedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "BeforeToolCallBlockedError";
  }
}

/** Return whether before_tool_call hooks or trusted policies are active. */
export function getBeforeToolCallPolicyDiagnosticState(): BeforeToolCallPolicyDiagnosticState {
  return { hasBeforeToolCallHook: false, trustedToolPolicies: [] };
}

/** Return true when any before_tool_call policy could affect tool execution. */
export function hasBeforeToolCallPolicy(): boolean {
  return false;
}

/** Resolve terminal presentation for a tool result. */
export function resolveToolTerminalPresentation(_params: {
  tool: unknown;
  toolParams: unknown;
  result: unknown;
}): string | undefined {
  return undefined;
}

/** Finalizes a trusted terminal summary after harness result middleware. */
export function finalizeToolTerminalPresentation(_params: {
  toolCallId: string;
  runId?: string;
  result: unknown;
  isError: boolean;
  observer?: ToolOutcomeObserver;
  toolName?: string;
  toolCallOrdinal?: number;
}): void {
  // No-op in simplified port.
}

/** Remember hook-adjusted params for later adapter-side execution. */
export function recordAdjustedParamsForToolCall(
  _toolCallId: string | undefined,
  _params: unknown,
  _runId?: string,
): void {
  // No-op: adjusted param tracking not available in simplified port.
}

/** Record that one concrete core-owned tool call may use structured replay classification. */
export function recordStructuredReplayTrustForToolCall(
  _toolCallId: string | undefined,
  _tool: unknown,
  _runId?: string,
): void {
  // No-op in simplified port.
}

/** Returns true when an error represents an intentional before_tool_call veto. */
export function isBeforeToolCallBlockedError(err: unknown): err is BeforeToolCallBlockedError {
  return err instanceof BeforeToolCallBlockedError;
}

/** Resolve a deferred plugin approval request at the later execution boundary. */
export async function requestDeferredPluginToolApproval(_params: {
  deferredApproval: DeferredPluginToolApproval;
  signal?: AbortSignal;
}): Promise<{ blocked: true; kind: "failure"; deniedReason: "plugin-approval"; reason: string; params: unknown }> {
  return { blocked: true, kind: "failure", deniedReason: "plugin-approval", reason: "Plugin approval not available", params: undefined };
}

/** Notify plugin approval callbacks that a deferred approval was cancelled. */
export function cancelDeferredPluginToolApproval(_deferredApproval: DeferredPluginToolApproval): void {
  // No-op in simplified port.
}

/** Build the standard terminal result for vetoed tool calls. */
export function buildBlockedToolResult(params: {
  reason: string;
  deniedReason?: string;
  toolCallId?: string;
  runId?: string;
}) {
  return {
    content: [{ type: "text" as const, text: params.reason }],
    details: {
      status: "blocked",
      deniedReason: params.deniedReason ?? "plugin-before-tool-call",
      reason: params.reason,
    },
  };
}

/** Run the full before_tool_call policy chain for a pending tool call. */
export async function runBeforeToolCallHook(args: {
  toolName: string;
  params: unknown;
  toolKind?: unknown;
  toolInputKind?: unknown;
  toolCallId?: string;
  ctx?: HookContext;
  signal?: AbortSignal;
  approvalMode?: "request" | "report" | "defer";
}): Promise<{ blocked: false; params: unknown }> {
  // Simplified: no hooks active, always allow.
  return { blocked: false, params: args.params };
}

/** Wrap a tool execute function with before_tool_call hooks and diagnostics. */
export function wrapToolWithBeforeToolCallHook(
  tool: unknown & { execute?: (...args: unknown[]) => Promise<unknown>; name?: string },
  _ctx?: HookContext,
  _options?: { approvalMode?: "request" | "report"; emitDiagnostics?: boolean },
): unknown {
  return tool;
}

/** Return true when a tool already carries the before_tool_call wrapper marker. */
export function isToolWrappedWithBeforeToolCallHook(_tool: unknown): boolean {
  return false;
}

/** Toggle diagnostic event emission on an existing before_tool_call wrapper. */
export function setBeforeToolCallDiagnosticsEnabled(_tool: unknown, _enabled: boolean): void {
  // No-op in simplified port.
}

/** Rebuild a before_tool_call wrapper while preserving the original source tool. */
export function rewrapToolWithBeforeToolCallHook(
  tool: unknown,
  _ctx?: HookContext,
  _options?: { approvalMode?: "request" | "report"; emitDiagnostics?: boolean },
): unknown {
  return tool;
}

/** Copy before_tool_call marker metadata when another wrapper replaces a tool. */
export function copyBeforeToolCallHookMarker(_source: unknown, _target: unknown): void {
  // No-op in simplified port.
}

export const testing = {
  BEFORE_TOOL_CALL_WRAPPED: Symbol("beforeToolCallWrapped"),
  BEFORE_TOOL_CALL_DIAGNOSTIC_OPTIONS: Symbol("beforeToolCallDiagnosticOptions"),
  BEFORE_TOOL_CALL_SOURCE_TOOL: Symbol("beforeToolCallSourceTool"),
  BEFORE_TOOL_CALL_HOOK_CONTEXT: Symbol("beforeToolCallHookContext"),
};
