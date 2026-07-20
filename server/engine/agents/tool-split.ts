/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/tool-split.ts
 *
 * Splits SDK tools from OpenClaw tool definitions for provider calls.
 * In cross-wms the full tool definition adapter is not available,
 * so splitSdkTools returns an empty custom tools list.
 */

export function splitSdkTools(_options: {
  tools?: unknown[];
  sandboxEnabled?: boolean;
  toolHookContext?: unknown;
}): {
  customTools: unknown[];
} {
  return {
    customTools: [],
  };
}
