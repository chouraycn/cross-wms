// 移植自 openclaw/src/infra/approval-native-delivery.ts（降级实现）
// channel-native 审批交付。
import type { ApprovalRequest } from "./approval-handler-runtime-types.js";

export type ChannelApprovalNativePlannedTarget = {
  channel: string;
  to: string;
  accountId?: string;
  threadId?: string | number;
  plannedAtMs: number;
};

export type ChannelApprovalNativeDeliveryResult = {
  ok: boolean;
  target?: ChannelApprovalNativePlannedTarget;
  reason?: string;
};

/**
 * 规划 channel-native 审批交付目标。
 * 降级实现：返回失败。
 */
export function planChannelNativeApprovalDelivery(_params: {
  request: ApprovalRequest;
  channel?: string;
}): ChannelApprovalNativeDeliveryResult {
  return { ok: false, reason: "channel-native approval delivery not ported" };
}

/** 解析 channel-native 审批交付回退（降级：返回 null） */
export function resolveChannelNativeApprovalFallback(_params: {
  request: ApprovalRequest;
}): ChannelApprovalNativePlannedTarget | null {
  return null;
}

export type { ApprovalRequest };
