/**
 * 移植自 openclaw/src/agents/tools/sessions-send-tokens.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isAnnounceSkip(..._args: unknown[]): unknown {
  throw new Error("isAnnounceSkip not implemented (openclaw stub)");
}
export function isReplySkip(..._args: unknown[]): unknown {
  throw new Error("isReplySkip not implemented (openclaw stub)");
}
export function isNonDeliverableSessionsReply(..._args: unknown[]): unknown {
  throw new Error("isNonDeliverableSessionsReply not implemented (openclaw stub)");
}
export const ANNOUNCE_SKIP_TOKEN: unknown = undefined;
export const REPLY_SKIP_TOKEN: unknown = undefined;
