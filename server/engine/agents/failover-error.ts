/**
 * 移植自 openclaw/src/agents/failover-error.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export class FailoverError {
  constructor(..._args: unknown[]) {
    throw new Error("FailoverError not implemented (openclaw stub)");
  }
}
export function isFailoverError(..._args: unknown[]): unknown {
  throw new Error("isFailoverError not implemented (openclaw stub)");
}
export function resolveFailoverStatus(..._args: unknown[]): unknown {
  throw new Error("resolveFailoverStatus not implemented (openclaw stub)");
}
export function isNonProviderRuntimeCoordinationError(..._args: unknown[]): unknown {
  throw new Error("isNonProviderRuntimeCoordinationError not implemented (openclaw stub)");
}
export function isTimeoutError(..._args: unknown[]): unknown {
  throw new Error("isTimeoutError not implemented (openclaw stub)");
}
export function isSignalTimeoutReason(..._args: unknown[]): unknown {
  throw new Error("isSignalTimeoutReason not implemented (openclaw stub)");
}
export function resolveFailoverReasonFromError(..._args: unknown[]): unknown {
  throw new Error("resolveFailoverReasonFromError not implemented (openclaw stub)");
}
export function buildFailoverRemediationHint(..._args: unknown[]): unknown {
  throw new Error("buildFailoverRemediationHint not implemented (openclaw stub)");
}
export function buildProviderReauthCommand(..._args: unknown[]): unknown {
  throw new Error("buildProviderReauthCommand not implemented (openclaw stub)");
}
export function describeFailoverError(..._args: unknown[]): unknown {
  throw new Error("describeFailoverError not implemented (openclaw stub)");
}
export function coerceToFailoverError(..._args: unknown[]): unknown {
  throw new Error("coerceToFailoverError not implemented (openclaw stub)");
}
