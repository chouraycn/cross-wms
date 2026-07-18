/**
 * 移植自 openclaw/src/agents/live-test-helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type CompleteSimpleContent = unknown;
export function isLiveTestEnabled(..._args: unknown[]): unknown {
  throw new Error("isLiveTestEnabled not implemented (openclaw stub)");
}
export function isLiveProfileKeyModeEnabled(..._args: unknown[]): unknown {
  throw new Error("isLiveProfileKeyModeEnabled not implemented (openclaw stub)");
}
export function requiresLiveProfileCredential(..._args: unknown[]): unknown {
  throw new Error("requiresLiveProfileCredential not implemented (openclaw stub)");
}
export function resolveLiveCredentialPrecedence(..._args: unknown[]): unknown {
  throw new Error("resolveLiveCredentialPrecedence not implemented (openclaw stub)");
}
export function createSingleUserPromptMessage(..._args: unknown[]): unknown {
  throw new Error("createSingleUserPromptMessage not implemented (openclaw stub)");
}
export function extractNonEmptyAssistantText(..._args: unknown[]): unknown {
  throw new Error("extractNonEmptyAssistantText not implemented (openclaw stub)");
}
export function logLiveProgress(..._args: unknown[]): unknown {
  throw new Error("logLiveProgress not implemented (openclaw stub)");
}
export async function completeSimpleWithTimeout(..._args: unknown[]): Promise<unknown> {
  throw new Error("completeSimpleWithTimeout not implemented (openclaw stub)");
}
