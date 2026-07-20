// 移植自 openclaw/src/infra/exec-authorization-plan.ts

export type ExecAuthorizationDialect = unknown;
export type ExecAuthorizationTransport = unknown;
export type ExecAuthorizationTrustMode = unknown;
export type ExecAuthorizationCandidate = unknown;
export type ExecAuthorizationGroup = unknown;
export type ExecAuthorizationPlan = unknown;
export function canUseReusableWrapperPayloadCandidates(...args: unknown[]): unknown {
  return false;
}
export function planShellAuthorization(...args: unknown[]): unknown {
  return undefined;
}
export function planExecAuthorization(...args: unknown[]): unknown {
  return undefined;
}
export const POSITIONAL_CARRIER_BLOCKED_EXECUTABLES: unknown = undefined;
