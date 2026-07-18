/**
 * 移植自 openclaw/src/agents/subagent-announce-output.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SubagentRunOutcome = unknown;
export const testing: unknown = undefined;
export function withSubagentOutcomeTiming(..._args: unknown[]): unknown {
  throw new Error("withSubagentOutcomeTiming not implemented (openclaw stub)");
}
export async function readSubagentOutput(..._args: unknown[]): Promise<unknown> {
  throw new Error("readSubagentOutput not implemented (openclaw stub)");
}
export async function readLatestSubagentOutputWithRetry(..._args: unknown[]): Promise<unknown> {
  throw new Error("readLatestSubagentOutputWithRetry not implemented (openclaw stub)");
}
export async function waitForSubagentRunOutcome(..._args: unknown[]): Promise<unknown> {
  throw new Error("waitForSubagentRunOutcome not implemented (openclaw stub)");
}
export function applySubagentWaitOutcome(..._args: unknown[]): unknown {
  throw new Error("applySubagentWaitOutcome not implemented (openclaw stub)");
}
export async function captureSubagentCompletionReply(..._args: unknown[]): Promise<unknown> {
  throw new Error("captureSubagentCompletionReply not implemented (openclaw stub)");
}
export function buildChildCompletionFindings(..._args: unknown[]): unknown {
  throw new Error("buildChildCompletionFindings not implemented (openclaw stub)");
}
export function dedupeLatestChildCompletionRows(..._args: unknown[]): unknown {
  throw new Error("dedupeLatestChildCompletionRows not implemented (openclaw stub)");
}
export function filterCurrentDirectChildCompletionRows(..._args: unknown[]): unknown {
  throw new Error("filterCurrentDirectChildCompletionRows not implemented (openclaw stub)");
}
export async function buildCompactAnnounceStatsLine(..._args: unknown[]): Promise<unknown> {
  throw new Error("buildCompactAnnounceStatsLine not implemented (openclaw stub)");
}
