/**
 * 移植自 openclaw/src/agents/subagent-announce-output.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SubagentRunOutcome = unknown;
export const testing: any = undefined;
export function withSubagentOutcomeTiming(..._args: any[]): any {
  return undefined;
}
export async function readSubagentOutput(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
export async function readLatestSubagentOutputWithRetry(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
export async function waitForSubagentRunOutcome(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
export function applySubagentWaitOutcome(..._args: any[]): any {
  return undefined;
}
export async function captureSubagentCompletionReply(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
export function buildChildCompletionFindings(..._args: any[]): any {
  return undefined;
}
export function dedupeLatestChildCompletionRows(..._args: any[]): any {
  return undefined;
}
export function filterCurrentDirectChildCompletionRows(..._args: any[]): any {
  return undefined;
}
export async function buildCompactAnnounceStatsLine(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
