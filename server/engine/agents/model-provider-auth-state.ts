/**
 * 移植自 openclaw/src/agents/model-provider-auth-state.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type PreparedProviderAuthState = unknown;
export type ProviderAuthWarmSnapshot = unknown;
export function getCurrentProviderAuthStates(..._args: unknown[]): unknown {
  throw new Error("getCurrentProviderAuthStates not implemented (openclaw stub)");
}
export function claimCurrentProviderAuthStateGeneration(..._args: unknown[]): unknown {
  throw new Error("claimCurrentProviderAuthStateGeneration not implemented (openclaw stub)");
}
export function isCurrentProviderAuthStateGeneration(..._args: unknown[]): unknown {
  throw new Error("isCurrentProviderAuthStateGeneration not implemented (openclaw stub)");
}
export function setCurrentProviderAuthWarmWorker(..._args: unknown[]): unknown {
  throw new Error("setCurrentProviderAuthWarmWorker not implemented (openclaw stub)");
}
export function clearCurrentProviderAuthWarmWorker(..._args: unknown[]): unknown {
  throw new Error("clearCurrentProviderAuthWarmWorker not implemented (openclaw stub)");
}
export function cancelCurrentProviderAuthWarmWorker(..._args: unknown[]): unknown {
  throw new Error("cancelCurrentProviderAuthWarmWorker not implemented (openclaw stub)");
}
export function clearCurrentProviderAuthState(..._args: unknown[]): unknown {
  throw new Error("clearCurrentProviderAuthState not implemented (openclaw stub)");
}
export function publishProviderAuthWarmSnapshot(..._args: unknown[]): unknown {
  throw new Error("publishProviderAuthWarmSnapshot not implemented (openclaw stub)");
}
