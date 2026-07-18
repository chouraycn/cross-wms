/**
 * 移植自 openclaw/src/agents/model-auth-runtime-shared.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ResolvedProviderAuth = unknown;
export class ProviderAuthError {
  constructor(..._args: unknown[]) {
    throw new Error("ProviderAuthError not implemented (openclaw stub)");
  }
}
export class MissingProviderAuthError {
  constructor(..._args: unknown[]) {
    throw new Error("MissingProviderAuthError not implemented (openclaw stub)");
  }
}
export function isProviderAuthError(..._args: unknown[]): unknown {
  throw new Error("isProviderAuthError not implemented (openclaw stub)");
}
export function isMissingProviderAuthError(..._args: unknown[]): unknown {
  throw new Error("isMissingProviderAuthError not implemented (openclaw stub)");
}
export function resolveAwsSdkEnvVarName(..._args: unknown[]): unknown {
  throw new Error("resolveAwsSdkEnvVarName not implemented (openclaw stub)");
}
export function formatMissingAuthError(..._args: unknown[]): unknown {
  throw new Error("formatMissingAuthError not implemented (openclaw stub)");
}
export function requireApiKey(..._args: unknown[]): unknown {
  throw new Error("requireApiKey not implemented (openclaw stub)");
}
