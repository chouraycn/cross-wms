/**
 * 移植自 openclaw/src/agents/bash-process-registry.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ProcessSession = unknown;
export function createSessionSlug(..._args: unknown[]): unknown {
  throw new Error("createSessionSlug not implemented (openclaw stub)");
}
export function addSession(..._args: unknown[]): unknown {
  throw new Error("addSession not implemented (openclaw stub)");
}
export function getSession(..._args: unknown[]): unknown {
  throw new Error("getSession not implemented (openclaw stub)");
}
export function getFinishedSession(..._args: unknown[]): unknown {
  throw new Error("getFinishedSession not implemented (openclaw stub)");
}
export function deleteSession(..._args: unknown[]): unknown {
  throw new Error("deleteSession not implemented (openclaw stub)");
}
export function appendOutput(..._args: unknown[]): unknown {
  throw new Error("appendOutput not implemented (openclaw stub)");
}
export function drainSession(..._args: unknown[]): unknown {
  throw new Error("drainSession not implemented (openclaw stub)");
}
export function markExited(..._args: unknown[]): unknown {
  throw new Error("markExited not implemented (openclaw stub)");
}
export function markBackgrounded(..._args: unknown[]): unknown {
  throw new Error("markBackgrounded not implemented (openclaw stub)");
}
export function tail(..._args: unknown[]): unknown {
  throw new Error("tail not implemented (openclaw stub)");
}
export function listRunningSessions(..._args: unknown[]): unknown {
  throw new Error("listRunningSessions not implemented (openclaw stub)");
}
export function listFinishedSessions(..._args: unknown[]): unknown {
  throw new Error("listFinishedSessions not implemented (openclaw stub)");
}
export function resetProcessRegistryForTests(..._args: unknown[]): unknown {
  throw new Error("resetProcessRegistryForTests not implemented (openclaw stub)");
}
export function setJobTtlMs(..._args: unknown[]): unknown {
  throw new Error("setJobTtlMs not implemented (openclaw stub)");
}
