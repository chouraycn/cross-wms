// 移植自 openclaw/src/infra/npm-pack-install.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type NpmSpecArchiveFinalInstallResult = unknown;
export function installFromNpmSpecArchiveWithInstaller(...args: unknown[]): unknown {
  throw new Error("not implemented: installFromNpmSpecArchiveWithInstaller");
}
export function finalizeNpmSpecArchiveInstall(...args: unknown[]): unknown {
  throw new Error("not implemented: finalizeNpmSpecArchiveInstall");
}
export function installFromNpmSpecArchive(...args: unknown[]): unknown {
  throw new Error("not implemented: installFromNpmSpecArchive");
}
