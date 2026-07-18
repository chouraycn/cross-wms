export function generateIsolatedAgentRunId(jobId: string, timestamp?: number): string {
  const ts = timestamp ?? Date.now();
  return `isolated:${jobId}:${ts}`;
}

export function formatIsolatedAgentDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  if (durationMs < 3600000) {
    return `${(durationMs / 60000).toFixed(1)}m`;
  }
  return `${(durationMs / 3600000).toFixed(1)}h`;
}