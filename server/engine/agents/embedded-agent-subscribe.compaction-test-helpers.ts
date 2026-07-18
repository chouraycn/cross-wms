/**
 * 移植自 openclaw/src/agents/embedded-agent-subscribe.compaction-test-helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function seedSessionStore(..._args: unknown[]): unknown {
  throw new Error("seedSessionStore not implemented (openclaw stub)");
}
export function readCompactionCount(..._args: unknown[]): unknown {
  throw new Error("readCompactionCount not implemented (openclaw stub)");
}
export function waitForCompactionCount(..._args: unknown[]): unknown {
  throw new Error("waitForCompactionCount not implemented (openclaw stub)");
}
