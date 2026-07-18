/**
 * 移植自 openclaw/src/agents/schema/typebox.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function channelTargetSchema(..._args: unknown[]): unknown {
  throw new Error("channelTargetSchema not implemented (openclaw stub)");
}
export function channelTargetsSchema(..._args: unknown[]): unknown {
  throw new Error("channelTargetsSchema not implemented (openclaw stub)");
}
export function optionalFiniteNumberSchema(..._args: unknown[]): unknown {
  throw new Error("optionalFiniteNumberSchema not implemented (openclaw stub)");
}
export function optionalPositiveIntegerSchema(..._args: unknown[]): unknown {
  throw new Error("optionalPositiveIntegerSchema not implemented (openclaw stub)");
}
export function optionalNonNegativeIntegerSchema(..._args: unknown[]): unknown {
  throw new Error("optionalNonNegativeIntegerSchema not implemented (openclaw stub)");
}
