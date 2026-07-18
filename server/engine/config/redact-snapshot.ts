// 移植自 openclaw/src/config/redact-snapshot.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function redactConfigObject(...args: unknown[]): unknown {
  throw new Error("not implemented: redactConfigObject");
}
export function redactConfigSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: redactConfigSnapshot");
}
export function restoreRedactedValues(...args: unknown[]): unknown {
  throw new Error("not implemented: restoreRedactedValues");
}
export const REDACTED_SENTINEL: unknown = undefined;
