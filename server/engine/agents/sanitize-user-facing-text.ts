/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/sanitize-user-facing-text.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function formatBillingErrorMessage(..._args: unknown[]): unknown {
  throw new Error("formatBillingErrorMessage not implemented (openclaw stub)");
}
export function formatRateLimitOrOverloadedErrorCopy(..._args: unknown[]): unknown {
  throw new Error("formatRateLimitOrOverloadedErrorCopy not implemented (openclaw stub)");
}
export function formatTransportErrorCopy(..._args: unknown[]): unknown {
  throw new Error("formatTransportErrorCopy not implemented (openclaw stub)");
}
export function formatDiskSpaceErrorCopy(..._args: unknown[]): unknown {
  throw new Error("formatDiskSpaceErrorCopy not implemented (openclaw stub)");
}
export function isInvalidStreamingEventOrderError(..._args: unknown[]): unknown {
  throw new Error("isInvalidStreamingEventOrderError not implemented (openclaw stub)");
}
export function isStreamingJsonParseError(..._args: unknown[]): unknown {
  throw new Error("isStreamingJsonParseError not implemented (openclaw stub)");
}
export function getApiErrorPayloadFingerprint(..._args: unknown[]): unknown {
  throw new Error("getApiErrorPayloadFingerprint not implemented (openclaw stub)");
}
export function isRawApiErrorPayload(..._args: unknown[]): unknown {
  throw new Error("isRawApiErrorPayload not implemented (openclaw stub)");
}
export function isLikelyHttpErrorText(..._args: unknown[]): unknown {
  throw new Error("isLikelyHttpErrorText not implemented (openclaw stub)");
}
export function sanitizeUserFacingText(..._args: unknown[]): unknown {
  throw new Error("sanitizeUserFacingText not implemented (openclaw stub)");
}
export const BILLING_ERROR_USER_MESSAGE: unknown = undefined;
