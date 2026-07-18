/**
 * 移植自 openclaw/src/agents/provider-transport-stream.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isTransportAwareApiSupported(..._args: unknown[]): unknown {
  throw new Error("isTransportAwareApiSupported not implemented (openclaw stub)");
}
export function resolveTransportAwareSimpleApi(..._args: unknown[]): unknown {
  throw new Error("resolveTransportAwareSimpleApi not implemented (openclaw stub)");
}
export function createTransportAwareStreamFnForModel(..._args: unknown[]): unknown {
  throw new Error("createTransportAwareStreamFnForModel not implemented (openclaw stub)");
}
export function createOpenClawTransportStreamFnForModel(..._args: unknown[]): unknown {
  throw new Error("createOpenClawTransportStreamFnForModel not implemented (openclaw stub)");
}
export function createBoundaryAwareStreamFnForModel(..._args: unknown[]): unknown {
  throw new Error("createBoundaryAwareStreamFnForModel not implemented (openclaw stub)");
}
export function prepareTransportAwareSimpleModel(..._args: unknown[]): unknown {
  throw new Error("prepareTransportAwareSimpleModel not implemented (openclaw stub)");
}
export function buildTransportAwareSimpleStreamFn(..._args: unknown[]): unknown {
  throw new Error("buildTransportAwareSimpleStreamFn not implemented (openclaw stub)");
}
