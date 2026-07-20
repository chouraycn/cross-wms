/**
 * Ported from openclaw/src/agents/bash-tools.process.ts
 *
 * Bash process tool creation.
 * Cross-wms degradation: returns placeholder tool without process management.
 */

export type ProcessToolDefaults = Record<string, unknown>;

/** Placeholder process tool. */
export const processTool: Record<string, unknown> = {
  name: "process",
  description: "Manage background bash processes (cross-wms placeholder).",
};

/** Creates a process tool instance. */
export function createProcessTool(..._args: unknown[]): Record<string, unknown> {
  return {
    name: "process",
    description: "Manage background bash processes (cross-wms placeholder).",
    parameters: { type: "object", properties: { action: { type: "string" } } },
    execute: async () => ({ output: "Process tool not available in cross-wms" }),
  };
}
