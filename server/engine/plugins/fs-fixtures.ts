// 移植自 openclaw/src/plugins/fs-fixtures.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function mkdirSafeDir(...args: unknown[]): unknown {
  throw new Error("not implemented: mkdirSafeDir");
}
export function makeTrackedTempDir(...args: unknown[]): unknown {
  throw new Error("not implemented: makeTrackedTempDir");
}
export function makeTrackedTempDirAsync(...args: unknown[]): unknown {
  throw new Error("not implemented: makeTrackedTempDirAsync");
}
export function cleanupTrackedTempDirs(...args: unknown[]): unknown {
  throw new Error("not implemented: cleanupTrackedTempDirs");
}
export function cleanupTrackedTempDirsAsync(...args: unknown[]): unknown {
  throw new Error("not implemented: cleanupTrackedTempDirsAsync");
}
export function createSuiteTempRootTracker(...args: unknown[]): unknown {
  throw new Error("not implemented: createSuiteTempRootTracker");
}
