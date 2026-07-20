// 移植自 openclaw/src/channels/plugins/registry-loader.ts
// 降级：channel plugin 依赖简化

export type ChannelRegistryLoader = {
  load: (provider: string) => Promise<unknown>;
  listProviders: () => string[];
};

/** Creates a channel registry loader. Simplified without real plugin registry. */
export function createChannelRegistryLoader(_params?: unknown): ChannelRegistryLoader {
  return {
    load: async () => null,
    listProviders: () => [],
  };
}
