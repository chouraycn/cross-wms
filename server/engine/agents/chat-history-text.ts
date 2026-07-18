/**
 * 移植自 openclaw/src/agents/tools/chat-history-text.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function stripToolMessages(..._args: unknown[]): unknown {
  throw new Error("stripToolMessages not implemented (openclaw stub)");
}
export function sanitizeTextContent(..._args: unknown[]): unknown {
  throw new Error("sanitizeTextContent not implemented (openclaw stub)");
}
export function extractAssistantText(..._args: unknown[]): unknown {
  throw new Error("extractAssistantText not implemented (openclaw stub)");
}
