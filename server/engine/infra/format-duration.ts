// 移植自 openclaw/src/infra/format-duration.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type FormatDurationSecondsOptions = unknown;
export type FormatDurationCompactOptions = unknown;
export function formatDurationSeconds(...args: unknown[]): unknown {
  throw new Error("not implemented: formatDurationSeconds");
}
export function formatDurationPrecise(...args: unknown[]): unknown {
  throw new Error("not implemented: formatDurationPrecise");
}
export function formatDurationCompact(...args: unknown[]): unknown {
  throw new Error("not implemented: formatDurationCompact");
}
export function formatDurationHuman(...args: unknown[]): unknown {
  throw new Error("not implemented: formatDurationHuman");
}
