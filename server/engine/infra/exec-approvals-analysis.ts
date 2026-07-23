// 移植自 openclaw/src/infra/exec-approvals-analysis.ts

import type { ExecAllowlistEntry } from "./exec-approvals.types.js";

/** 可执行文件解析结果中的执行目标信息 */
export type ExecutableResolution = {
  rawExecutable: string;
  resolvedPath?: string;
  resolvedRealPath?: string;
  executableName: string;
};

/** 命令解析结果类型 */
export type CommandResolution = {
  execution: ExecutableResolution;
  policy: ExecutableResolution;
  effectiveArgv?: string[];
  wrapperChain?: string[];
  policyBlocked?: boolean;
  blockedWrapper?: string;
};

/** Exec 命令段类型 */
export type ExecCommandSegment = {
  raw: string;
  argv: string[];
  sourceArgv?: string[];
  resolution: CommandResolution | null;
};

/** Exec 命令分析结果类型 */
export type ExecCommandAnalysis = {
  ok: boolean;
  reason?: string;
  segments: ExecCommandSegment[];
  chains?: ExecCommandSegment[][];
};

/** Shell 链操作符类型 */
export type ShellChainOperator = string;

export type ExecArgvToken = unknown;

export function resolvePlannedSegmentArgv(...args: unknown[]): unknown {
  return undefined;
}

export function buildEnforcedShellCommand(...args: unknown[]): unknown {
  return undefined;
}

export function analyzeArgvCommand(...args: unknown[]): unknown {
  return undefined;
}

export function matchAllowlist(
  _allowlist: ExecAllowlistEntry[],
  _candidateResolution: ExecutableResolution | null,
  _effectiveArgv?: string[],
  _platform?: string | null,
): ExecAllowlistEntry | null {
  return null;
}

export function parseExecArgvToken(...args: unknown[]): unknown {
  return undefined;
}

export function resolveAllowlistCandidatePath(...args: unknown[]): unknown {
  return undefined;
}

export function resolveApprovalAuditCandidatePath(...args: unknown[]): unknown {
  return undefined;
}

export function resolveApprovalAuditTrustPath(...args: unknown[]): unknown {
  return undefined;
}

export function resolveCommandResolution(...args: unknown[]): unknown {
  return undefined;
}

export function resolveCommandResolutionFromArgv(
  _argv: string[],
  _cwd?: string,
  _env?: NodeJS.ProcessEnv,
  _platform?: NodeJS.Platform,
): CommandResolution | null {
  return null;
}

export function resolveExecutionTargetCandidatePath(
  _resolution: CommandResolution | null,
  _cwd?: string,
): string | undefined {
  return undefined;
}

export function resolveExecutionTargetResolution(
  resolution: CommandResolution | null,
): ExecutableResolution | null {
  return resolution?.execution ?? null;
}

export function resolveExecutionTargetTrustPath(
  _resolution: CommandResolution | null,
  _cwd?: string,
): string | undefined {
  return undefined;
}

export function resolvePolicyAllowlistCandidatePath(...args: unknown[]): unknown {
  return undefined;
}

export function resolvePolicyTargetCandidatePath(
  _resolution: CommandResolution | null,
  _cwd?: string,
): string | undefined {
  return undefined;
}

export function resolvePolicyTargetResolution(
  resolution: CommandResolution | null,
): ExecutableResolution | null {
  return resolution?.policy ?? null;
}

export function resolvePolicyTargetTrustPath(
  _resolution: CommandResolution | null,
  _cwd?: string,
): string | undefined {
  return undefined;
}

export function resolveExecutableTrustPath(
  resolution: ExecutableResolution | null,
): string | undefined {
  return resolution?.resolvedPath ?? resolution?.rawExecutable;
}

export function isWindowsPlatform(_platform?: string | null): boolean {
  return false;
}

export function analyzeWindowsShellCommand(...args: unknown[]): unknown {
  return undefined;
}

export function tokenizeWindowsSegment(...args: unknown[]): unknown {
  return undefined;
}

export function windowsEscapeArg(...args: unknown[]): unknown {
  return undefined;
}
