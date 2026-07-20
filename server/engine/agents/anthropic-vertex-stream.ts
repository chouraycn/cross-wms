/**
 * Ported from openclaw/src/agents/anthropic-vertex-stream.ts
 *
 * Anthropic Vertex AI stream function creation.
 * Cross-wms degradation: returns undefined without Vertex AI integration.
 */

/** Creates an Anthropic Vertex stream function for a model. */
export function createAnthropicVertexStreamFnForModel(..._args: unknown[]): undefined {
  // Cross-wms does not have Anthropic Vertex AI stream integration.
  return undefined;
}
