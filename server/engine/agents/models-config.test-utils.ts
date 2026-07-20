/**
 * Ported from openclaw/src/agents/models-config.test-utils.ts
 *
 * Test utility for reading generated models JSON.
 * Cross-wms degradation: returns undefined since generated file may not exist.
 */

/** Reads the generated models JSON file for test assertions. */
export function readGeneratedModelsJson(
  _filePath?: string,
): Record<string, unknown> | undefined {
  // Cross-wms does not have the generated models JSON artifact in the same location.
  return undefined;
}
