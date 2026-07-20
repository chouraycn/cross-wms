/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/sandbox-info.ts
 *
 * Builds sandbox/full-access status metadata for embedded-agent run results.
 */

type EmbeddedFullAccessBlockedReason = "host-policy" | "elevated-disabled";

type EmbeddedFullAccessExecPolicy = {
  mode?: string;
  security?: string;
  ask?: string;
};

type EmbeddedFullAccessHostPolicy = {
  security?: string;
  ask?: string;
};

type ExecElevatedDefaults = {
  enabled?: boolean;
  allowed?: boolean;
  fullAccessAvailable?: boolean;
  fullAccessBlockedReason?: EmbeddedFullAccessBlockedReason;
  defaultLevel?: string;
};

type EmbeddedSandboxInfo = {
  enabled: true;
  workspaceDir: string;
  containerWorkspaceDir?: string;
  workspaceAccess?: string;
  agentWorkspaceMount?: string;
  browserBridgeUrl?: string;
  hostBrowserAllowed?: boolean;
  elevated?: {
    allowed: boolean;
    defaultLevel: string;
    fullAccessAvailable: boolean;
    fullAccessBlockedReason?: EmbeddedFullAccessBlockedReason;
  };
};

function execPolicyBlocksFullAccess(params: {
  execPolicy?: EmbeddedFullAccessExecPolicy;
  hostPolicy?: EmbeddedFullAccessHostPolicy;
}): boolean {
  return (
    (params.execPolicy?.mode !== undefined && params.execPolicy.mode !== "full") ||
    (params.execPolicy?.security !== undefined && params.execPolicy.security !== "full") ||
    (params.execPolicy?.ask !== undefined && params.execPolicy.ask === "always") ||
    (params.hostPolicy?.security !== undefined && params.hostPolicy.security !== "full") ||
    (params.hostPolicy?.ask !== undefined && params.hostPolicy.ask === "always")
  );
}

/** Computes whether elevated exec can provide full host access for an embedded turn. */
export function resolveEmbeddedFullAccessState(params: {
  execElevated?: ExecElevatedDefaults;
  execPolicy?: EmbeddedFullAccessExecPolicy;
  hostPolicy?: EmbeddedFullAccessHostPolicy;
}): {
  available: boolean;
  blockedReason?: EmbeddedFullAccessBlockedReason;
} {
  if (execPolicyBlocksFullAccess(params)) {
    return {
      available: false,
      blockedReason: "host-policy",
    };
  }
  if (params.execElevated?.fullAccessAvailable === true) {
    return { available: true };
  }
  if (params.execElevated?.fullAccessAvailable === false) {
    return {
      available: false,
      blockedReason: params.execElevated.fullAccessBlockedReason ?? "host-policy",
    };
  }
  if (!params.execElevated?.enabled || !params.execElevated.allowed) {
    return {
      available: false,
      blockedReason: "host-policy",
    };
  }
  return { available: true };
}

/** Resolves the effective exec policy for sandbox-info reporting. */
export function resolveEmbeddedSandboxInfoExecPolicy(params: {
  config?: unknown;
  agentId?: string;
  sessionKey?: string;
  sandboxAvailable?: boolean;
  execOverrides?: Record<string, unknown>;
}): EmbeddedFullAccessExecPolicy {
  // cross-wms defaults: full access mode unless sandbox constrains it.
  return {
    mode: params.sandboxAvailable ? "sandbox" : "full",
    security: params.sandboxAvailable ? "sandbox" : "full",
    ask: "never",
  };
}

/** Builds the serializable sandbox metadata attached to embedded agent run results. */
export function buildEmbeddedSandboxInfo(
  sandbox?: { enabled?: boolean; workspaceDir?: string; containerWorkdir?: string; workspaceAccess?: string; browser?: { bridgeUrl?: string }; browserAllowHostControl?: boolean } | null,
  execElevated?: ExecElevatedDefaults,
  execPolicy?: EmbeddedFullAccessExecPolicy,
  hostPolicy?: EmbeddedFullAccessHostPolicy,
): EmbeddedSandboxInfo | undefined {
  if (!sandbox?.enabled) {
    return undefined;
  }
  const elevatedConfigured = execElevated?.enabled === true;
  const elevatedAllowed = Boolean(execElevated?.enabled && execElevated.allowed);
  const fullAccess = resolveEmbeddedFullAccessState({
    execElevated,
    execPolicy,
    hostPolicy,
  });
  return {
    enabled: true,
    workspaceDir: sandbox.workspaceDir ?? "",
    containerWorkspaceDir: sandbox.containerWorkdir,
    workspaceAccess: sandbox.workspaceAccess,
    agentWorkspaceMount: sandbox.workspaceAccess === "ro" ? "/agent" : undefined,
    browserBridgeUrl: sandbox.browser?.bridgeUrl,
    hostBrowserAllowed: sandbox.browserAllowHostControl,
    ...(elevatedConfigured
      ? {
          elevated: {
            allowed: elevatedAllowed,
            defaultLevel: execElevated?.defaultLevel ?? "off",
            fullAccessAvailable: fullAccess.available,
            ...(fullAccess.blockedReason
              ? { fullAccessBlockedReason: fullAccess.blockedReason }
              : {}),
          },
        }
      : {}),
  };
}
