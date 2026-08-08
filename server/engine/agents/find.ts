/**
 * Ported from openclaw/src/agents/sessions/tools/find.ts
 *
 * Find tool definition and factory.
 * Cross-wms degradation: returns placeholder tool without file search.
 */

export type FindOperations = Record<string, any>;
export type FindToolOptions = Record<string, any>;

/** Creates a find tool definition. */
export function createFindToolDefinition(..._args: any[]): Record<string, any> {
  return {
    name: "find",
    description: "Search for files by name pattern.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern to match" },
      },
    },
  };
}

/** Creates a find tool instance. */
export function createFindTool(..._args: any[]): Record<string, any> {
  return {
    ...createFindToolDefinition(),
    execute: async () => ({ output: "Find tool not available in cross-wms" }),
  };
}
