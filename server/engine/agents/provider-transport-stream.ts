/**
 * 移植自 openclaw/src/agents/provider-transport-stream.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isTransportAwareApiSupported(..._args: unknown[]): unknown {
  return false;
}
export function resolveTransportAwareSimpleApi(..._args: unknown[]): unknown {
  return undefined;
}
export function createTransportAwareStreamFnForModel(..._args: unknown[]): unknown {
  return undefined;
}
export function createOpenClawTransportStreamFnForModel(..._args: unknown[]): unknown {
  return undefined;
}
export function createBoundaryAwareStreamFnForModel(..._args: unknown[]): unknown {
  return undefined;
}
export function prepareTransportAwareSimpleModel(..._args: unknown[]): unknown {
  return undefined;
}
export function buildTransportAwareSimpleStreamFn(..._args: unknown[]): unknown {
  return undefined;
}
