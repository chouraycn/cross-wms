// 移植自 openclaw/src/channels/plugins/runtime-forwarders.ts
// 降级：channel plugin 依赖简化

export type RuntimeDirectoryLiveAdapter = {
  resolveTarget: (params: unknown) => Promise<unknown>;
  resolveTargets: (params: unknown) => Promise<unknown[]>;
};

export type RuntimeOutboundDelegates = {
  deliverPayload: (params: unknown) => Promise<unknown>;
  resolveTarget: (params: unknown) => Promise<unknown>;
};

/** Creates a runtime directory live adapter. Simplified without real directory. */
export function createRuntimeDirectoryLiveAdapter(_params?: unknown): RuntimeDirectoryLiveAdapter {
  return {
    resolveTarget: async () => null,
    resolveTargets: async () => [],
  };
}

/** Creates runtime outbound delegates. Simplified without real channel plugin. */
export function createRuntimeOutboundDelegates(_params?: unknown): RuntimeOutboundDelegates {
  return {
    deliverPayload: async () => null,
    resolveTarget: async () => null,
  };
}
