// 移植自 openclaw/src/infra/parse-offsetless-zoned-datetime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isOffsetlessIsoDateTime(...args: unknown[]): unknown {
  throw new Error("not implemented: isOffsetlessIsoDateTime");
}
export function parseOffsetlessIsoDateTimeInTimeZone(...args: unknown[]): unknown {
  throw new Error("not implemented: parseOffsetlessIsoDateTimeInTimeZone");
}
