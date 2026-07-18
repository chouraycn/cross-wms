/**
 * 移植自 openclaw/src/agents/anthropic-payload-policy.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveAnthropicEphemeralCacheControl(..._args: unknown[]): unknown {
  throw new Error("resolveAnthropicEphemeralCacheControl not implemented (openclaw stub)");
}
export function resolveAnthropicPayloadPolicy(..._args: unknown[]): unknown {
  throw new Error("resolveAnthropicPayloadPolicy not implemented (openclaw stub)");
}
export function applyAnthropicPayloadPolicyToParams(..._args: unknown[]): unknown {
  throw new Error("applyAnthropicPayloadPolicyToParams not implemented (openclaw stub)");
}
export function applyAnthropicEphemeralCacheControlMarkers(..._args: unknown[]): unknown {
  throw new Error("applyAnthropicEphemeralCacheControlMarkers not implemented (openclaw stub)");
}
