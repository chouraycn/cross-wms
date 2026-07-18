/**
 * 移植自 openclaw/src/agents/subagent-control.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ResolvedSubagentController = unknown;
export const DEFAULT_RECENT_MINUTES: unknown = undefined;
export const MAX_RECENT_MINUTES: unknown = undefined;
export const testing: unknown = undefined;
export function resolveSubagentController(..._args: unknown[]): unknown {
  throw new Error("resolveSubagentController not implemented (openclaw stub)");
}
export function listControlledSubagentRuns(..._args: unknown[]): unknown {
  throw new Error("listControlledSubagentRuns not implemented (openclaw stub)");
}
export async function killAllControlledSubagentRuns(..._args: unknown[]): Promise<unknown> {
  throw new Error("killAllControlledSubagentRuns not implemented (openclaw stub)");
}
export async function killControlledSubagentRun(..._args: unknown[]): Promise<unknown> {
  throw new Error("killControlledSubagentRun not implemented (openclaw stub)");
}
export async function killSubagentRunAdmin(..._args: unknown[]): Promise<unknown> {
  throw new Error("killSubagentRunAdmin not implemented (openclaw stub)");
}
export async function steerControlledSubagentRun(..._args: unknown[]): Promise<unknown> {
  throw new Error("steerControlledSubagentRun not implemented (openclaw stub)");
}
export async function sendControlledSubagentMessage(..._args: unknown[]): Promise<unknown> {
  throw new Error("sendControlledSubagentMessage not implemented (openclaw stub)");
}
