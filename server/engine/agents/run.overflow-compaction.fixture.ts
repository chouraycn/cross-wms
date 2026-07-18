/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run.overflow-compaction.fixture.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function makeOverflowError(..._args: unknown[]): unknown {
  throw new Error("makeOverflowError not implemented (openclaw stub)");
}
export function makeCompactionSuccess(..._args: unknown[]): unknown {
  throw new Error("makeCompactionSuccess not implemented (openclaw stub)");
}
export function makeAttemptResult(..._args: unknown[]): unknown {
  throw new Error("makeAttemptResult not implemented (openclaw stub)");
}
export function mockOverflowRetrySuccess(..._args: unknown[]): unknown {
  throw new Error("mockOverflowRetrySuccess not implemented (openclaw stub)");
}
export function queueOverflowAttemptWithOversizedToolOutput(..._args: unknown[]): unknown {
  throw new Error("queueOverflowAttemptWithOversizedToolOutput not implemented (openclaw stub)");
}
