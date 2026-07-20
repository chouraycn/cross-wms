/**
 * 移植自 openclaw/src/agents/cli-runner/prepare.ts
 *
 * Prepares CLI backend run context. cross-wms provides sensible defaults
 * since the full preparation infrastructure is not available.
 */

/** Overrides preparation dependencies for CLI runner tests — no-op in cross-wms. */
export function setCliRunnerPrepareTestDeps(_overrides?: Record<string, unknown>): void {
  // No-op: cross-wms does not have the full prepare dependency graph.
}

/** Returns whether profile-owned prepared execution should skip local CLI epoch hashing. */
export function shouldSkipLocalCliCredentialEpoch(params: {
  authEpochMode?: string;
  authProfileId?: string;
  authCredential?: unknown;
  preparedExecution?: unknown;
}): boolean {
  return Boolean(
    params.authEpochMode === "profile-only" &&
    params.authProfileId &&
    params.authCredential &&
    params.preparedExecution,
  );
}

/**
 * Builds the complete context required to execute a CLI-backed agent run.
 * In cross-wms this returns a minimal context with the provided params,
 * since the full preparation pipeline is not available.
 */
export async function prepareCliRunContext(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  // cross-wms lacks bootstrap files, auth profiles, MCP loopback, context engines, etc.
  // Return a minimal context that carries through the caller's params.
  return {
    params,
    started: Date.now(),
    effectiveAuthProfileId: undefined,
    workspaceDir: params.workspaceDir ?? params.cwd ?? process.cwd(),
    cwd: params.cwd ?? process.cwd(),
  };
}
