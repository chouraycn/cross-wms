export interface ToolMetrics {
  toolName: string;
  invocations: number;
  successes: number;
  failures: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastInvokedAt?: number;
  successRate: number;
}

const metricsStore = new Map<string, ToolMetrics>();

export function recordToolInvocation(toolName: string, success: boolean, durationMs: number): void {
  const metrics = metricsStore.get(toolName) ?? createEmpty(toolName);
  metrics.invocations++;
  metrics.totalDurationMs += durationMs;
  metrics.avgDurationMs = metrics.totalDurationMs / metrics.invocations;
  metrics.lastInvokedAt = Date.now();
  if (success) metrics.successes++;
  else metrics.failures++;
  metrics.successRate = metrics.invocations > 0 ? metrics.successes / metrics.invocations : 0;
  metricsStore.set(toolName, metrics);
}

function createEmpty(toolName: string): ToolMetrics {
  return {
    toolName,
    invocations: 0,
    successes: 0,
    failures: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    successRate: 0,
  };
}

export function getToolMetrics(toolName: string): ToolMetrics | undefined {
  return metricsStore.get(toolName);
}

export function listToolMetrics(): ToolMetrics[] {
  return Array.from(metricsStore.values());
}

export function getTopSlowTools(limit: number = 10): ToolMetrics[] {
  return listToolMetrics()
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, limit);
}

export function getMostFailedTools(limit: number = 10): ToolMetrics[] {
  return listToolMetrics()
    .filter((m) => m.failures > 0)
    .sort((a, b) => b.failures - a.failures)
    .slice(0, limit);
}

export function resetToolMetrics(toolName?: string): void {
  if (toolName) {
    metricsStore.delete(toolName);
  } else {
    metricsStore.clear();
  }
}
