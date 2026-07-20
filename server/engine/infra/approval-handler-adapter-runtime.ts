// 移植自 openclaw/src/infra/approval-handler-adapter-runtime.ts
// 降级：lazy-runtime 依赖简化

/** Runtime-context capability key used by channels to register native approval resources. */
export const CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY = "approval.native";

/** Creates a lazy-loading approval runtime adapter. Simplified port without lazy-runtime module. */
export function createLazyChannelApprovalNativeRuntimeAdapter<
  TPendingPayload = unknown,
  TPreparedTarget = unknown,
  TPendingEntry = unknown,
  TBinding = unknown,
  TFinalPayload = unknown,
>(params: {
  load: () => Promise<unknown>;
  isConfigured: () => boolean;
  shouldHandle: (params: unknown) => boolean;
  eventKinds?: readonly string[];
  resolveApprovalKind?: (params: unknown) => string | undefined;
}): {
  availability: { isConfigured: () => boolean; shouldHandle: (params: unknown) => boolean };
  eventKinds?: readonly string[];
  resolveApprovalKind?: (params: unknown) => string | undefined;
  load: () => Promise<unknown>;
} {
  return {
    ...(params.eventKinds ? { eventKinds: params.eventKinds } : {}),
    ...(params.resolveApprovalKind ? { resolveApprovalKind: params.resolveApprovalKind } : {}),
    availability: {
      isConfigured: params.isConfigured,
      shouldHandle: params.shouldHandle,
    },
    load: params.load,
  };
}
