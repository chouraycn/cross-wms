// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/registry-plugin.ts
// 降级：channel plugin contract 测试辅助

export type PluginContractRegistryShardRef = {
  shardId: string;
  provider: string;
  capabilities: string[];
};

/** Gets the plugin contract registry shard refs. */
export function getPluginContractRegistryShardRefs(_params?: unknown): PluginContractRegistryShardRef[] {
  return [];
}
