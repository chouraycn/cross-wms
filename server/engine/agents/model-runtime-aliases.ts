/**
 * 移植自 openclaw/src/agents/model-runtime-aliases.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isCliRuntimeProvider(..._args: unknown[]): unknown {
  throw new Error("isCliRuntimeProvider not implemented (openclaw stub)");
}
export function isCliRuntimeAlias(..._args: unknown[]): unknown {
  throw new Error("isCliRuntimeAlias not implemented (openclaw stub)");
}
export function isCliRuntimeAliasForProvider(..._args: unknown[]): unknown {
  throw new Error("isCliRuntimeAliasForProvider not implemented (openclaw stub)");
}
export function areRuntimeModelRefsEquivalent(..._args: unknown[]): unknown {
  throw new Error("areRuntimeModelRefsEquivalent not implemented (openclaw stub)");
}
export function shouldPreferActiveRuntimeAliasAuthLabel(..._args: unknown[]): unknown {
  throw new Error("shouldPreferActiveRuntimeAliasAuthLabel not implemented (openclaw stub)");
}
export function resolveCliRuntimeExecutionProvider(..._args: unknown[]): unknown {
  throw new Error("resolveCliRuntimeExecutionProvider not implemented (openclaw stub)");
}
