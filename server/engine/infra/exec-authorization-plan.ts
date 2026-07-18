// 移植自 openclaw/src/infra/exec-authorization-plan.ts（降级实现）
// 构建 shell 命令的授权计划，识别可重用与不可重用的命令段。
//
// 降级策略：
// 1. 源文件依赖 ./command-explainer/extract.js 的 explainShellCommand，
//    从 ./_openclaw-infra-deps.js 导入（降级为抛出错误）
// 2. 源文件依赖 ./command-explainer/types.js 的 CommandExplanation/CommandOperator/CommandRisk/CommandStep，
//    这里定义本地降级类型
// 3. 源文件依赖 ./exec-approvals-analysis.js（已移植）、./exec-wrapper-resolution.js（已移植）、
//    ./shell-inline-command.js（已移植）、./shell-wrapper-resolution.js（已移植）
// 4. planShellAuthorization/planExecAuthorization 降级为返回失败结果
// 5. canUseReusableWrapperPayloadCandidates 保留完整实现

import type { ExecCommandAnalysis, ExecCommandSegment, ShellChainOperator } from "./exec-approvals-analysis.js";
import { normalizeExecutableToken } from "./exec-wrapper-resolution.js";

// ============================================================================
// 降级类型定义（来自 command-explainer/types.js）
// ============================================================================

export type SourceSpan = {
  startIndex: number;
  endIndex: number;
  startPosition?: { row: number; column: number };
  endPosition?: { row: number; column: number };
};

export type CommandStep = {
  id?: string;
  parentCommandId?: string;
  context?: string;
  executable: string;
  argv: string[];
  text: string;
  span: SourceSpan;
  executableSpan: SourceSpan;
};

export type CommandOperator = {
  kind: "and" | "or" | "pipe" | "stderr-pipe" | "sequence" | "newline-sequence" | "background";
  span: SourceSpan;
};

export type CommandRisk = {
  kind: string;
  span: SourceSpan;
  text?: string;
};

export type CommandExplanation = {
  steps: CommandStep[];
  operators: CommandOperator[];
  risks: CommandRisk[];
  shapes: ReadonlyArray<string>;
};

// ============================================================================
// 导出类型
// ============================================================================

export type ExecAuthorizationDialect = "argv" | "posix-shell" | "windows-cmd" | "powershell";

export type ExecAuthorizationTransport =
  | { kind: "direct" }
  | {
      kind: "shell-wrapper";
      wrapperSegment: ExecCommandSegment;
      wrapperArgv: string[];
      wrapperPrefix: string;
      inlineCommand: string;
    };

export type ExecAuthorizationTrustMode = "executable" | "exact-command" | "prompt-only";

export type ExecAuthorizationCandidate = {
  sourceSegment: ExecCommandSegment;
  sourceStep: CommandStep;
  sourceStepId?: string;
  transport: ExecAuthorizationTransport;
  trustMode: ExecAuthorizationTrustMode;
  allowAlways: boolean;
  reasons: string[];
};

export type ExecAuthorizationGroup = {
  opToNext?: ShellChainOperator | null;
  candidates: ExecAuthorizationCandidate[];
};

export type ExecAuthorizationPlan =
  | {
      ok: true;
      dialect: ExecAuthorizationDialect;
      originalCommand: string;
      groups: ExecAuthorizationGroup[];
      operators: CommandOperator[];
    }
  | {
      ok: false;
      dialect: ExecAuthorizationDialect;
      originalCommand: string;
      reason: string;
      groups: [];
      operators: [];
    };

// ============================================================================
// 常量
// ============================================================================

export const POSITIONAL_CARRIER_BLOCKED_EXECUTABLES = new Set(["find", "xargs"]);

// ============================================================================
// 函数实现
// ============================================================================

function isPathScopedExecutableToken(token: string): boolean {
  return token.includes("/") || token.includes("\\");
}

export function canUseReusableWrapperPayloadCandidates(
  segments: readonly ExecCommandSegment[],
): boolean {
  const firstExecutable = segments[0]?.argv[0]?.trim() ?? "";
  if (!firstExecutable) {
    return false;
  }
  if (segments.some((segment) => isPathScopedExecutableToken(segment.argv[0]?.trim() ?? ""))) {
    return false;
  }
  return !segments.some((segment) =>
    normalizeExecutableToken(segment.argv[0] ?? "").endsWith("-wrapper"),
  );
}

function unanalyzablePlan(params: {
  dialect: ExecAuthorizationDialect;
  command: string;
  reason: string;
}): ExecAuthorizationPlan {
  return {
    ok: false,
    dialect: params.dialect,
    originalCommand: params.command,
    reason: params.reason,
    groups: [],
    operators: [],
  };
}

/**
 * 规划 shell 命令的授权。
 * 降级实现：返回失败结果，因为 command-explainer/extract 未移植。
 */
export async function planShellAuthorization(params: {
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
}): Promise<ExecAuthorizationPlan> {
  if (params.platform === "win32") {
    return unanalyzablePlan({
      dialect: "windows-cmd",
      command: params.command,
      reason: "non-POSIX shell command",
    });
  }
  return unanalyzablePlan({
    dialect: "posix-shell",
    command: params.command,
    reason: "command-explainer/extract not ported",
  });
}

/**
 * 规划 exec 命令的授权。
 * 降级实现：返回失败结果。
 */
export async function planExecAuthorization(params: {
  analysis: ExecCommandAnalysis;
  command?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
}): Promise<ExecAuthorizationPlan> {
  const command =
    params.command ??
    params.analysis.segments.map((segment) => segment.raw).join(" && ");
  if (!params.analysis.ok) {
    return unanalyzablePlan({
      dialect: "argv",
      command,
      reason: params.analysis.reason ?? "unable to parse command",
    });
  }
  return unanalyzablePlan({
    dialect: "argv",
    command,
    reason: "command-explainer/extract not ported",
  });
}
