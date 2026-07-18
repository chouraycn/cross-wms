// 移植自 openclaw/src/infra/session-cost-usage.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type CostUsageSummary = unknown;
export type CostUsageTotals = unknown;
export type DiscoveredSession = unknown;
export type SessionCostSummary = unknown;
export type SessionDailyLatency = unknown;
export type SessionDailyModelUsage = unknown;
export type SessionLatencyStats = unknown;
export type SessionMessageCounts = unknown;
export type SessionModelUsage = unknown;
export type SessionToolUsage = unknown;
export type UsageCacheStatus = unknown;
export function resolveExistingUsageSessionFile(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExistingUsageSessionFile");
}
export function loadCostUsageSummary(...args: unknown[]): unknown {
  throw new Error("not implemented: loadCostUsageSummary");
}
export function refreshCostUsageCache(...args: unknown[]): unknown {
  throw new Error("not implemented: refreshCostUsageCache");
}
export function loadCostUsageSummaryFromCache(...args: unknown[]): unknown {
  throw new Error("not implemented: loadCostUsageSummaryFromCache");
}
export function loadSessionCostSummaryFromCache(...args: unknown[]): unknown {
  throw new Error("not implemented: loadSessionCostSummaryFromCache");
}
export function loadSessionCostSummariesFromCache(...args: unknown[]): unknown {
  throw new Error("not implemented: loadSessionCostSummariesFromCache");
}
export function requestCostUsageCacheRefresh(...args: unknown[]): unknown {
  throw new Error("not implemented: requestCostUsageCacheRefresh");
}
export function discoverAllSessions(...args: unknown[]): unknown {
  throw new Error("not implemented: discoverAllSessions");
}
export function loadSessionCostSummary(...args: unknown[]): unknown {
  throw new Error("not implemented: loadSessionCostSummary");
}
export function loadSessionUsageTimeSeries(...args: unknown[]): unknown {
  throw new Error("not implemented: loadSessionUsageTimeSeries");
}
export function loadSessionLogs(...args: unknown[]): unknown {
  throw new Error("not implemented: loadSessionLogs");
}
