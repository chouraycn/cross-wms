// 移植自 openclaw/src/infra/exec-command-resolution.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecutableResolution = unknown;
export type CommandResolution = unknown;
export type ExecArgvToken = unknown;
export function resolveCommandResolution(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveCommandResolution");
}
export function resolveCommandResolutionFromArgv(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveCommandResolutionFromArgv");
}
export function resolveExecutableTrustPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecutableTrustPath");
}
export function resolveExecutionTargetResolution(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecutionTargetResolution");
}
export function resolvePolicyTargetResolution(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePolicyTargetResolution");
}
export function resolveExecutionTargetCandidatePath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecutionTargetCandidatePath");
}
export function resolveExecutionTargetTrustPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecutionTargetTrustPath");
}
export function resolvePolicyTargetCandidatePath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePolicyTargetCandidatePath");
}
export function resolvePolicyTargetTrustPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePolicyTargetTrustPath");
}
export function resolveApprovalAuditCandidatePath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalAuditCandidatePath");
}
export function resolveApprovalAuditTrustPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalAuditTrustPath");
}
export function resolveAllowlistCandidatePath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAllowlistCandidatePath");
}
export function resolvePolicyAllowlistCandidatePath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePolicyAllowlistCandidatePath");
}
export function matchAllowlist(...args: unknown[]): unknown {
  throw new Error("not implemented: matchAllowlist");
}
export function parseExecArgvToken(...args: unknown[]): unknown {
  throw new Error("not implemented: parseExecArgvToken");
}
