// 移植自 openclaw/src/infra/approval-handler-runtime.ts（降级实现）
// 审批 handler 运行时契约。
import type { OpenClawConfig } from "./_runtime-stubs.js";
import type {
  ApprovalRequest,
  ApprovalResolved,
  ChannelApprovalNativeRuntimeAdapter,
  ChannelApprovalNativeRuntimeSpec,
  ChannelApprovalCapabilityHandlerContext,
} from "./approval-handler-runtime-types.js";
import type { ExecApprovalChannelRuntime } from "./exec-approval-channel-runtime.types.js";

export type {
  ApprovalRequest,
  ApprovalResolved,
  ChannelApprovalNativeRuntimeAdapter,
  ChannelApprovalNativeRuntimeSpec,
  ChannelApprovalCapabilityHandlerContext,
};
export type {
  ApprovalActionView,
  ApprovalMetadataView,
  ApprovalViewModel,
  ExecApprovalExpiredView,
  ExecApprovalPendingView,
  ExecApprovalResolvedView,
  ExpiredApprovalView,
  PendingApprovalView,
  PluginApprovalExpiredView,
  PluginApprovalPendingView,
  PluginApprovalResolvedView,
  ResolvedApprovalView,
} from "./approval-view-model.types.js";
export {
  CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY,
  createLazyChannelApprovalNativeRuntimeAdapter,
} from "./approval-handler-adapter-runtime.js";

export type ChannelApprovalHandler<
  TRequest extends ApprovalRequest = ApprovalRequest,
  TResolved extends ApprovalResolved = ApprovalResolved,
> = ExecApprovalChannelRuntime<TRequest, TResolved>;

/**
 * 创建 channel 审批 handler。
 * 降级实现：返回 noop handler。
 */
export function createChannelApprovalHandler(_options?: {
  cfg?: OpenClawConfig;
}): ChannelApprovalHandler {
  return {
    start: async () => {},
    stop: async () => {},
    registerRequest: () => {},
    resolveRequest: async () => {
      throw new Error("createChannelApprovalHandler stub: not implemented");
    },
    getPendingRequests: () => [],
    getRequest: () => undefined,
    on: () => () => {},
    off: () => {},
    emit: () => {},
  } as unknown as ChannelApprovalHandler;
}

/** 注册 channel-native 审批运行时规范（降级：noop） */
export function registerChannelApprovalNativeRuntime(_spec: ChannelApprovalNativeRuntimeSpec): void {
  // 降级：不注册
}

/** 列出已注册的 channel-native 审批通道（降级：返回空） */
export function listChannelApprovalNativeChannels(): string[] {
  return [];
}
