// 移植自 openclaw/src/infra/exec-approvals-analysis.ts
// 共享的 exec 审批分析类型与 Windows shell 强制执行辅助。
//
// 降级策略：
// 1. 源文件依赖 ./windows-shell-command.js，未移植，使用 _openclaw-infra-deps.ts 中的降级实现。
// 2. 源文件依赖 ./exec-argv-analysis.js，未移植，使用 _openclaw-infra-deps.ts 中的降级实现。
// 3. 其余依赖（./exec-command-analysis-types.js、./exec-command-resolution.js）已移植。
import {
  rebuildWindowsShellCommandFromSource,
  windowsEscapeArg,
} from "./_openclaw-infra-deps.js";
import type { ExecCommandSegment } from "./exec-command-analysis-types.js";

export { analyzeArgvCommand } from "./_openclaw-infra-deps.js";

export {
  matchAllowlist,
  parseExecArgvToken,
  resolveAllowlistCandidatePath,
  resolveApprovalAuditCandidatePath,
  resolveApprovalAuditTrustPath,
  resolveCommandResolution,
  resolveCommandResolutionFromArgv,
  resolveExecutionTargetCandidatePath,
  resolveExecutionTargetResolution,
  resolveExecutionTargetTrustPath,
  resolvePolicyAllowlistCandidatePath,
  resolvePolicyTargetCandidatePath,
  resolvePolicyTargetResolution,
  resolvePolicyTargetTrustPath,
  resolveExecutableTrustPath,
  type CommandResolution,
  type ExecutableResolution,
  type ExecArgvToken,
} from "./exec-command-resolution.js";

export {
  analyzeWindowsShellCommand,
  isWindowsPlatform,
  tokenizeWindowsSegment,
  windowsEscapeArg,
} from "./_openclaw-infra-deps.js";
export type {
  ExecCommandAnalysis,
  ExecCommandSegment,
  ShellChainOperator,
} from "./exec-command-analysis-types.js";

function renderWindowsQuotedArgv(argv: readonly string[]):
  | { ok: true; rendered: string }
  | {
      ok: false;
      reason: string;
    } {
  const parts: string[] = [];
  for (const token of argv) {
    const result = windowsEscapeArg(token);
    if (!result.ok) {
      return { ok: false, reason: `unsafe windows token: ${token}` };
    }
    parts.push(result.escaped);
  }
  return { ok: true, rendered: parts.join(" ") };
}

export function resolvePlannedSegmentArgv(segment: ExecCommandSegment): string[] | null {
  if (segment.resolution?.policyBlocked === true) {
    return null;
  }
  const baseArgv =
    segment.resolution?.effectiveArgv && segment.resolution.effectiveArgv.length > 0
      ? segment.resolution.effectiveArgv
      : segment.argv;
  if (baseArgv.length === 0) {
    return null;
  }
  const argv = [...baseArgv];
  const execution = segment.resolution?.execution;
  const resolvedExecutable =
    execution?.resolvedRealPath?.trim() ?? execution?.resolvedPath?.trim() ?? "";
  if (resolvedExecutable) {
    argv[0] = resolvedExecutable;
  }
  return argv;
}

export function buildEnforcedShellCommand(params: {
  command: string;
  segments: ExecCommandSegment[];
  platform?: string | null;
}): { ok: boolean; command?: string; reason?: string } {
  if (params.platform !== "win32") {
    return { ok: false, reason: "unsupported platform" };
  }

  const rebuilt = rebuildWindowsShellCommandFromSource({
    command: params.command,
    renderSegment: (_raw, segmentIndex) => {
      const segment = params.segments[segmentIndex];
      if (!segment) {
        return { ok: false, reason: "segment mapping failed" };
      }
      const argv = resolvePlannedSegmentArgv(segment);
      if (!argv) {
        return { ok: false, reason: "segment execution plan unavailable" };
      }
      return renderWindowsQuotedArgv(argv);
    },
  });
  if (!rebuilt.ok) {
    return { ok: false, reason: rebuilt.reason };
  }
  if (rebuilt.segmentCount !== params.segments.length) {
    return { ok: false, reason: "segment count mismatch" };
  }
  return { ok: true, command: rebuilt.command };
}
