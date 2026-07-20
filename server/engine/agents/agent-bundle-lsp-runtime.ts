/**
 * 移植自 openclaw/src/agents/agent-bundle-lsp-runtime.ts
 *
 * Session-scoped embedded LSP runtime and tool materialization for agent bundles.
 * cross-wms provides a no-op implementation since the full LSP infrastructure
 * (process spawning, JSON-RPC framing, tool registration) is not available.
 */

/** Materialized LSP tools plus session capabilities and cleanup handle. */
export type BundleLspToolRuntime = {
  tools: unknown[];
  sessions: Array<{ serverName: string; capabilities: Record<string, unknown> }>;
  dispose: () => Promise<void>;
};

/**
 * Spawns one LSP server process. In cross-wms this returns undefined
 * since process spawning infrastructure is not available.
 */
export function spawnLspServerProcess(_config: Record<string, unknown>): undefined {
  // cross-wms does not have the LSP process spawning infrastructure.
  return undefined;
}

/**
 * Creates bundle LSP tool runtime by loading LSP server config and spawning processes.
 * In cross-wms this returns an empty runtime since the full infrastructure is not available.
 */
export async function createBundleLspToolRuntime(_params: {
  workspaceDir: string;
  cfg?: unknown;
  reservedToolNames?: Iterable<string>;
}): Promise<BundleLspToolRuntime> {
  // cross-wms lacks LSP config loading, process spawning, and tool registration.
  return { tools: [], sessions: [], dispose: async () => {} };
}

/** Disposes all active bundle LSP runtimes — no-op in cross-wms. */
export async function disposeAllBundleLspRuntimes(): Promise<void> {
  // No active sessions to dispose in cross-wms.
}
