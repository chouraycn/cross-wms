/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run-state.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type EmbeddedAgentQueueHandle = unknown;
export type EmbeddedAgentQueueMessageOptions = unknown;
export type ActiveEmbeddedRunSnapshot = unknown;
export type EmbeddedRunWaiter = unknown;
export type AbandonedEmbeddedRun = unknown;
export function getActiveEmbeddedRunCount(..._args: unknown[]): unknown {
  throw new Error("getActiveEmbeddedRunCount not implemented (openclaw stub)");
}
export function listActiveEmbeddedRunSessionKeys(..._args: unknown[]): unknown {
  throw new Error("listActiveEmbeddedRunSessionKeys not implemented (openclaw stub)");
}
export function listActiveEmbeddedRunSessionIds(..._args: unknown[]): unknown {
  throw new Error("listActiveEmbeddedRunSessionIds not implemented (openclaw stub)");
}
export function resolveActiveEmbeddedRunSessionId(..._args: unknown[]): unknown {
  throw new Error("resolveActiveEmbeddedRunSessionId not implemented (openclaw stub)");
}
export const ACTIVE_EMBEDDED_RUNS: unknown = undefined;
export const ACTIVE_EMBEDDED_RUN_SNAPSHOTS: unknown = undefined;
export const ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY: unknown = undefined;
export const ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE: unknown = undefined;
export const ABANDONED_EMBEDDED_RUNS_BY_SESSION_ID: unknown = undefined;
export const ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_KEY: unknown = undefined;
export const ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_FILE: unknown = undefined;
export const EMBEDDED_RUN_WAITERS: unknown = undefined;
