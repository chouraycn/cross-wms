// 移植自 openclaw/src/config/io.clobber-snapshot.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function persistBoundedClobberedConfigSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: persistBoundedClobberedConfigSnapshot");
}
export function persistBoundedClobberedConfigSnapshotSync(...args: unknown[]): unknown {
  throw new Error("not implemented: persistBoundedClobberedConfigSnapshotSync");
}
