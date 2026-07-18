/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/compaction-safety-timeout.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveCompactionTimeoutMs(..._args: unknown[]): unknown {
  throw new Error("resolveCompactionTimeoutMs not implemented (openclaw stub)");
}
export function compactWithSafetyTimeout(..._args: unknown[]): unknown {
  throw new Error("compactWithSafetyTimeout not implemented (openclaw stub)");
}
export function compactContextEngineWithSafetyTimeout(..._args: unknown[]): unknown {
  throw new Error("compactContextEngineWithSafetyTimeout not implemented (openclaw stub)");
}
