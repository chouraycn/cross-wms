/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/model.inline-provider.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type InlineProviderConfig = unknown;
export function normalizeResolvedTransportApi(..._args: unknown[]): unknown {
  throw new Error("normalizeResolvedTransportApi not implemented (openclaw stub)");
}
export function sanitizeModelHeaders(..._args: unknown[]): unknown {
  throw new Error("sanitizeModelHeaders not implemented (openclaw stub)");
}
export function resolveProviderModelInput(..._args: unknown[]): unknown {
  throw new Error("resolveProviderModelInput not implemented (openclaw stub)");
}
export function buildInlineProviderModels(..._args: unknown[]): unknown {
  throw new Error("buildInlineProviderModels not implemented (openclaw stub)");
}
