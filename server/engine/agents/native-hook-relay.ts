/**
 * 移植自 openclaw/src/agents/harness/native-hook-relay.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type JsonValue = unknown;
export type NativeHookRelayEvent = unknown;
export type NativeHookRelayProvider = unknown;
export type NativeHookRelayInvocation = unknown;
export type NativeHookRelayProcessResponse = unknown;
export type NativeHookRelayRegistration = unknown;
export type NativeHookRelayRegistrationHandle = unknown;
export type RegisterNativeHookRelayParams = unknown;
export type NativeHookRelayCommandOptions = unknown;
export type NativeHookRelayCommandForEventOptions = unknown;
export type InvokeNativeHookRelayParams = unknown;
export type InvokeNativeHookRelayBridgeParams = unknown;
export type NativeHookRelayDeferredApprovalOutcome = unknown;
export function registerNativeHookRelay(..._args: unknown[]): unknown {
  throw new Error("registerNativeHookRelay not implemented (openclaw stub)");
}
export function buildNativeHookRelayCommand(..._args: unknown[]): unknown {
  throw new Error("buildNativeHookRelayCommand not implemented (openclaw stub)");
}
export function invokeNativeHookRelay(..._args: unknown[]): unknown {
  throw new Error("invokeNativeHookRelay not implemented (openclaw stub)");
}
export function hasNativeHookRelayInvocation(..._args: unknown[]): unknown {
  throw new Error("hasNativeHookRelayInvocation not implemented (openclaw stub)");
}
export function resolveNativeHookRelayDeferredToolApproval(..._args: unknown[]): unknown {
  throw new Error("resolveNativeHookRelayDeferredToolApproval not implemented (openclaw stub)");
}
export function invokeNativeHookRelayBridge(..._args: unknown[]): unknown {
  throw new Error("invokeNativeHookRelayBridge not implemented (openclaw stub)");
}
export function renderNativeHookRelayUnavailableResponse(..._args: unknown[]): unknown {
  throw new Error("renderNativeHookRelayUnavailableResponse not implemented (openclaw stub)");
}
export function isNativeHookRelayBridgeStaleRegistrationError(..._args: unknown[]): unknown {
  throw new Error("isNativeHookRelayBridgeStaleRegistrationError not implemented (openclaw stub)");
}
export const testing_native_hook_relay: unknown = undefined;
