/**
 * Session-scoped MCP runtime manager, catalog loader, and transport lifecycle.
 * Ported from openclaw/src/agents/agent-bundle-mcp-runtime.ts
 * Simplified: MCP SDK runtime creation replaced with no-op defaults.
 */

export const testing = {
  createSessionMcpRuntimeManager: () => null,
  async resetSessionMcpRuntimeManager() {},
  getCachedSessionIds: () => [] as string[],
  setBundleMcpCatalogListTimeoutMsForTest: () => {},
  resolveSessionMcpRuntimeIdleTtlMs: () => 600_000,
};

export function createBundleMcpJsonSchemaValidator(): any {
  return { getValidator: () => ({ valid: true, data: undefined, errorMessage: undefined }) };
}

export function resolveSessionMcpConfigSummary(_params: {
  workspaceDir: string;
  cfg?: any;
  manifestRegistry?: any;
}): { fingerprint: string; serverNames: string[] } {
  return { fingerprint: "", serverNames: [] };
}

export function createSessionMcpRuntime(_params: {
  sessionId: string;
  sessionKey?: string;
  workspaceDir: string;
  cfg?: any;
  manifestRegistry?: any;
}): null {
  return null;
}

export function getSessionMcpRuntimeManager(): null {
  return null;
}

export async function getOrCreateSessionMcpRuntime(_params: {
  sessionId: string;
  sessionKey?: string;
  workspaceDir: string;
  cfg?: any;
}): Promise<null> {
  return null;
}

export function peekSessionMcpRuntime(_params: {
  sessionId?: string | null;
  sessionKey?: string | null;
}): undefined {
  return undefined;
}

export async function disposeSessionMcpRuntime(_sessionId: string): Promise<void> {}
export async function retireSessionMcpRuntime(_params: {
  sessionId?: string | null;
  reason: string;
  onError?: (error: any, sessionId: string, reason: string) => void;
}): Promise<boolean> {
  return false;
}

export async function retireSessionMcpRuntimeForSessionKey(_params: {
  sessionKey?: string | null;
  reason: string;
  onError?: (error: any, sessionId: string, reason: string) => void;
}): Promise<boolean> {
  return false;
}

export async function disposeAllSessionMcpRuntimes(): Promise<void> {}
