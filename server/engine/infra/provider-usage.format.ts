// 移植自 openclaw/src/infra/provider-usage.format.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function formatUsageWindowSummary(...args: unknown[]): unknown {
  throw new Error("not implemented: formatUsageWindowSummary");
}
export function formatUsageSummaryLine(...args: unknown[]): unknown {
  throw new Error("not implemented: formatUsageSummaryLine");
}
export function formatUsageReportLines(...args: unknown[]): unknown {
  throw new Error("not implemented: formatUsageReportLines");
}
