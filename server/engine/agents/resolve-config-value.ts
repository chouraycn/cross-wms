/**
 * 移植自 openclaw/src/agents/sessions/resolve-config-value.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveConfigValue(..._args: unknown[]): unknown {
  throw new Error("resolveConfigValue not implemented (openclaw stub)");
}
export function resolveConfigValueUncached(..._args: unknown[]): unknown {
  throw new Error("resolveConfigValueUncached not implemented (openclaw stub)");
}
export function resolveConfigValueOrThrow(..._args: unknown[]): unknown {
  throw new Error("resolveConfigValueOrThrow not implemented (openclaw stub)");
}
export function resolveHeadersOrThrow(..._args: unknown[]): unknown {
  throw new Error("resolveHeadersOrThrow not implemented (openclaw stub)");
}
export function clearConfigValueCache(..._args: unknown[]): unknown {
  throw new Error("clearConfigValueCache not implemented (openclaw stub)");
}
