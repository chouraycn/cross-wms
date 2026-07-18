// 移植自 openclaw/src/config/allowed-values.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function summarizeAllowedValues(...args: unknown[]): unknown {
  throw new Error("not implemented: summarizeAllowedValues");
}
export function appendAllowedValuesHint(...args: unknown[]): unknown {
  throw new Error("not implemented: appendAllowedValuesHint");
}
