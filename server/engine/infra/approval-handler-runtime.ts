// 移植自 openclaw/src/infra/approval-handler-runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelApprovalHandler = unknown;
export type ChannelApprovalHandlerAdapter = unknown;
export type ApprovalActionView = unknown;
export type ApprovalMetadataView = unknown;
export type ApprovalViewModel = unknown;
export type ExecApprovalExpiredView = unknown;
export type ExecApprovalPendingView = unknown;
export type ExecApprovalResolvedView = unknown;
export type ExpiredApprovalView = unknown;
export type PendingApprovalView = unknown;
export type PluginApprovalExpiredView = unknown;
export type PluginApprovalPendingView = unknown;
export type PluginApprovalResolvedView = unknown;
export type ResolvedApprovalView = unknown;
export type ChannelApprovalCapabilityHandlerContext = unknown;
export type ChannelApprovalNativeAvailabilityAdapter = unknown;
export type ChannelApprovalNativeFinalAction = unknown;
export type ChannelApprovalNativeInteractionAdapter = unknown;
export type ChannelApprovalNativeObserveAdapter = unknown;
export type ChannelApprovalNativePresentationAdapter = unknown;
export type ChannelApprovalNativeRuntimeAdapter = unknown;
export type ChannelApprovalNativeRuntimeSpec = unknown;
export type ChannelApprovalNativeTransportAdapter = unknown;
export function createChannelApprovalNativeRuntimeAdapter(...args: unknown[]): unknown {
  throw new Error("not implemented: createChannelApprovalNativeRuntimeAdapter");
}
export function createChannelApprovalHandler(...args: unknown[]): unknown {
  throw new Error("not implemented: createChannelApprovalHandler");
}
export function createChannelApprovalHandlerFromCapability(...args: unknown[]): unknown {
  throw new Error("not implemented: createChannelApprovalHandlerFromCapability");
}
export type CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY = unknown;
export type createLazyChannelApprovalNativeRuntimeAdapter = unknown;
