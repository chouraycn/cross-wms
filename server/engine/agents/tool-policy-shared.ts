/**
 * 移植自 openclaw/src/agents/tool-policy-shared.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const TOOL_GROUPS: unknown = undefined;
export function normalizeToolName(..._args: unknown[]): unknown {
  throw new Error("normalizeToolName not implemented (openclaw stub)");
}
export function couldNormalizeToolNamePrefixToAllowedTool(..._args: unknown[]): unknown {
  throw new Error("couldNormalizeToolNamePrefixToAllowedTool not implemented (openclaw stub)");
}
export function normalizeToolList(..._args: unknown[]): unknown {
  throw new Error("normalizeToolList not implemented (openclaw stub)");
}
export function expandToolGroups(..._args: unknown[]): unknown {
  throw new Error("expandToolGroups not implemented (openclaw stub)");
}
export function resolveToolProfilePolicy(..._args: unknown[]): unknown {
  throw new Error("resolveToolProfilePolicy not implemented (openclaw stub)");
}
