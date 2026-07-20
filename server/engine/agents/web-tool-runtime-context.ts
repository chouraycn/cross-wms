/**
 * 移植自 openclaw/src/agents/tools/web-tool-runtime-context.ts
 *
 * Web tool runtime context resolution.
 * In cross-wms the full web tool runtime is not available,
 * so both functions return null context objects.
 */

/** Resolve runtime context for the web search tool (returns empty context in cross-wms). */
export function resolveWebSearchToolRuntimeContext(..._args: unknown[]): null {
  return null;
}

/** Resolve runtime context for the web fetch tool (returns empty context in cross-wms). */
export function resolveWebFetchToolRuntimeContext(..._args: unknown[]): null {
  return null;
}
