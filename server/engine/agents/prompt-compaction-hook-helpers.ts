/**
 * 移植自 openclaw/src/agents/harness/prompt-compaction-hook-helpers.ts
 *
 * Agent harness prompt and compaction hook helpers.
 * cross-wms 简化实现：钩子运行器为空操作（无插件系统）。
 */

/** Prompt/developer-instruction pair after harness prompt-build hooks run. */
type AgentHarnessPromptBuildResult = {
  prompt: string;
  developerInstructions: string;
  promptInputRange?: { start: number; end: number };
};

/** Runs before-prompt hooks and returns the adjusted prompt fields. */
export async function resolveAgentHarnessBeforePromptBuildResult(params: {
  prompt: string;
  developerInstructions: string;
  messages: unknown[];
  ctx?: unknown;
  beforeAgentStartResult?: unknown;
}): Promise<AgentHarnessPromptBuildResult> {
  // Simplified: no plugin hooks in cross-wms, return inputs as-is
  return {
    prompt: params.prompt,
    developerInstructions: params.developerInstructions,
    promptInputRange: { start: 0, end: params.prompt.length },
  };
}

/** Runs best-effort before-compaction hooks for a harness session. */
export async function runAgentHarnessBeforeCompactionHook(_params: {
  sessionFile: string;
  messages?: unknown[];
  ctx?: unknown;
}): Promise<void> {
  // No-op: no plugin hooks in cross-wms
}

/** Runs best-effort after-compaction hooks for a harness session. */
export async function runAgentHarnessAfterCompactionHook(_params: {
  sessionFile: string;
  messages?: unknown[];
  ctx?: unknown;
  compactedCount: number;
}): Promise<void> {
  // No-op: no plugin hooks in cross-wms
}
