// 移植自 openclaw/src/plugins/archive-fixtures.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function packToArchive(...args: unknown[]): unknown {
  throw new Error("not implemented: packToArchive");
}
export function listFlatRootArchiveEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: listFlatRootArchiveEntries");
}
