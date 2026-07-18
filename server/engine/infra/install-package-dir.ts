// 移植自 openclaw/src/infra/install-package-dir.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function installPackageDir(...args: unknown[]): unknown {
  throw new Error("not implemented: installPackageDir");
}
export function installPackageDirWithManifestDeps(...args: unknown[]): unknown {
  throw new Error("not implemented: installPackageDirWithManifestDeps");
}
