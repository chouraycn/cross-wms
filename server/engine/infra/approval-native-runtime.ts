// 移植自 openclaw/src/infra/approval-native-runtime.ts（降级实现）
// channel-native 审批运行时实现。
import type { OpenClawConfig } from "./_runtime-stubs.js";
import type { ApprovalRequest, ApprovalResolved } from "./approval-handler-runtime-types.js";
import type {
  ChannelNativeApprovalDeliveryCallbacks,
  ChannelNativeApprovalTransportSpec,
  PreparedChannelNativeApprovalTarget,
} from "./approval-native-runtime-types.js";

export type {
  ChannelNativeApprovalDeliveryCallbacks,
  ChannelNativeApprovalTransportSpec,
  PreparedChannelNativeApprovalTarget,
};

export type ChannelNativeApprovalRuntime = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  deliverPending: (request: ApprovalRequest) => Promise<void>;
  deliverResolved: (request: ApprovalRequest, resolved: ApprovalResolved) => Promise<void>;
  deliverExpired: (request: ApprovalRequest) => Promise<void>;
};

/**
 * 创建 channel-native 审批运行时。
 * 降级实现：返回 noop 运行时。
 */
export function createChannelNativeApprovalRuntime(_options?: {
  cfg?: OpenClawConfig;
  channel?: string;
  callbacks?: ChannelNativeApprovalDeliveryCallbacks;
}): ChannelNativeApprovalRuntime {
  return {
    start: async () => {},
    stop: async () => {},
    deliverPending: async () => {},
    deliverResolved: async () => {},
    deliverExpired: async () => {},
  };
}

/** 解析 channel 传输规范（降级：返回默认） */
export function resolveChannelNativeApprovalTransportSpec(_channel: string): ChannelNativeApprovalTransportSpec {
  return {
    channel: _channel,
    supportsUpdate: false,
    supportsDelete: false,
    supportsInlineDecision: false,
  };
}
