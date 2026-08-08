/**
 * 移植自 openclaw/src/agents/bash-tools.shared.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type BashSandboxConfig = unknown;
export function buildSandboxEnv(..._args: any[]): any {
  return undefined;
}
export function coerceEnv(..._args: any[]): any {
  return undefined;
}
export function buildDockerExecArgs(..._args: any[]): any {
  return undefined;
}
export async function resolveSandboxWorkdir(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
export function resolveWorkdir(..._args: any[]): any {
  return undefined;
}
export function clampWithDefault(..._args: any[]): any {
  return undefined;
}
export function readEnvInt(..._args: any[]): any {
  return undefined;
}
export function chunkString(..._args: any[]): any {
  return undefined;
}
export function truncateMiddle(..._args: any[]): any {
  return undefined;
}
export function sliceLogLines(..._args: any[]): any {
  return undefined;
}
export function deriveSessionName(..._args: any[]): any {
  return undefined;
}
export function pad(..._args: any[]): any {
  return undefined;
}
