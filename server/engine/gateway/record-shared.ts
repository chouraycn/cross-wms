// 移植自 openclaw/src/gateway/server-methods/record-shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function normalizeTrimmedString(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeTrimmedString");
}
