/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/tool-result-truncation.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ToolResultPromptProjectionState = unknown;
export function truncateToolResultText(..._args: any[]): any {
  return undefined;
}
export function calculateMaxToolResultChars(..._args: any[]): any {
  return undefined;
}
export function resolveAutoLiveToolResultMaxChars(..._args: any[]): any {
  return undefined;
}
export function calculateMaxToolResultCharsWithCap(..._args: any[]): any {
  return undefined;
}
export function resolveLiveToolResultMaxChars(..._args: any[]): any {
  return undefined;
}
export function getToolResultTextLength(..._args: any[]): any {
  return undefined;
}
export function truncateToolResultMessage(..._args: any[]): any {
  return undefined;
}
export function truncateOversizedToolResultsInMessages(..._args: any[]): any {
  return undefined;
}
export function createToolResultPromptProjectionState(..._args: any[]): any {
  return undefined;
}
export function estimateToolResultReductionPotential(..._args: any[]): any {
  return undefined;
}
export function truncateOversizedToolResultsInSessionManager(..._args: any[]): any {
  return undefined;
}
export function truncateOversizedToolResultsInSession(..._args: any[]): any {
  return undefined;
}
export function sessionLikelyHasOversizedToolResults(..._args: any[]): any {
  return undefined;
}
export const DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS: any = undefined;
