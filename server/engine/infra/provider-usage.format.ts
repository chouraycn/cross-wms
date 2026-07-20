// 移植自 openclaw/src/infra/provider-usage.format.ts

export type UsageWindow = {
  label: string;
  usedPercent: number;
  resetAt?: number;
};

export type ProviderUsageSnapshot = {
  provider: string;
  displayName?: string;
  windows: UsageWindow[];
  plan?: string;
  summary?: string;
  error?: string;
};

/** Formats a single usage window summary line. */
export function formatUsageWindowSummary(window: UsageWindow): string {
  const percent = `${window.usedPercent.toFixed(1)}%`;
  const resetSuffix = window.resetAt
    ? ` (resets ${new Date(window.resetAt).toISOString()})`
    : "";
  return `${window.label}: ${percent}${resetSuffix}`;
}

/** Formats a provider usage snapshot summary line. */
export function formatUsageSummaryLine(snapshot: ProviderUsageSnapshot): string {
  const label = snapshot.displayName ?? snapshot.provider;
  if (snapshot.error) return `${label}: ${snapshot.error}`;
  if (snapshot.summary) return `${label}: ${snapshot.summary}`;
  if (snapshot.windows.length === 0) return `${label}: no usage data`;
  const windowSummaries = snapshot.windows.map(formatUsageWindowSummary).join("; ");
  const planSuffix = snapshot.plan ? ` [${snapshot.plan}]` : "";
  return `${label}: ${windowSummaries}${planSuffix}`;
}

/** Formats multiple provider usage snapshots into report lines. */
export function formatUsageReportLines(snapshots: readonly ProviderUsageSnapshot[]): string[] {
  return snapshots.map(formatUsageSummaryLine);
}
