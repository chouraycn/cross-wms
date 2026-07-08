import { createHash } from "node:crypto";
import { POLICY_TOOL_GROUPS } from "./toolPolicyConformance.js";

export type PolicyAttestation = {
  readonly checkedAt: string;
  readonly policy?: {
    readonly path: string;
    readonly hash: string;
  };
  readonly workspace: {
    readonly scope: "policy";
    readonly hash: string;
  };
  readonly findingsHash?: string;
  readonly attestationHash?: string;
};

export type PolicyEvidence = {
  readonly channels: readonly PolicyChannelEvidence[];
  readonly tools?: readonly PolicyToolEvidence[];
  readonly toolPosture?: readonly PolicyToolPostureEvidence[];
  readonly sandboxPosture?: readonly PolicySandboxPostureEvidence[];
  readonly mcpServers: readonly PolicyMcpServerEvidence[];
  readonly modelProviders: readonly PolicyModelProviderEvidence[];
  readonly modelRefs: readonly PolicyModelRefEvidence[];
  readonly network: readonly PolicyNetworkEvidence[];
  readonly ingress?: readonly PolicyIngressEvidence[];
  readonly gatewayExposure?: readonly PolicyGatewayExposureEvidence[];
  readonly agentWorkspace?: readonly PolicyAgentWorkspaceEvidence[];
  readonly dataHandling?: readonly PolicyDataHandlingEvidence[];
  readonly secrets?: readonly PolicySecretEvidence[];
  readonly authProfiles?: readonly PolicyAuthProfileEvidence[];
  readonly execApprovals?: readonly PolicyExecApprovalEvidence[];
};

export type PolicyChannelEvidence = {
  readonly id: string;
  readonly provider: string;
  readonly source: string;
  readonly enabled?: boolean;
};

export type PolicyMcpServerEvidence = {
  readonly id: string;
  readonly transport: "stdio" | "sse" | "streamable-http" | "unknown";
  readonly source: string;
  readonly command?: string;
  readonly url?: string;
};

export type PolicyToolEvidence = {
  readonly id: string;
  readonly source: string;
  readonly line: number;
  readonly risk?: string;
  readonly sensitivity?: string;
  readonly owner?: string;
  readonly capabilities?: readonly string[];
};

export type PolicyToolPostureEvidence = {
  readonly id: string;
  readonly kind:
    | "allow"
    | "alsoAllow"
    | "deny"
    | "elevatedAllowFrom"
    | "elevatedEnabled"
    | "execAsk"
    | "execHost"
    | "execSecurity"
    | "fsWorkspaceOnly"
    | "profile";
  readonly source: string;
  readonly scope: "global" | "agent";
  readonly agentId?: string;
  readonly value?: boolean | string;
  readonly entries?: readonly string[];
  readonly explicit?: boolean;
};

export type PolicySandboxPostureEvidence = {
  readonly id: string;
  readonly kind:
    | "backend"
    | "browserCdpSourceRange"
    | "containerMount"
    | "containerNetwork"
    | "containerSecurityProfile"
    | "mode";
  readonly source: string;
  readonly scope: "defaults" | "agent";
  readonly agentId?: string;
  readonly value?: boolean | string;
  readonly bind?: string;
  readonly bindMode?: string;
  readonly bindHost?: string;
  readonly bindSurface?: "browser" | "docker";
  readonly networkSurface?: "browser" | "docker";
  readonly profile?: "apparmor" | "seccomp";
  readonly explicit?: boolean;
};

export type PolicyModelProviderEvidence = {
  readonly id: string;
  readonly source: string;
};

export type PolicyModelRefEvidence = {
  readonly ref: string;
  readonly provider: string;
  readonly model: string;
  readonly source: string;
};

export type PolicyNetworkEvidence = {
  readonly id: string;
  readonly source: string;
  readonly value: boolean;
};

export type PolicyIngressEvidence = {
  readonly id: string;
  readonly kind:
    | "channelDmPolicy"
    | "channelGroupPolicy"
    | "channelRequireMention"
    | "sessionDmScope";
  readonly source: string;
  readonly channel?: string;
  readonly accountId?: string;
  readonly groupId?: string;
  readonly value?: boolean | string;
  readonly explicit?: boolean;
};

export type PolicyGatewayExposureEvidence = {
  readonly id: string;
  readonly kind:
    | "auth"
    | "authRateLimit"
    | "bind"
    | "controlUi"
    | "httpEndpoint"
    | "httpUrlFetch"
    | "remote"
    | "tailscale";
  readonly source: string;
  readonly value?: boolean | string;
  readonly nonLoopback?: boolean;
  readonly explicit?: boolean;
  readonly endpoint?: string;
  readonly hasAllowlist?: boolean;
};

export type PolicyAgentWorkspaceEvidence = {
  readonly id: string;
  readonly kind: "workspaceAccess" | "toolDeny";
  readonly source: string;
  readonly scope: "defaults" | "agent";
  readonly agentId?: string;
  readonly value?: string;
  readonly sandboxMode?: string;
  readonly sandboxModeSource?: string;
  readonly sandboxEnabled?: boolean;
  readonly tool?: string;
  readonly denied?: boolean;
  readonly explicit?: boolean;
};

export type PolicySecretEvidence = {
  readonly id: string;
  readonly kind: "input" | "provider";
  readonly source: string;
  readonly provenance?: "secretRef";
  readonly refSource?: "env" | "file" | "exec";
  readonly refProvider?: string;
  readonly providerSource?: string;
  readonly insecure?: readonly string[];
};

export type PolicyAuthProfileEvidence = {
  readonly id: string;
  readonly source: string;
  readonly validMetadata: boolean;
  readonly provider?: string;
  readonly mode?: string;
};

export type PolicyExecApprovalEvidence = {
  readonly id: string;
  readonly kind: "agent" | "allowlist" | "defaults";
  readonly source: string;
  readonly agentId?: string;
  readonly security?: string;
  readonly securityConfigured?: boolean;
  readonly ask?: string;
  readonly askFallback?: string;
  readonly autoAllowSkills?: boolean;
  readonly pattern?: string;
  readonly argPattern?: string;
  readonly entrySource?: string;
};

export type PolicyDataHandlingEvidence = {
  readonly id: string;
  readonly kind:
    | "memorySessionTranscriptIndexing"
    | "sensitiveLoggingRedaction"
    | "sessionRetentionMode"
    | "telemetryContentCapture";
  readonly source: string;
  readonly scope: "global" | "agent";
  readonly agentId?: string;
  readonly value?: boolean | string;
  readonly explicit?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function ocPathSegment(value: string): string {
  if (/^(?:[A-Za-z0-9_-]+|#\d+)$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

export function policyDocumentHash(policy: unknown): string {
  return sha256(stableJson(policy));
}

export function policyWorkspaceHash(evidence: PolicyEvidence): string {
  return sha256(stableJson(evidence));
}

export function policyFindingsHash(findings: readonly unknown[]): string {
  return sha256(stableJson(findings));
}

export function policyAttestationHash(input: {
  readonly ok: boolean;
  readonly policyHash?: string;
  readonly workspaceHash: string;
  readonly findingsHash: string;
}): string {
  return sha256(stableJson(input));
}

export function createPolicyAttestation(input: {
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly policyPath: string;
  readonly policyHash?: string;
  readonly evidence: PolicyEvidence;
  readonly findings: readonly unknown[];
}): PolicyAttestation {
  const workspaceHash = policyWorkspaceHash(input.evidence);
  const findingsHash = policyFindingsHash(input.findings);
  return {
    checkedAt: input.checkedAt,
    ...(input.policyHash === undefined
      ? {}
      : {
          policy: {
            path: input.policyPath,
            hash: input.policyHash,
          },
        }),
    workspace: {
      scope: "policy",
      hash: workspaceHash,
    },
    findingsHash,
    attestationHash: policyAttestationHash({
      ok: input.ok,
      policyHash: input.policyHash,
      workspaceHash,
      findingsHash,
    }),
  };
}

export function scanPolicyChannels(cfg: Record<string, unknown>): readonly PolicyChannelEvidence[] {
  const channels = isRecord(cfg.channels) ? cfg.channels : {};
  return Object.entries(channels)
    .filter(([id]) => !["defaults", "modelByChannel"].includes(id))
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => {
      const entry: PolicyChannelEvidence = {
        id,
        provider: id,
        source: `oc://openclaw.config/channels/${id}`,
      };
      if (isRecord(value) && typeof value.enabled === "boolean") {
        entry.enabled = value.enabled;
      }
      return entry;
    });
}

export function scanPolicyMcpServers(
  cfg: Record<string, unknown>,
): readonly PolicyMcpServerEvidence[] {
  const mcp = isRecord(cfg.mcp) ? cfg.mcp : {};
  const servers = isRecord(mcp.servers) ? mcp.servers : {};
  return Object.entries(servers)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => {
      const entry: PolicyMcpServerEvidence = {
        id,
        transport: "unknown" as const,
        source: `oc://openclaw.config/mcp/servers/${ocPathSegment(id)}`,
      };
      if (isRecord(value)) {
        if (typeof value.command === "string") {
          entry.command = value.command;
        }
        if (typeof value.url === "string") {
          entry.url = value.url;
        }
      }
      return entry;
    });
}

export function scanPolicyModelProviders(
  cfg: Record<string, unknown>,
): readonly PolicyModelProviderEvidence[] {
  const models = isRecord(cfg.models) ? cfg.models : {};
  const providers = isRecord(models.providers) ? models.providers : {};
  return Object.keys(providers)
    .toSorted((a, b) => a.localeCompare(b))
    .map((id) => ({
      id,
      source: `oc://openclaw.config/models/providers/${id}`,
    }));
}

export function scanPolicyNetwork(cfg: Record<string, unknown>): readonly PolicyNetworkEvidence[] {
  return [];
}

export function collectPolicyEvidence(
  cfg: Record<string, unknown>,
  options?: {
    readonly includeIngress?: boolean;
    readonly includeGatewayExposure?: boolean;
    readonly includeAgentWorkspace?: boolean;
    readonly includeDataHandling?: boolean;
    readonly includeToolPosture?: boolean;
    readonly includeSandboxPosture?: boolean;
    readonly includeSecrets?: boolean;
    readonly includeAuthProfiles?: boolean;
    readonly includeExecApprovals?: boolean;
  },
): PolicyEvidence {
  return {
    channels: scanPolicyChannels(cfg),
    mcpServers: scanPolicyMcpServers(cfg),
    modelProviders: scanPolicyModelProviders(cfg),
    modelRefs: [],
    network: scanPolicyNetwork(cfg),
    ...(options?.includeIngress === false ? {} : { ingress: [] }),
    ...(options?.includeGatewayExposure === false ? {} : { gatewayExposure: [] }),
    ...(options?.includeAgentWorkspace === false ? {} : { agentWorkspace: [] }),
    ...(options?.includeDataHandling === false ? {} : { dataHandling: [] }),
    ...(options?.includeToolPosture === false ? {} : { toolPosture: [] }),
    ...(options?.includeSandboxPosture === false ? {} : { sandboxPosture: [] }),
    ...(options?.includeSecrets === false ? {} : { secrets: [] }),
    ...(options?.includeAuthProfiles === false ? {} : { authProfiles: [] }),
    ...(options?.includeExecApprovals === false ? {} : { execApprovals: [] }),
  };
}