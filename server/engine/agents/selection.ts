/**
 * 移植自 openclaw/src/agents/harness/selection.ts
 *
 * Selects and invokes native agent harnesses for embedded run attempts.
 * cross-wms 简化实现：始终使用 openclaw 默认 harness。
 */

/** Resolves the harness policy — defaults to openclaw runtime. */
export function resolveAvailableAgentHarnessPolicy(_params: {
  provider?: string;
  modelId?: string;
  config?: unknown;
  agentId?: string;
  sessionKey?: string;
  env?: NodeJS.ProcessEnv;
}): { runtime: string; runtimeSource: string } {
  return { runtime: "openclaw", runtimeSource: "default" };
}

/** Selects an agent harness — always returns openclaw in cross-wms. */
export function selectAgentHarness(_params: {
  provider: string;
  modelId?: string;
  config?: unknown;
  agentId?: string;
  sessionKey?: string;
  agentHarnessId?: string;
  agentHarnessRuntimeOverride?: string;
}): { id: string; label: string } {
  return { id: "openclaw", label: "OpenClaw" };
}

/** Runs an agent harness attempt — delegates to openclaw harness. */
export async function runAgentHarnessAttempt(_params: unknown): Promise<unknown> {
  throw new Error("runAgentHarnessAttempt requires full openclaw runtime");
}

/** Resolves plugin harness policy tools allow — returns undefined (no restriction) in cross-wms. */
export function resolvePluginHarnessPolicyToolsAllow(_params: unknown): [] | undefined {
  return undefined;
}
