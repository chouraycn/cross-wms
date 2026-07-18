/**
 * 移植自 openclaw/src/agents/agent-tools.policy.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveSubagentToolPolicyForSession(..._args: unknown[]): unknown {
  throw new Error("resolveSubagentToolPolicyForSession not implemented (openclaw stub)");
}
export function resolveInheritedToolPolicyForSession(..._args: unknown[]): unknown {
  throw new Error("resolveInheritedToolPolicyForSession not implemented (openclaw stub)");
}
export function filterToolsByPolicy(..._args: unknown[]): unknown {
  throw new Error("filterToolsByPolicy not implemented (openclaw stub)");
}
export function resolveConfiguredToolPolicies(..._args: unknown[]): unknown {
  throw new Error("resolveConfiguredToolPolicies not implemented (openclaw stub)");
}
export function resolveTrustedGroupId(..._args: unknown[]): unknown {
  throw new Error("resolveTrustedGroupId not implemented (openclaw stub)");
}
export function resolveEffectiveToolPolicy(..._args: unknown[]): unknown {
  throw new Error("resolveEffectiveToolPolicy not implemented (openclaw stub)");
}
export function resolveGroupToolPolicy(..._args: unknown[]): unknown {
  throw new Error("resolveGroupToolPolicy not implemented (openclaw stub)");
}
