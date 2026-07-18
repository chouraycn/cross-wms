/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/assistant-failover.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isShortWindowRateLimitMessage(..._args: unknown[]): unknown {
  throw new Error("isShortWindowRateLimitMessage not implemented (openclaw stub)");
}
export function handleAssistantFailover(..._args: unknown[]): unknown {
  throw new Error("handleAssistantFailover not implemented (openclaw stub)");
}
