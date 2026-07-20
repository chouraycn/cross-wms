/**
 * Agent tool execution sandbox context.
 * Ported from openclaw/src/agents/test-helpers/agent-tools-sandbox-context.ts
 *
 * Note: Full sandbox infrastructure not available in cross-wms.
 */

type SandboxContext = {
  sandboxRoot?: string;
  containerId?: string;
  isAvailable: boolean;
  env?: Record<string, string>;
};

/** Create a sandbox context for tool execution. */
export function createToolSandboxContext(params?: {
  sandboxRoot?: string;
  containerId?: string;
  env?: Record<string, string>;
}): SandboxContext {
  // Full sandbox infrastructure not available in cross-wms
  return {
    sandboxRoot: params?.sandboxRoot,
    containerId: params?.containerId,
    isAvailable: false,
    env: params?.env,
  };
}

/** Check if a sandbox context is active and usable. */
export function isToolSandboxActive(context: SandboxContext): boolean {
  return context.isAvailable && Boolean(context.sandboxRoot);
}
