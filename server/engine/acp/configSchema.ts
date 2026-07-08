export const DEFAULT_ACPX_TIMEOUT_SECONDS = 60;
export const DEFAULT_ACPX_PERMISSION_MODE: AcpxPermissionMode = "prompt";

export type AcpxPermissionMode = "allow" | "deny" | "prompt";

export type ResolvedAcpxPluginConfig = {
  cwd: string;
  stateDir: string;
  agents: Record<string, string>;
  probeAgent?: string;
  mcpServers?: unknown[];
  permissionMode?: AcpxPermissionMode;
  nonInteractivePermissions?: string[];
  timeoutSeconds?: number;
  legacyCompatibilityConfig: {
    queueOwnerTtlSeconds?: number;
    strictWindowsCmdWrapper?: boolean;
  };
};

export type RawAcpxPluginConfig = {
  agents?: Record<string, string>;
  probeAgent?: string;
  mcpServers?: unknown[];
  permissionMode?: string;
  nonInteractivePermissions?: string[];
  timeoutSeconds?: number;
  legacyCompatibilityConfig?: {
    queueOwnerTtlSeconds?: number;
    strictWindowsCmdWrapper?: boolean;
  };
};

export function parseAcpxPermissionMode(value: string | undefined): AcpxPermissionMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "deny") {
    return "deny";
  }
  if (normalized === "allow") {
    return "allow";
  }
  return DEFAULT_ACPX_PERMISSION_MODE;
}