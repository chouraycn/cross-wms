/**
 * 移植自 openclaw/src/agents/cli-runner/bundle-mcp-codex.ts
 *
 * Codex CLI bundle MCP adapter.
 * In cross-wms the Codex CLI integration is not available,
 * so both functions throw descriptive errors when invoked at runtime.
 */

/** Inject Codex MCP config args (unsupported in cross-wms). */
export function injectCodexMcpConfigArgs(..._args: unknown[]): never {
  throw new Error("Codex MCP config injection is not supported in cross-wms");
}

/** Build Codex user MCP servers thread config patch (unsupported in cross-wms). */
export function buildCodexUserMcpServersThreadConfigPatch(..._args: unknown[]): never {
  throw new Error("Codex MCP thread config patch is not supported in cross-wms");
}
