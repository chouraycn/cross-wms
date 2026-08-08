// 移植自 openclaw/src/infra/approval-handler-runtime.ts
// 降级：channel plugin / approval-renderers 依赖简化

export type ChannelApprovalHandler = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export type ChannelApprovalNativeAvailabilityAdapter = {
  isConfigured: () => boolean;
  shouldHandle: (params: any) => boolean;
};

export type ChannelApprovalNativeRuntimeAdapter<
  TPendingPayload = any,
  TPreparedTarget = any,
  TPendingEntry = any,
  TBinding = any,
  TFinalPayload = any,
> = {
  availability: ChannelApprovalNativeAvailabilityAdapter;
  presentation: {
    buildPendingPayload: (params: any) => Promise<TPendingPayload>;
    buildResolvedResult: (params: any) => Promise<any>;
    buildExpiredResult: (params: any) => Promise<any>;
  };
  transport: {
    prepareTarget: (params: any) => Promise<TPreparedTarget>;
    deliverPending: (params: any) => Promise<any>;
    updateEntry?: (params: any) => Promise<void>;
    deleteEntry?: (params: any) => Promise<void>;
  };
  interactions?: {
    bindPending?: (params: any) => Promise<TBinding | null>;
    unbindPending?: (params: any) => Promise<void>;
    clearPendingActions?: (params: any) => Promise<void>;
    cancelDelivered?: (params: any) => Promise<void>;
  };
  observe?: {
    onDeliveryError?: (params: any) => void;
    onDuplicateSkipped?: (params: any) => void;
    onDelivered?: (params: any) => void;
  };
  eventKinds?: readonly string[];
  resolveApprovalKind?: (params: any) => string | undefined;
};

// Re-export types from approval-handler-adapter-runtime
export {
  CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY,
  createLazyChannelApprovalNativeRuntimeAdapter,
} from "./approval-handler-adapter-runtime.js";

/** Creates a native approval runtime adapter. Simplified without real channel integration. */
export function createChannelApprovalNativeRuntimeAdapter(_params: any): ChannelApprovalNativeRuntimeAdapter {
  return {
    availability: {
      isConfigured: () => false,
      shouldHandle: () => false,
    },
    presentation: {
      buildPendingPayload: async () => ({}),
      buildResolvedResult: async () => ({}),
      buildExpiredResult: async () => ({}),
    },
    transport: {
      prepareTarget: async () => ({}),
      deliverPending: async () => ({}),
    },
  };
}

/** Creates a channel approval handler. Simplified without real channel integration. */
export function createChannelApprovalHandler(_params: any): ChannelApprovalHandler | null {
  return null;
}

/** Creates a channel approval handler from a capability. Simplified without real channel integration. */
export function createChannelApprovalHandlerFromCapability(_params: any): ChannelApprovalHandler | null {
  return null;
}

// View model type aliases
export type ApprovalActionView = { action: string; label: string };
export type ApprovalMetadataView = { key: string; value: string };
export type ApprovalViewModel = { id: string; status: string; [key: string]: any };
export type ExecApprovalExpiredView = ApprovalViewModel & { kind: "exec-expired" };
export type ExecApprovalPendingView = ApprovalViewModel & { kind: "exec-pending" };
export type ExecApprovalResolvedView = ApprovalViewModel & { kind: "exec-resolved" };
export type ExpiredApprovalView = ExecApprovalExpiredView | PluginApprovalExpiredView;
export type PendingApprovalView = ExecApprovalPendingView | PluginApprovalPendingView;
export type PluginApprovalExpiredView = ApprovalViewModel & { kind: "plugin-expired" };
export type PluginApprovalPendingView = ApprovalViewModel & { kind: "plugin-pending" };
export type PluginApprovalResolvedView = ApprovalViewModel & { kind: "plugin-resolved" };
export type ResolvedApprovalView = ExecApprovalResolvedView | PluginApprovalResolvedView;
export type ChannelApprovalCapabilityHandlerContext = unknown;
export type ChannelApprovalNativeFinalAction = unknown;
export type ChannelApprovalNativeInteractionAdapter = unknown;
export type ChannelApprovalNativeObserveAdapter = unknown;
export type ChannelApprovalNativePresentationAdapter = unknown;
export type ChannelApprovalNativeRuntimeSpec = unknown;
export type ChannelApprovalNativeTransportAdapter = unknown;
export type ChannelApprovalHandlerAdapter = unknown;
