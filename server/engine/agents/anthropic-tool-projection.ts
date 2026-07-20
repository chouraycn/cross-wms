/**
 * 移植自 openclaw/src/agents/anthropic-tool-projection.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type AnthropicToolProjection = unknown;
export type AnthropicProjectedToolChoice = unknown;
export function projectAnthropicTools(..._args: unknown[]): unknown {
  return undefined;
}
export function reconcileAnthropicToolChoice(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveOriginalAnthropicToolName(..._args: unknown[]): unknown {
  return undefined;
}
