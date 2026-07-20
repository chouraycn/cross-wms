/**
 * 移植自 openclaw/src/agents/sandbox/fs-bridge-mutation-helper.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function buildPinnedWritePlan(..._args: unknown[]): unknown {
  return undefined;
}
export function buildPinnedMkdirpPlan(..._args: unknown[]): unknown {
  return undefined;
}
export function buildPinnedRemovePlan(..._args: unknown[]): unknown {
  return undefined;
}
export function buildPinnedRenamePlan(..._args: unknown[]): unknown {
  return undefined;
}
export const SANDBOX_PINNED_MUTATION_PYTHON_CANDIDATES: unknown = undefined;
export const SANDBOX_PINNED_MUTATION_PYTHON: unknown = undefined;
