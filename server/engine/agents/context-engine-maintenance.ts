/**
 * Context engine maintenance helpers.
 * Ported from openclaw/src/agents/embedded-agent-runner/context-engine-maintenance.ts
 * Simplified: context engine maintenance replaced with no-op defaults.
 */

export function createDeferredTurnMaintenanceAbortSignal(): AbortSignal {
  return AbortSignal.timeout(0);
}

export function resetDeferredTurnMaintenanceStateForTest(): void {}

export function waitForDeferredTurnMaintenanceForSession(): Promise<void> {
  return Promise.resolve();
}

export function buildContextEngineMaintenanceRuntimeContext(): null {
  return null;
}

export function runContextEngineMaintenance(): Promise<void> {
  return Promise.resolve();
}
