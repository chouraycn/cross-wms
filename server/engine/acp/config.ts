import * as path from "node:path";
import { parseAcpxPermissionMode, type RawAcpxPluginConfig, type ResolvedAcpxPluginConfig } from "./configSchema.js";

export function resolveAcpxPluginConfig(params: {
  rawConfig?: unknown;
  workspaceDir: string;
}): ResolvedAcpxPluginConfig {
  const config = (params.rawConfig as RawAcpxPluginConfig) ?? {};
  const workspaceDir = params.workspaceDir;
  const stateDir = path.join(workspaceDir, ".openclaw", "acpx");

  return {
    cwd: workspaceDir,
    stateDir,
    agents: config.agents ?? {},
    probeAgent: config.probeAgent,
    mcpServers: config.mcpServers,
    permissionMode: parseAcpxPermissionMode(config.permissionMode),
    nonInteractivePermissions: config.nonInteractivePermissions ?? [],
    timeoutSeconds: config.timeoutSeconds,
    legacyCompatibilityConfig: {
      queueOwnerTtlSeconds: config.legacyCompatibilityConfig?.queueOwnerTtlSeconds,
      strictWindowsCmdWrapper: config.legacyCompatibilityConfig?.strictWindowsCmdWrapper,
    },
  };
}

export function toAcpMcpServers(mcpServers?: unknown[]): unknown[] {
  return mcpServers ?? [];
}