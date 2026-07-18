/**
 * 移植自 openclaw/src/agents/live-model-switch.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { LiveSessionModelSwitchError } from "./live-model-switch-error.js";
export type LiveSessionModelSelection = unknown;
export function resolveLiveSessionModelSelection(..._args: unknown[]): unknown {
  throw new Error("resolveLiveSessionModelSelection not implemented (openclaw stub)");
}
export function hasDifferentLiveSessionModelSelection(..._args: unknown[]): unknown {
  throw new Error("hasDifferentLiveSessionModelSelection not implemented (openclaw stub)");
}
export function shouldSwitchToLiveModel(..._args: unknown[]): unknown {
  throw new Error("shouldSwitchToLiveModel not implemented (openclaw stub)");
}
export async function clearLiveModelSwitchPending(..._args: unknown[]): Promise<unknown> {
  throw new Error("clearLiveModelSwitchPending not implemented (openclaw stub)");
}
