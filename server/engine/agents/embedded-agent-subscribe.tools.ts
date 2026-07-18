/**
 * 移植自 openclaw/src/agents/embedded-agent-subscribe.tools.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { isToolResultError } from "./tool-result-error.js";
export function buildToolLifecycleErrorResult(..._args: unknown[]): unknown {
  throw new Error("buildToolLifecycleErrorResult not implemented (openclaw stub)");
}
export function sanitizeToolArgs(..._args: unknown[]): unknown {
  throw new Error("sanitizeToolArgs not implemented (openclaw stub)");
}
export function sanitizeToolResult(..._args: unknown[]): unknown {
  throw new Error("sanitizeToolResult not implemented (openclaw stub)");
}
export function extractToolResultText(..._args: unknown[]): unknown {
  throw new Error("extractToolResultText not implemented (openclaw stub)");
}
export function collectMessagingMediaUrlsFromRecord(..._args: unknown[]): unknown {
  throw new Error("collectMessagingMediaUrlsFromRecord not implemented (openclaw stub)");
}
export function collectMessagingMediaUrlsFromToolResult(..._args: unknown[]): unknown {
  throw new Error("collectMessagingMediaUrlsFromToolResult not implemented (openclaw stub)");
}
export function extractMessagingToolSourceReplyPayload(..._args: unknown[]): unknown {
  throw new Error("extractMessagingToolSourceReplyPayload not implemented (openclaw stub)");
}
export function isToolResultMediaTrusted(..._args: unknown[]): unknown {
  throw new Error("isToolResultMediaTrusted not implemented (openclaw stub)");
}
export function filterToolResultMediaUrls(..._args: unknown[]): unknown {
  throw new Error("filterToolResultMediaUrls not implemented (openclaw stub)");
}
export function extractToolResultMediaArtifact(..._args: unknown[]): unknown {
  throw new Error("extractToolResultMediaArtifact not implemented (openclaw stub)");
}
export function extractToolErrorCode(..._args: unknown[]): unknown {
  throw new Error("extractToolErrorCode not implemented (openclaw stub)");
}
export function isToolResultTimedOut(..._args: unknown[]): unknown {
  throw new Error("isToolResultTimedOut not implemented (openclaw stub)");
}
export function extractToolErrorMessage(..._args: unknown[]): unknown {
  throw new Error("extractToolErrorMessage not implemented (openclaw stub)");
}
export function extractMessagingToolSend(..._args: unknown[]): unknown {
  throw new Error("extractMessagingToolSend not implemented (openclaw stub)");
}
export function extractMessagingToolSendResult(..._args: unknown[]): unknown {
  throw new Error("extractMessagingToolSendResult not implemented (openclaw stub)");
}
