/**
 * 移植自 openclaw/src/agents/openclaw-tools.subagents.sessions-spawn.test-harness.ts
 *
 * Test harness for sessions-spawn sub-agent tool.
 * Simplified for cross-wms: provides mock/stub helpers for testing without
 * gateway dependency.
 */

let sessionsSpawnConfigOverride: any = undefined;
let sessionsSpawnAnnounceFlowOverride: any = undefined;
let sessionsSpawnHookRunnerOverride: any = undefined;

/** Get a call-gateway mock suitable for sessions-spawn tests. */
export function getCallGatewayMock(): {
  calls: Array<{ method: string; params: Record<string, any> }>;
  mockFn: (params: { method: string; params: Record<string, any> }) => Promise<any>;
} {
  const calls: Array<{ method: string; params: Record<string, any> }> = [];
  const mockFn = async (params: { method: string; params: Record<string, any> }): Promise<any> => {
    calls.push(params);
    return { ok: true };
  };
  return { calls, mockFn };
}

/** Wait for a sessions-spawn event to appear. */
export async function waitForSessionsSpawnEvent(_params?: {
  timeoutMs?: number;
  predicate?: (event: any) => boolean;
}): Promise<unknown | undefined> {
  // Simplified: no event stream in cross-wms
  return undefined;
}

/** Reset any sessions-spawn config override. */
export function resetSessionsSpawnConfigOverride(): void {
  sessionsSpawnConfigOverride = undefined;
}

/** Set a sessions-spawn config override for testing. */
export function setSessionsSpawnConfigOverride(config: any): void {
  sessionsSpawnConfigOverride = config;
}

/** Get the current sessions-spawn config override. */
export function getSessionsSpawnConfigOverride(): any {
  return sessionsSpawnConfigOverride;
}

/** Reset any sessions-spawn announce flow override. */
export function resetSessionsSpawnAnnounceFlowOverride(): void {
  sessionsSpawnAnnounceFlowOverride = undefined;
}

/** Set a sessions-spawn announce flow override for testing. */
export function setSessionsSpawnAnnounceFlowOverride(flow: any): void {
  sessionsSpawnAnnounceFlowOverride = flow;
}

/** Get the current sessions-spawn announce flow override. */
export function getSessionsSpawnAnnounceFlowOverride(): any {
  return sessionsSpawnAnnounceFlowOverride;
}

/** Reset any sessions-spawn hook runner override. */
export function resetSessionsSpawnHookRunnerOverride(): void {
  sessionsSpawnHookRunnerOverride = undefined;
}

/** Set a sessions-spawn hook runner override for testing. */
export function setSessionsSpawnHookRunnerOverride(runner: any): void {
  sessionsSpawnHookRunnerOverride = runner;
}

/** Get the current sessions-spawn hook runner override. */
export function getSessionsSpawnHookRunnerOverride(): any {
  return sessionsSpawnHookRunnerOverride;
}

/** Get the sessions-spawn tool for testing. */
export function getSessionsSpawnTool(): any {
  return null;
}

/** Set up a sessions-spawn gateway mock for integration tests. */
export function setupSessionsSpawnGatewayMock(_params?: {
  sessionId?: string;
  agentId?: string;
}): ReturnType<typeof getCallGatewayMock> {
  return getCallGatewayMock();
}
