// 移植自 openclaw/src/infra/exec-authorization-plan.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecAuthorizationDialect = unknown;
export type ExecAuthorizationTransport = unknown;
export type ExecAuthorizationTrustMode = unknown;
export type ExecAuthorizationCandidate = unknown;
export type ExecAuthorizationGroup = unknown;
export type ExecAuthorizationPlan = unknown;
export function canUseReusableWrapperPayloadCandidates(...args: unknown[]): unknown {
  throw new Error("not implemented: canUseReusableWrapperPayloadCandidates");
}
export function planShellAuthorization(...args: unknown[]): unknown {
  throw new Error("not implemented: planShellAuthorization");
}
export function planExecAuthorization(...args: unknown[]): unknown {
  throw new Error("not implemented: planExecAuthorization");
}
export const POSITIONAL_CARRIER_BLOCKED_EXECUTABLES: unknown = undefined;
