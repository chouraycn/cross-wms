/**
 * Codex CLI and app-server bundle MCP projection helpers.
 *
 * 移植自 openclaw/src/agents/cli-runner/bundle-mcp-codex.ts
 *
 * 降级策略：
 *  - normalizeConfiguredMcpServers 在 cross-wms 中为 stub（返回 undefined），
 *    因此 buildCodexUserMcpServersThreadConfigPatch 在无用户配置时返回 undefined
 *  - serializeTomlInlineValue 在 cross-wms 中为 stub（返回 ""），
 *    injectCodexMcpConfigArgs 仍会追加 -c 参数，但 TOML 值为空
 */
import type { OpenClawConfig } from "../infra/_runtime-stubs.js";
import type { BundleMcpConfig, BundleMcpServerConfig } from "../plugins/bundle-mcp.js";
import { isValidAgentId, normalizeAgentId } from "../routing/session-key.js";
import { buildCodexMcpServersConfig, normalizeCodexMcpServerConfig } from "./codex-mcp-config.js";
import { serializeTomlInlineValue } from "./toml-inline.js";
import { normalizeConfiguredMcpServers } from "../config/mcp-config-normalize.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Mutable JSON shape structurally compatible with the bundled Codex
// app-server thread-config JsonObject.
type CodexThreadConfigValue =
  | string
  | number
  | boolean
  | null
  | CodexThreadConfigValue[]
  | { [key: string]: CodexThreadConfigValue };
type CodexThreadConfigObject = { [key: string]: CodexThreadConfigValue };

type CodexUserMcpServersProjectionOptions = {
  agentId?: string;
};

function normalizeAgentIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => isValidAgentId(entry))
    .map((entry) => normalizeAgentId(entry));
}

function readCodexProjectionConfig(server: BundleMcpServerConfig): Record<string, unknown> {
  return isRecord(server.codex) ? server.codex : {};
}

function isCodexMcpServerAllowedForAgent(
  server: BundleMcpServerConfig,
  options: CodexUserMcpServersProjectionOptions | undefined,
): boolean {
  const codex = readCodexProjectionConfig(server);
  if (!Object.hasOwn(codex, "agents")) {
    return true;
  }
  const agentIds = normalizeAgentIds(codex.agents);
  if (agentIds.length === 0 || !options?.agentId) {
    return false;
  }
  return agentIds.includes(normalizeAgentId(options.agentId));
}

/** Returns Codex CLI args with TOML MCP server overrides injected. */
export function injectCodexMcpConfigArgs(
  args: string[] | undefined,
  config: BundleMcpConfig,
): string[] {
  const overrides = serializeTomlInlineValue(buildCodexMcpServersConfig(config));
  return [...(args ?? []), "-c", `mcp_servers=${overrides}`];
}

/**
 * Codex app-server runtime receives its thread config as a JSON object through
 * JSON-RPC `thread/start`/`thread/resume`, not as `-c` CLI args. This returns a
 * thread-config patch projecting user-configured `cfg.mcp.servers` entries into
 * Codex's `mcp_servers` table using the same per-server normalization the CLI
 * path uses, so app-server agents see the same user MCP servers the CLI runtime
 * exposes via `injectCodexMcpConfigArgs`.
 *
 * Only user-configured servers (`cfg.mcp.servers`) are projected.
 */
export function buildCodexUserMcpServersThreadConfigPatch(
  cfg: OpenClawConfig | undefined,
  options?: CodexUserMcpServersProjectionOptions,
): { mcp_servers: CodexThreadConfigObject } | undefined {
  const userServers = normalizeConfiguredMcpServers(
    (cfg as { mcp?: { servers?: unknown } } | undefined)?.mcp?.servers,
  ) as Record<string, BundleMcpServerConfig> | undefined;
  if (!userServers) {
    return undefined;
  }
  const entries = Object.entries(userServers);
  if (entries.length === 0) {
    return undefined;
  }
  const mcp_servers: CodexThreadConfigObject = {};
  for (const [name, server] of entries) {
    if (server.enabled === false) {
      continue;
    }
    if (!isCodexMcpServerAllowedForAgent(server, options)) {
      continue;
    }
    mcp_servers[name] = normalizeCodexMcpServerConfig(
      name,
      server,
    ) as CodexThreadConfigObject;
  }
  if (Object.keys(mcp_servers).length === 0) {
    return undefined;
  }
  return { mcp_servers };
}
