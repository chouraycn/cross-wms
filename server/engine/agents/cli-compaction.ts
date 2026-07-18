/**
 * 移植自 openclaw/src/agents/command/cli-compaction.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function setCliCompactionTestDeps(..._args: unknown[]): unknown {
  throw new Error("setCliCompactionTestDeps not implemented (openclaw stub)");
}
export function resetCliCompactionTestDeps(..._args: unknown[]): unknown {
  throw new Error("resetCliCompactionTestDeps not implemented (openclaw stub)");
}
export function runCliTurnCompactionLifecycle(..._args: unknown[]): unknown {
  throw new Error("runCliTurnCompactionLifecycle not implemented (openclaw stub)");
}
