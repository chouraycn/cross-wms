// 移植自 openclaw/src/infra/format-relative.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function formatTimeAgo(...args: unknown[]): unknown {
  throw new Error("not implemented: formatTimeAgo");
}
export function formatRelativeTimestamp(...args: unknown[]): unknown {
  throw new Error("not implemented: formatRelativeTimestamp");
}
