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
  return undefined;
}
export async function readSubagentOutput(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export async function readLatestSubagentOutputWithRetry(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export async function waitForSubagentRunOutcome(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export function applySubagentWaitOutcome(..._args: unknown[]): unknown {
  return undefined;
}
export async function captureSubagentCompletionReply(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export function buildChildCompletionFindings(..._args: unknown[]): unknown {
  return undefined;
}
export function dedupeLatestChildCompletionRows(..._args: unknown[]): unknown {
  return undefined;
}
export function filterCurrentDirectChildCompletionRows(..._args: unknown[]): unknown {
  return undefined;
}
export async function buildCompactAnnounceStatsLine(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
