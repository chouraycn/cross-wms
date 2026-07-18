// 移植自 openclaw/src/infra/approval-native-runtime-types.ts（降级实现）
// channel-native 审批运行时类型。
import type { ApprovalRequest, ApprovalResolved } from "./approval-handler-runtime-types.js";

export type ChannelNativeApprovalDeliveryCallbacks = {
  onPendingDelivered?: (params: { request: ApprovalRequest; entry: unknown }) => void;
  onResolvedDelivered?: (params: { request: ApprovalRequest; resolved: ApprovalResolved }) => void;
  onExpiredDelivered?: (params: { request: ApprovalRequest }) => void;
  onError?: (params: { request: ApprovalRequest; error: Error }) => void;
};

export type ChannelNativeApprovalTransportSpec = {
  channel: string;
  supportsUpdate: boolean;
  supportsDelete: boolean;
  supportsInlineDecision: boolean;
};

export type PreparedChannelNativeApprovalTarget<TTarget = unknown> = {
  target: TTarget;
  preparedAtMs: number;
};

export type { ApprovalRequest, ApprovalResolved };
