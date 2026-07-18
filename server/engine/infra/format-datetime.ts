// 移植自 openclaw/src/infra/format-datetime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveTimezone(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveTimezone");
}
export function formatUtcTimestamp(...args: unknown[]): unknown {
  throw new Error("not implemented: formatUtcTimestamp");
}
export function formatZonedTimestamp(...args: unknown[]): unknown {
  throw new Error("not implemented: formatZonedTimestamp");
}
