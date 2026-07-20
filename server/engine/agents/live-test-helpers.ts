/**
 * 移植自 openclaw/src/agents/live-test-helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type CompleteSimpleContent = unknown;
export function isLiveTestEnabled(..._args: unknown[]): unknown {
  return false;
}
export function isLiveProfileKeyModeEnabled(..._args: unknown[]): unknown {
  return false;
}
export function requiresLiveProfileCredential(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveLiveCredentialPrecedence(..._args: unknown[]): unknown {
  return undefined;
}
export function createSingleUserPromptMessage(..._args: unknown[]): unknown {
  return undefined;
}
export function extractNonEmptyAssistantText(..._args: unknown[]): unknown {
  return undefined;
}
export function logLiveProgress(..._args: unknown[]): unknown {
  return undefined;
}
export async function completeSimpleWithTimeout(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
