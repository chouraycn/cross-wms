/**
 * 移植自 openclaw/src/agents/bash-process-registry.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ProcessSession = unknown;
export function createSessionSlug(..._args: any[]): any {
  return undefined;
}
export function addSession(..._args: any[]): any {
  return undefined;
}
export function getSession(..._args: any[]): any {
  return undefined;
}
export function getFinishedSession(..._args: any[]): any {
  return undefined;
}
export function deleteSession(..._args: any[]): any {
  return undefined;
}
export function appendOutput(..._args: any[]): any {
  return undefined;
}
export function drainSession(..._args: any[]): any {
  return undefined;
}
export function markExited(..._args: any[]): any {
  return undefined;
}
export function markBackgrounded(..._args: any[]): any {
  return undefined;
}
export function tail(..._args: any[]): any {
  return undefined;
}
export function listRunningSessions(..._args: any[]): any {
  return [];
}
export function listFinishedSessions(..._args: any[]): any {
  return [];
}
export function resetProcessRegistryForTests(..._args: any[]): any {
  return undefined;
}
export function setJobTtlMs(..._args: any[]): any {
  return undefined;
}
