// 移植自 openclaw/src/infra/npm-managed-root.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ManagedNpmRootPeerDependencySnapshot = unknown;
export type ManagedNpmRootInstalledDependency = unknown;
export type MissingRequiredPlatformPackage = unknown;
export function readOpenClawManagedNpmRootOverrides(...args: unknown[]): unknown {
  throw new Error("not implemented: readOpenClawManagedNpmRootOverrides");
}
export function resolveManagedNpmRootDependencySpec(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManagedNpmRootDependencySpec");
}
export function upsertManagedNpmRootDependency(...args: unknown[]): unknown {
  throw new Error("not implemented: upsertManagedNpmRootDependency");
}
export function listMissingRequiredPlatformPackages(...args: unknown[]): unknown {
  throw new Error("not implemented: listMissingRequiredPlatformPackages");
}
export function readManagedNpmRootPeerDependencySnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: readManagedNpmRootPeerDependencySnapshot");
}
export function restoreManagedNpmRootPeerDependencySnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: restoreManagedNpmRootPeerDependencySnapshot");
}
export function syncManagedNpmRootPeerDependencies(...args: unknown[]): unknown {
  throw new Error("not implemented: syncManagedNpmRootPeerDependencies");
}
export function repairManagedNpmRootOpenClawPeer(...args: unknown[]): unknown {
  throw new Error("not implemented: repairManagedNpmRootOpenClawPeer");
}
export function readManagedNpmRootInstalledDependency(...args: unknown[]): unknown {
  throw new Error("not implemented: readManagedNpmRootInstalledDependency");
}
export function removeManagedNpmRootDependency(...args: unknown[]): unknown {
  throw new Error("not implemented: removeManagedNpmRootDependency");
}
