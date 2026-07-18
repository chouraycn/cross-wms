// 移植自 openclaw/src/infra/exec-approvals-analysis.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecCommandAnalysis = unknown;
export type ExecCommandSegment = unknown;
export type ShellChainOperator = unknown;
export function resolvePlannedSegmentArgv(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePlannedSegmentArgv");
}
export function buildEnforcedShellCommand(...args: unknown[]): unknown {
  throw new Error("not implemented: buildEnforcedShellCommand");
}
export type analyzeArgvCommand = unknown;
export const analyzeArgvCommand: unknown = undefined;
export type matchAllowlist = unknown;
export const matchAllowlist: unknown = undefined;
export type parseExecArgvToken = unknown;
export const parseExecArgvToken: unknown = undefined;
export type resolveAllowlistCandidatePath = unknown;
export const resolveAllowlistCandidatePath: unknown = undefined;
export type resolveApprovalAuditCandidatePath = unknown;
export const resolveApprovalAuditCandidatePath: unknown = undefined;
export type resolveApprovalAuditTrustPath = unknown;
export const resolveApprovalAuditTrustPath: unknown = undefined;
export type resolveCommandResolution = unknown;
export const resolveCommandResolution: unknown = undefined;
export type resolveCommandResolutionFromArgv = unknown;
export const resolveCommandResolutionFromArgv: unknown = undefined;
export type resolveExecutionTargetCandidatePath = unknown;
export const resolveExecutionTargetCandidatePath: unknown = undefined;
export type resolveExecutionTargetResolution = unknown;
export const resolveExecutionTargetResolution: unknown = undefined;
export type resolveExecutionTargetTrustPath = unknown;
export const resolveExecutionTargetTrustPath: unknown = undefined;
export type resolvePolicyAllowlistCandidatePath = unknown;
export const resolvePolicyAllowlistCandidatePath: unknown = undefined;
export type resolvePolicyTargetCandidatePath = unknown;
export const resolvePolicyTargetCandidatePath: unknown = undefined;
export type resolvePolicyTargetResolution = unknown;
export const resolvePolicyTargetResolution: unknown = undefined;
export type resolvePolicyTargetTrustPath = unknown;
export const resolvePolicyTargetTrustPath: unknown = undefined;
export type resolveExecutableTrustPath = unknown;
export const resolveExecutableTrustPath: unknown = undefined;
export type CommandResolution = unknown;
export const CommandResolution: unknown = undefined;
export type ExecutableResolution = unknown;
export const ExecutableResolution: unknown = undefined;
export type ExecArgvToken = unknown;
export const ExecArgvToken: unknown = undefined;
export type analyzeWindowsShellCommand = unknown;
export const analyzeWindowsShellCommand: unknown = undefined;
export type isWindowsPlatform = unknown;
export const isWindowsPlatform: unknown = undefined;
export type tokenizeWindowsSegment = unknown;
export const tokenizeWindowsSegment: unknown = undefined;
export type windowsEscapeArg = unknown;
export const windowsEscapeArg: unknown = undefined;
