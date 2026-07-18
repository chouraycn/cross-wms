/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt.sessions-yield.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function waitForSessionsYieldAbortSettle(..._args: unknown[]): unknown {
  throw new Error("waitForSessionsYieldAbortSettle not implemented (openclaw stub)");
}
export function createYieldAbortedResponse(..._args: unknown[]): unknown {
  throw new Error("createYieldAbortedResponse not implemented (openclaw stub)");
}
export function queueSessionsYieldInterruptMessage(..._args: unknown[]): unknown {
  throw new Error("queueSessionsYieldInterruptMessage not implemented (openclaw stub)");
}
export function persistSessionsYieldContextMessage(..._args: unknown[]): unknown {
  throw new Error("persistSessionsYieldContextMessage not implemented (openclaw stub)");
}
export function stripSessionsYieldArtifacts(..._args: unknown[]): unknown {
  throw new Error("stripSessionsYieldArtifacts not implemented (openclaw stub)");
}
