/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/model.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveModelWithRegistry(..._args: unknown[]): unknown {
  throw new Error("resolveModelWithRegistry not implemented (openclaw stub)");
}
export function resolveModel(..._args: unknown[]): unknown {
  throw new Error("resolveModel not implemented (openclaw stub)");
}
export function resolveModelAsync(..._args: unknown[]): unknown {
  throw new Error("resolveModelAsync not implemented (openclaw stub)");
}
