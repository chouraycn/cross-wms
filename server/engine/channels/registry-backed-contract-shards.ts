// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/registry-backed-contract-shards.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function installSurfaceContractRegistryShard(..._args: unknown[]): unknown {
  throw new Error("not implemented: installSurfaceContractRegistryShard");
}

export function installDirectoryContractRegistryShard(..._args: unknown[]): unknown {
  throw new Error("not implemented: installDirectoryContractRegistryShard");
}

export function installThreadingContractRegistryShard(..._args: unknown[]): unknown {
  throw new Error("not implemented: installThreadingContractRegistryShard");
}

export function installPluginContractRegistryShard(..._args: unknown[]): unknown {
  throw new Error("not implemented: installPluginContractRegistryShard");
}
