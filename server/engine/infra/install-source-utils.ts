// 移植自 openclaw/src/infra/install-source-utils.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type NpmSpecResolution = unknown;
export type NpmResolutionFields = unknown;
export type NpmIntegrityDrift = unknown;
export function buildNpmResolutionFields(...args: unknown[]): unknown {
  throw new Error("not implemented: buildNpmResolutionFields");
}
export function createNpmMetadataEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: createNpmMetadataEnv");
}
export function resolveNpmSpecMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveNpmSpecMetadata");
}
export function withTempDir(...args: unknown[]): unknown {
  throw new Error("not implemented: withTempDir");
}
export function resolveArchiveSourcePath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveArchiveSourcePath");
}
export function packNpmSpecToArchive(...args: unknown[]): unknown {
  throw new Error("not implemented: packNpmSpecToArchive");
}
export function resolveNpmPackArchiveMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveNpmPackArchiveMetadata");
}
