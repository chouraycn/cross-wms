/**
 * 移植自 openclaw/src/agents/embedded-agent-messaging.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isMessageToolSendActionName(..._args: unknown[]): unknown {
  throw new Error("isMessageToolSendActionName not implemented (openclaw stub)");
}
export function isMessageToolConversationCreateActionName(..._args: unknown[]): unknown {
  throw new Error("isMessageToolConversationCreateActionName not implemented (openclaw stub)");
}
export function isMessagingTool(..._args: unknown[]): unknown {
  throw new Error("isMessagingTool not implemented (openclaw stub)");
}
export function isMessagingToolSendAction(..._args: unknown[]): unknown {
  throw new Error("isMessagingToolSendAction not implemented (openclaw stub)");
}
export function isMessagingToolTargetEvidenceAction(..._args: unknown[]): unknown {
  throw new Error("isMessagingToolTargetEvidenceAction not implemented (openclaw stub)");
}
export function isMessagingToolDeliveryAction(..._args: unknown[]): unknown {
  throw new Error("isMessagingToolDeliveryAction not implemented (openclaw stub)");
}
