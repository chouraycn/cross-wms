/**
 * 移植自 openclaw/src/agents/bash-tools.shared.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type BashSandboxConfig = unknown;
export function buildSandboxEnv(..._args: unknown[]): unknown {
  throw new Error("buildSandboxEnv not implemented (openclaw stub)");
}
export function coerceEnv(..._args: unknown[]): unknown {
  throw new Error("coerceEnv not implemented (openclaw stub)");
}
export function buildDockerExecArgs(..._args: unknown[]): unknown {
  throw new Error("buildDockerExecArgs not implemented (openclaw stub)");
}
export async function resolveSandboxWorkdir(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveSandboxWorkdir not implemented (openclaw stub)");
}
export function resolveWorkdir(..._args: unknown[]): unknown {
  throw new Error("resolveWorkdir not implemented (openclaw stub)");
}
export function clampWithDefault(..._args: unknown[]): unknown {
  throw new Error("clampWithDefault not implemented (openclaw stub)");
}
export function readEnvInt(..._args: unknown[]): unknown {
  throw new Error("readEnvInt not implemented (openclaw stub)");
}
export function chunkString(..._args: unknown[]): unknown {
  throw new Error("chunkString not implemented (openclaw stub)");
}
export function truncateMiddle(..._args: unknown[]): unknown {
  throw new Error("truncateMiddle not implemented (openclaw stub)");
}
export function sliceLogLines(..._args: unknown[]): unknown {
  throw new Error("sliceLogLines not implemented (openclaw stub)");
}
export function deriveSessionName(..._args: unknown[]): unknown {
  throw new Error("deriveSessionName not implemented (openclaw stub)");
}
export function pad(..._args: unknown[]): unknown {
  throw new Error("pad not implemented (openclaw stub)");
}
