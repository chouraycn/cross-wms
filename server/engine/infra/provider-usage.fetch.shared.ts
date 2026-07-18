// 移植自 openclaw/src/infra/provider-usage.fetch.shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function fetchJson(...args: unknown[]): unknown {
  throw new Error("not implemented: fetchJson");
}
export function discardUsageResponseBody(...args: unknown[]): unknown {
  throw new Error("not implemented: discardUsageResponseBody");
}
export function parseFiniteNumber(...args: unknown[]): unknown {
  throw new Error("not implemented: parseFiniteNumber");
}
export function buildUsageErrorSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: buildUsageErrorSnapshot");
}
export function buildUsageHttpErrorSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: buildUsageHttpErrorSnapshot");
}
export function readUsageJson(...args: unknown[]): unknown {
  throw new Error("not implemented: readUsageJson");
}
