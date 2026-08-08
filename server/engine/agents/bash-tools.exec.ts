/**
 * Ported from openclaw/src/agents/bash-tools.exec.ts
 *
 * Bash exec tool creation.
 * Cross-wms degradation: returns placeholder tool without execution capability.
 */

export type { BashSandboxConfig } from "./bash-tools.shared.js";
export type { ExecElevatedDefaults, ExecToolDefaults, ExecToolDetails } from "./bash-tools.exec-types.js";

/** Placeholder exec tool. */
export const execTool: Record<string, any> = {
  name: "exec",
  description: "Execute bash commands (cross-wms placeholder).",
};

/** Testing exports. */
export const testing: Record<string, any> = {};

/** Creates an exec tool instance. */
export function createExecTool(..._args: any[]): Record<string, any> {
  return {
    name: "exec",
    description: "Execute bash commands (cross-wms placeholder).",
    parameters: { type: "object", properties: { command: { type: "string" } } },
    execute: async () => ({ output: "Exec tool not available in cross-wms" }),
  };
}
