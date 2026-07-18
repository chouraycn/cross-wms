// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/surface-contract-registry.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function getSurfaceContractRegistryShardIds(..._args: unknown[]): unknown {
  throw new Error("not implemented: getSurfaceContractRegistryShardIds");
}

export function getThreadingContractRegistryShardRefs(..._args: unknown[]): unknown {
  throw new Error("not implemented: getThreadingContractRegistryShardRefs");
}

export function getDirectoryContractRegistryShardRefs(..._args: unknown[]): unknown {
  throw new Error("not implemented: getDirectoryContractRegistryShardRefs");
}
