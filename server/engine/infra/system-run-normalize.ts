// 移植自 openclaw/src/infra/system-run-normalize.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function normalizeNonEmptyString(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeNonEmptyString");
}
export function normalizeStringArray(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeStringArray");
}
