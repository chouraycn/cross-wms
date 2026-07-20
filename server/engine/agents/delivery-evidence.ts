/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/delivery-evidence.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function collectDeliveredMediaUrls(..._args: unknown[]): unknown {
  return [];
}
export function collectMessagingToolDeliveredMediaUrls(..._args: unknown[]): unknown {
  return [];
}
export function getGatewayAgentResult(..._args: unknown[]): unknown {
  return undefined;
}
export function hasVisibleAgentPayload(..._args: unknown[]): unknown {
  return false;
}
export function hasMessagingToolDeliveryEvidence(..._args: unknown[]): unknown {
  return false;
}
export function hasCommittedMessagingToolDeliveryEvidence(..._args: unknown[]): unknown {
  return false;
}
export function hasCommittedOutboundDeliveryEvidence(..._args: unknown[]): unknown {
  return false;
}
export function hasOutboundDeliveryEvidence(..._args: unknown[]): unknown {
  return false;
}
export function getAgentCommandDeliveryFailure(..._args: unknown[]): unknown {
  return undefined;
}
