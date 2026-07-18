/**
 * 移植自 openclaw/src/agents/transport-stream-shared.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type WritableTransportStream = unknown;
export function sanitizeTransportPayloadText(..._args: unknown[]): unknown {
  throw new Error("sanitizeTransportPayloadText not implemented (openclaw stub)");
}
export function sanitizeNonEmptyTransportPayloadText(..._args: unknown[]): unknown {
  throw new Error("sanitizeNonEmptyTransportPayloadText not implemented (openclaw stub)");
}
export function coerceTransportToolCallArguments(..._args: unknown[]): unknown {
  throw new Error("coerceTransportToolCallArguments not implemented (openclaw stub)");
}
export function mergeTransportHeaders(..._args: unknown[]): unknown {
  throw new Error("mergeTransportHeaders not implemented (openclaw stub)");
}
export function mergeTransportMetadata(..._args: unknown[]): unknown {
  throw new Error("mergeTransportMetadata not implemented (openclaw stub)");
}
export function createEmptyTransportUsage(..._args: unknown[]): unknown {
  throw new Error("createEmptyTransportUsage not implemented (openclaw stub)");
}
export function createWritableTransportEventStream(..._args: unknown[]): unknown {
  throw new Error("createWritableTransportEventStream not implemented (openclaw stub)");
}
export function finalizeTransportStream(..._args: unknown[]): unknown {
  throw new Error("finalizeTransportStream not implemented (openclaw stub)");
}
export function assignTransportErrorDetails(..._args: unknown[]): unknown {
  throw new Error("assignTransportErrorDetails not implemented (openclaw stub)");
}
export function failTransportStream(..._args: unknown[]): unknown {
  throw new Error("failTransportStream not implemented (openclaw stub)");
}
