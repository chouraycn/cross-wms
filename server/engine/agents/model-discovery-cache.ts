/**
 * Discovers cached model/provider state from configured agent stores.
 * Ported from openclaw/src/agents/embedded-agent-runner/model-discovery-cache.ts
 *
 * Note: Full discovery infrastructure not available in cross-wms.
 */

/** Discovers auth/model stores, reusing file-backed snapshots until their inputs change. */
export function discoverCachedAgentStores(options: {
  agentDir: string;
  config?: unknown;
  inheritedAuthDir?: string;
  workspaceDir?: string;
}): { authStorage: unknown; modelRegistry: unknown } {
  // Full discovery not available in cross-wms; return empty defaults
  return { authStorage: null, modelRegistry: null };
}

/** Clears the process-local discovery cache between tests that mutate model/auth fixtures. */
export function resetModelDiscoveryCacheForTest(): void {
  // No-op; cache not used in cross-wms
}
