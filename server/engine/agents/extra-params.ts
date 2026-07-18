/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/extra-params.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveExtraParams(..._args: unknown[]): unknown {
  throw new Error("resolveExtraParams not implemented (openclaw stub)");
}
export function resolvePreparedExtraParams(..._args: unknown[]): unknown {
  throw new Error("resolvePreparedExtraParams not implemented (openclaw stub)");
}
export function resolveAgentTransportOverride(..._args: unknown[]): unknown {
  throw new Error("resolveAgentTransportOverride not implemented (openclaw stub)");
}
export function resolveExplicitSettingsTransport(..._args: unknown[]): unknown {
  throw new Error("resolveExplicitSettingsTransport not implemented (openclaw stub)");
}
export function applyExtraParamsToAgent(..._args: unknown[]): unknown {
  throw new Error("applyExtraParamsToAgent not implemented (openclaw stub)");
}
export const testing_extra_params: unknown = undefined;
