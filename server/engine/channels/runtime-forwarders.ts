// 移植自 openclaw/src/channels/plugins/runtime-forwarders.ts
// 降级：channel plugin 依赖简化

export type RuntimeDirectoryLiveAdapter = {
  resolveTarget: (params: any) => Promise<any>;
  resolveTargets: (params: any) => Promise<any[]>;
};

export type RuntimeOutboundDelegates = {
  deliverPayload: (params: any) => Promise<any>;
  resolveTarget: (params: any) => Promise<any>;
};

/** Creates a runtime directory live adapter. Simplified without real directory. */
export function createRuntimeDirectoryLiveAdapter(_params?: any): RuntimeDirectoryLiveAdapter {
  return {
    resolveTarget: async () => null,
    resolveTargets: async () => [],
  };
}

/** Creates runtime outbound delegates. Simplified without real channel plugin. */
export function createRuntimeOutboundDelegates(_params?: any): RuntimeOutboundDelegates {
  return {
    deliverPayload: async () => null,
    resolveTarget: async () => null,
  };
}
