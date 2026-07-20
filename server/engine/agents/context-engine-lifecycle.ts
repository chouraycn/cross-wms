/**
 * Context engine lifecycle for the harness.
 * Ported from openclaw/src/agents/harness/context-engine-lifecycle.ts
 * Simplified: context engine bootstrap and maintenance replaced with no-op defaults.
 */

export type HarnessContextEngine = unknown;

export function bootstrapHarnessContextEngine(): null { return null; }
export function assembleHarnessContextEngine(): null { return null; }
export function finalizeHarnessContextEngineTurn(): void {}
export function buildHarnessContextEngineRuntimeContext(): null { return null; }
export function buildHarnessContextEngineRuntimeContextFromUsage(): null { return null; }
export async function runHarnessContextEngineMaintenance(): Promise<void> {}
export function isActiveHarnessContextEngine(): boolean { return false; }
