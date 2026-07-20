/**
 * 移植自 openclaw/src/agents/codex-mcp-config.ts
 *
 * Projects enabled bundle MCP servers into Codex app-server thread config.
 * cross-wms provides simplified implementations since the full MCP config
 * infrastructure is not available.
 */

export type { CodexBundleMcpThreadConfig, CodexMcpServersConfig, LoadCodexBundleMcpThreadConfigParams } from "./codex-mcp-config.types.js";

/** Normalizes one bundle MCP server into Codex's mcp_servers shape. */
export function normalizeCodexMcpServerConfig(
  name: string,
  server: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  // Copy basic fields
  if (typeof server.command === "string") {
    next.command = server.command;
  }
  if (Array.isArray(server.args)) {
    next.args = server.args;
  }
  if (typeof server.url === "string") {
    next.url = server.url;
  }
  // Default approval mode for loopback servers
  if (
    name === "openclaw" &&
    typeof server.url === "string" &&
    /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/mcp/.test(server.url)
  ) {
    next.default_tools_approval_mode = "approve";
  }
  // Copy headers
  if (server.headers && typeof server.headers === "object" && !Array.isArray(server.headers)) {
    next.http_headers = server.headers;
  }
  return next;
}

/** Build Codex mcp_servers config from normalized bundle MCP config. */
export function buildCodexMcpServersConfig(config: {
  mcpServers: Record<string, Record<string, unknown>>;
}): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(config.mcpServers).map(([name, server]) => [
      name,
      normalizeCodexMcpServerConfig(name, server),
    ]),
  );
}

/** Load bundle MCP config for one Codex app-server thread. */
export function loadCodexBundleMcpThreadConfig(
  params: {
    toolsEnabled?: boolean;
    disableTools?: boolean;
    toolsAllow?: unknown;
    workspaceDir: string;
    cfg?: unknown;
  },
): Record<string, unknown> {
  // cross-wms does not have the full MCP bundle loading infrastructure.
  // Return an evaluated empty config.
  const toolsEnabled = params.toolsEnabled ?? true;
  const disableTools = params.disableTools === true;
  if (!toolsEnabled || disableTools) {
    return { diagnostics: [], evaluated: true };
  }
  return { diagnostics: [], evaluated: true };
}
