// 移植自 openclaw/src/infra/approval-handler-adapter-runtime.ts（降级实现）
// channel-native 审批适配器运行时。
import type { ChannelApprovalNativeRuntimeAdapter, ChannelApprovalNativeRuntimeSpec } from "./approval-handler-runtime-types.js";

export const CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY =
  "channel-approval-native-runtime" as const;

export type { ChannelApprovalNativeRuntimeAdapter, ChannelApprovalNativeRuntimeSpec };

/**
 * 创建惰性 channel-native 审批运行时适配器。
 * 降级实现：返回 noop 适配器。
 */
export function createLazyChannelApprovalNativeRuntimeAdapter(_options?: {
  cfg?: unknown;
}): ChannelApprovalNativeRuntimeAdapter {
  return {
    availability: {
      isConfigured: () => false,
      shouldHandle: () => false,
    },
    presentation: {
      buildPendingPayload: () => null,
      buildResolvedResult: () => ({ kind: "leave" as const }),
      buildExpiredResult: () => ({ kind: "leave" as const }),
    },
  };
}

/** 解析已注册的 channel-native 审批运行时规范（降级：返回 undefined） */
export function resolveChannelApprovalNativeRuntimeSpec(_params: {
  channel: string;
}): ChannelApprovalNativeRuntimeSpec | undefined {
  return undefined;
}
