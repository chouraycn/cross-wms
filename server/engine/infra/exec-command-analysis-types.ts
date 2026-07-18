// 移植自 openclaw/src/infra/exec-command-analysis-types.ts
// 共享的 exec 审批分析类型。
import type { CommandResolution } from "./exec-command-resolution.js";

export type ExecCommandSegment = {
  raw: string;
  argv: string[];
  sourceArgv?: string[];
  resolution: CommandResolution | null;
};

export type ExecCommandAnalysis = {
  ok: boolean;
  reason?: string;
  segments: ExecCommandSegment[];
  chains?: ExecCommandSegment[][];
};

export type ShellChainOperator = "&&" | "||" | ";" | "&";
