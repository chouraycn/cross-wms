/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/tool-result-truncation.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ToolResultPromptProjectionState = unknown;
export function truncateToolResultText(..._args: unknown[]): unknown {
  throw new Error("truncateToolResultText not implemented (openclaw stub)");
}
export function calculateMaxToolResultChars(..._args: unknown[]): unknown {
  throw new Error("calculateMaxToolResultChars not implemented (openclaw stub)");
}
export function resolveAutoLiveToolResultMaxChars(..._args: unknown[]): unknown {
  throw new Error("resolveAutoLiveToolResultMaxChars not implemented (openclaw stub)");
}
export function calculateMaxToolResultCharsWithCap(..._args: unknown[]): unknown {
  throw new Error("calculateMaxToolResultCharsWithCap not implemented (openclaw stub)");
}
export function resolveLiveToolResultMaxChars(..._args: unknown[]): unknown {
  throw new Error("resolveLiveToolResultMaxChars not implemented (openclaw stub)");
}
export function getToolResultTextLength(..._args: unknown[]): unknown {
  throw new Error("getToolResultTextLength not implemented (openclaw stub)");
}
export function truncateToolResultMessage(..._args: unknown[]): unknown {
  throw new Error("truncateToolResultMessage not implemented (openclaw stub)");
}
export function truncateOversizedToolResultsInMessages(..._args: unknown[]): unknown {
  throw new Error("truncateOversizedToolResultsInMessages not implemented (openclaw stub)");
}
export function createToolResultPromptProjectionState(..._args: unknown[]): unknown {
  throw new Error("createToolResultPromptProjectionState not implemented (openclaw stub)");
}
export function estimateToolResultReductionPotential(..._args: unknown[]): unknown {
  throw new Error("estimateToolResultReductionPotential not implemented (openclaw stub)");
}
export function truncateOversizedToolResultsInSessionManager(..._args: unknown[]): unknown {
  throw new Error("truncateOversizedToolResultsInSessionManager not implemented (openclaw stub)");
}
export function truncateOversizedToolResultsInSession(..._args: unknown[]): unknown {
  throw new Error("truncateOversizedToolResultsInSession not implemented (openclaw stub)");
}
export function sessionLikelyHasOversizedToolResults(..._args: unknown[]): unknown {
  throw new Error("sessionLikelyHasOversizedToolResults not implemented (openclaw stub)");
}
export const DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS: unknown = undefined;
