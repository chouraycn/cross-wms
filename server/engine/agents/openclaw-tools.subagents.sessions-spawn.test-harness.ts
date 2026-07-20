/**
 * 移植自 openclaw/src/agents/openclaw-tools.subagents.sessions-spawn.test-harness.ts
 *
 * Test harness for sessions-spawn sub-agent tool.
 * Simplified for cross-wms: provides mock/stub helpers for testing without
 * gateway dependency.
 */

let sessionsSpawnConfigOverride: unknown = undefined;
let sessionsSpawnAnnounceFlowOverride: unknown = undefined;
let sessionsSpawnHookRunnerOverride: unknown = undefined;

/** Get a call-gateway mock suitable for sessions-spawn tests. */
export function getCallGatewayMock(): {
  calls: Array<{ method: string; params: Record<string, unknown> }>;
  mockFn: (params: { method: string; params: Record<string, unknown> }) => Promise<unknown>;
} {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const mockFn = async (params: { method: string; params: Record<string, unknown> }>) => {
    calls.push(params);
    return { ok: true };
  };
  return { calls, mockFn };
}

/** Wait for a sessions-spawn event to appear. */
export async function waitForSessionsSpawnEvent(_params?: {
  timeoutMs?: number;
  predicate?: (event: unknown) => boolean;
}): Promise<unknown | undefined> {
  // Simplified: no event stream in cross-wms
  return undefined;
}

/** Reset any sessions-spawn config override. */
export function resetSessionsSpawnConfigOverride(): void {
  sessionsSpawnConfigOverride = undefined;
}

/** Set a sessions-spawn config override for testing. */
export function setSessionsSpawnConfigOverride(config: unknown): void {
  sessionsSpawnConfigOverride = config;
}

/** Get the current sessions-spawn config override. */
export function getSessionsSpawnConfigOverride(): unknown {
  return sessionsSpawnConfigOverride;
}

/** Reset any sessions-spawn announce flow override. */
export function resetSessionsSpawnAnnounceFlowOverride(): void {
  sessionsSpawnAnnounceFlowOverride = undefined;
}

/** Set a sessions-spawn announce flow override for testing. */
export function setSessionsSpawnAnnounceFlowOverride(flow: unknown): void {
  sessionsSpawnAnnounceFlowOverride = flow;
}

/** Get the current sessions-spawn announce flow override. */
export function getSessionsSpawnAnnounceFlowOverride(): unknown {
  return sessionsSpawnAnnounceFlowOverride;
}

/** Reset any sessions-spawn hook runner override. */
export function resetSessionsSpawnHookRunnerOverride(): void {
  sessionsSpawnHookRunnerOverride = undefined;
}

/** Set a sessions-spawn hook runner override for testing. */
export function setSessionsSpawnHookRunnerOverride(runner: unknown): void {
  sessionsSpawnHookRunnerOverride = runner;
}

/** Get the current sessions-spawn hook runner override. */
export function getSessionsSpawnHookRunnerOverride(): unknown {
  return sessionsSpawnHookRunnerOverride;
}

/** Get the sessions-spawn tool for testing. */
export function getSessionsSpawnTool(): unknown {
  return null;
}

/** Set up a sessions-spawn gateway mock for integration tests. */
export function setupSessionsSpawnGatewayMock(_params?: {
  sessionId?: string;
  agentId?: string;
}): ReturnType<typeof getCallGatewayMock> {
  return getCallGatewayMock();
}
