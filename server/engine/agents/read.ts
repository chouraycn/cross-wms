/**
 * Ported from openclaw/src/agents/sessions/tools/read.ts
 *
 * Read tool definition and factory.
 * Cross-wms degradation: returns placeholder tool without file reading.
 */

export type ReadOperations = Record<string, any>;
export type ReadToolOptions = Record<string, any>;

/** Creates a read tool definition. */
export function createReadToolDefinition(..._args: any[]): Record<string, any> {
  return {
    name: "read",
    description: "Read file contents.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
    },
  };
}

/** Creates a read tool instance. */
export function createReadTool(..._args: any[]): Record<string, any> {
  return {
    ...createReadToolDefinition(),
    execute: async () => ({ output: "Read tool not available in cross-wms" }),
  };
}
