// 移植自 openclaw/src/infra/exec-authorization-plan.ts

import type { ExecCommandSegment, ShellChainOperator } from "./exec-approvals-analysis.js";

export type ExecAuthorizationDialect = "posix" | "windows" | "unknown";
export type ExecAuthorizationTransport =
  | { kind: "direct" }
  | {
      kind: "shell-wrapper";
      wrapperSegment?: ExecCommandSegment;
      wrapperArgv: string[];
      wrapperPrefix?: string;
      inlineCommand?: string;
    };
export type ExecAuthorizationTrustMode = "executable" | "exact-command" | "prompt-only";

export type ExecAuthorizationCandidate = {
  trustMode: ExecAuthorizationTrustMode;
  sourceSegment: ExecCommandSegment;
  transport: ExecAuthorizationTransport;
  allowAlways: boolean;
  reasons: string[];
};

export type ExecAuthorizationGroup = {
  candidates: ExecAuthorizationCandidate[];
  opToNext?: ShellChainOperator | null;
};

export type ExecAuthorizationPlan =
  | { ok: true; groups: ExecAuthorizationGroup[] }
  | { ok: false; reason?: string };

export function canUseReusableWrapperPayloadCandidates(_segments: ExecCommandSegment[]): boolean {
  return false;
}

export async function planShellAuthorization(_params: {
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
}): Promise<ExecAuthorizationPlan> {
  return { ok: false, reason: "not implemented" };
}

export async function planExecAuthorization(_params: {
  analysis: unknown;
  command?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
}): Promise<ExecAuthorizationPlan> {
  return { ok: false, reason: "not implemented" };
}

export const POSITIONAL_CARRIER_BLOCKED_EXECUTABLES: Set<string> = new Set();
