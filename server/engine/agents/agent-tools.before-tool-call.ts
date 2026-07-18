/**
 * 移植自 openclaw/src/agents/agent-tools.before-tool-call.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { consumeAdjustedParamsForToolCall, consumePreExecutionBlockedToolCall, peekAdjustedParamsForToolCall } from "./agent-tools.before-tool-call.state.js";
export type ToolOutcomeObservation = unknown;
export type ToolOutcomeObserver = unknown;
export type HookContext = unknown;
export type DeferredPluginToolApproval = unknown;
export type BeforeToolCallPolicyDiagnosticState = unknown;
export const testing: unknown = undefined;
export class BeforeToolCallBlockedError {
  constructor(..._args: unknown[]) {
    throw new Error("BeforeToolCallBlockedError not implemented (openclaw stub)");
  }
}
export function getBeforeToolCallPolicyDiagnosticState(..._args: unknown[]): unknown {
  throw new Error("getBeforeToolCallPolicyDiagnosticState not implemented (openclaw stub)");
}
export function hasBeforeToolCallPolicy(..._args: unknown[]): unknown {
  throw new Error("hasBeforeToolCallPolicy not implemented (openclaw stub)");
}
export function resolveToolTerminalPresentation(..._args: unknown[]): unknown {
  throw new Error("resolveToolTerminalPresentation not implemented (openclaw stub)");
}
export function finalizeToolTerminalPresentation(..._args: unknown[]): unknown {
  throw new Error("finalizeToolTerminalPresentation not implemented (openclaw stub)");
}
export function recordAdjustedParamsForToolCall(..._args: unknown[]): unknown {
  throw new Error("recordAdjustedParamsForToolCall not implemented (openclaw stub)");
}
export function recordStructuredReplayTrustForToolCall(..._args: unknown[]): unknown {
  throw new Error("recordStructuredReplayTrustForToolCall not implemented (openclaw stub)");
}
export function isBeforeToolCallBlockedError(..._args: unknown[]): unknown {
  throw new Error("isBeforeToolCallBlockedError not implemented (openclaw stub)");
}
export async function requestDeferredPluginToolApproval(..._args: unknown[]): Promise<unknown> {
  throw new Error("requestDeferredPluginToolApproval not implemented (openclaw stub)");
}
export function cancelDeferredPluginToolApproval(..._args: unknown[]): unknown {
  throw new Error("cancelDeferredPluginToolApproval not implemented (openclaw stub)");
}
export function buildBlockedToolResult(..._args: unknown[]): unknown {
  throw new Error("buildBlockedToolResult not implemented (openclaw stub)");
}
export async function runBeforeToolCallHook(..._args: unknown[]): Promise<unknown> {
  throw new Error("runBeforeToolCallHook not implemented (openclaw stub)");
}
export function wrapToolWithBeforeToolCallHook(..._args: unknown[]): unknown {
  throw new Error("wrapToolWithBeforeToolCallHook not implemented (openclaw stub)");
}
export function isToolWrappedWithBeforeToolCallHook(..._args: unknown[]): unknown {
  throw new Error("isToolWrappedWithBeforeToolCallHook not implemented (openclaw stub)");
}
export function setBeforeToolCallDiagnosticsEnabled(..._args: unknown[]): unknown {
  throw new Error("setBeforeToolCallDiagnosticsEnabled not implemented (openclaw stub)");
}
export function rewrapToolWithBeforeToolCallHook(..._args: unknown[]): unknown {
  throw new Error("rewrapToolWithBeforeToolCallHook not implemented (openclaw stub)");
}
export function copyBeforeToolCallHookMarker(..._args: unknown[]): unknown {
  throw new Error("copyBeforeToolCallHookMarker not implemented (openclaw stub)");
}
