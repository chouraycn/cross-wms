/**
 * 移植自 openclaw/src/agents/cli-credentials.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ClaudeCliCredential = unknown;
export type CodexCliCredential = unknown;
export type MiniMaxCliCredential = unknown;
export type GeminiCliCredential = unknown;
export function resetCliCredentialCachesForTest(..._args: unknown[]): unknown {
  return undefined;
}
export function readClaudeCliCredentials(..._args: unknown[]): unknown {
  return undefined;
}
export function readClaudeCliCredentialsCached(..._args: unknown[]): unknown {
  return undefined;
}
export function readCodexCliCredentials(..._args: unknown[]): unknown {
  return undefined;
}
export function readCodexCliCredentialsCached(..._args: unknown[]): unknown {
  return undefined;
}
export function readMiniMaxCliCredentialsCached(..._args: unknown[]): unknown {
  return undefined;
}
export function readGeminiCliCredentialsCached(..._args: unknown[]): unknown {
  return undefined;
}
