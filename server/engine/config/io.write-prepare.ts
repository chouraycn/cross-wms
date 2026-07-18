// 移植自 openclaw/src/config/io.write-prepare.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function createMergePatch(...args: unknown[]): unknown {
  throw new Error("not implemented: createMergePatch");
}
export function projectSourceOntoRuntimeShape(...args: unknown[]): unknown {
  throw new Error("not implemented: projectSourceOntoRuntimeShape");
}
export function preserveIncludeOwnedConfigForWrite(...args: unknown[]): unknown {
  throw new Error("not implemented: preserveIncludeOwnedConfigForWrite");
}
export function injectExplicitlySetPaths(...args: unknown[]): unknown {
  throw new Error("not implemented: injectExplicitlySetPaths");
}
export function resolvePersistCandidateForWrite(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePersistCandidateForWrite");
}
export function formatConfigValidationFailure(...args: unknown[]): unknown {
  throw new Error("not implemented: formatConfigValidationFailure");
}
export function unsetPathForWrite(...args: unknown[]): unknown {
  throw new Error("not implemented: unsetPathForWrite");
}
export function applyUnsetPathsForWrite(...args: unknown[]): unknown {
  throw new Error("not implemented: applyUnsetPathsForWrite");
}
export function resolveManagedUnsetPathsForWrite(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManagedUnsetPathsForWrite");
}
export function collectChangedPaths(...args: unknown[]): unknown {
  throw new Error("not implemented: collectChangedPaths");
}
export function restoreEnvRefsFromMap(...args: unknown[]): unknown {
  throw new Error("not implemented: restoreEnvRefsFromMap");
}
export function resolveWriteEnvSnapshotForPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveWriteEnvSnapshotForPath");
}
