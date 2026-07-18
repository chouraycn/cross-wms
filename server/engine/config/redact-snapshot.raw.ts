// 移植自 openclaw/src/config/redact-snapshot.raw.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function replaceSensitiveValuesInRaw(...args: unknown[]): unknown {
  throw new Error("not implemented: replaceSensitiveValuesInRaw");
}
export function shouldFallbackToStructuredRawRedaction(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldFallbackToStructuredRawRedaction");
}
