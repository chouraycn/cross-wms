/**
 * 移植自 openclaw/src/agents/sessions/model-resolver.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ScopedModel = unknown;
export type ParsedModelResult = unknown;
export type ResolveCliModelResult = unknown;
export type InitialModelResult = unknown;
export function findExactModelReferenceMatch(..._args: unknown[]): unknown {
  throw new Error("findExactModelReferenceMatch not implemented (openclaw stub)");
}
export function parseModelPattern(..._args: unknown[]): unknown {
  throw new Error("parseModelPattern not implemented (openclaw stub)");
}
export function resolveModelScope(..._args: unknown[]): unknown {
  throw new Error("resolveModelScope not implemented (openclaw stub)");
}
export function resolveCliModel(..._args: unknown[]): unknown {
  throw new Error("resolveCliModel not implemented (openclaw stub)");
}
export function findInitialModel(..._args: unknown[]): unknown {
  throw new Error("findInitialModel not implemented (openclaw stub)");
}
export function restoreModelFromSession(..._args: unknown[]): unknown {
  throw new Error("restoreModelFromSession not implemented (openclaw stub)");
}
