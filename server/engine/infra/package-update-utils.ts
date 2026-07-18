// 移植自 openclaw/src/infra/package-update-utils.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function expectedIntegrityForUpdate(...args: unknown[]): unknown {
  throw new Error("not implemented: expectedIntegrityForUpdate");
}
export function readInstalledPackageVersion(...args: unknown[]): unknown {
  throw new Error("not implemented: readInstalledPackageVersion");
}
export function readInstalledPackagePeerDependencies(...args: unknown[]): unknown {
  throw new Error("not implemented: readInstalledPackagePeerDependencies");
}
export function installedPackageNeedsOpenClawPeerLinkRepair(...args: unknown[]): unknown {
  throw new Error("not implemented: installedPackageNeedsOpenClawPeerLinkRepair");
}
