/**
 * 移植自 openclaw/src/agents/agent-tools.policy.ts
 *
 * Resolves sandbox tool policies for agents, providers, sub-agents, and group
 * sessions. Keeps runtime tool filtering tied to canonical config, session
 * provenance, and inherited sub-agent capabilities.
 *
 * Simplified for cross-wms: channel plugins, session conversations, and
 * group-policy resolution replaced with simple structural checks.
 */

import type { SubagentSessionRole, SessionCapabilityStore } from "./subagent-capabilities.js";

export type SandboxToolPolicy = {
  allow?: string[];
  deny?: string[];
  profile?: string;
  alsoAllow?: string[];
};

type AnyAgentTool = {
  name: string;
  [key: string]: unknown;
};

type AgentToolsConfig = {
  profile?: string;
  allow?: string[];
  deny?: string[];
  alsoAllow?: string[];
  byProvider?: Record<string, AgentToolsConfig>;
  exec?: unknown;
  fs?: unknown;
  subagents?: {
    tools?: {
      allow?: string[];
      deny?: string[];
      alsoAllow?: string[];
    };
  };
  [key: string]: unknown;
};

type OpenClawConfig = {
  tools?: AgentToolsConfig;
  agents?: {
    defaults?: {
      subagents?: {
        maxSpawnDepth?: number;
      };
    };
  };
  [key: string]: unknown;
};

/**
 * Tools always denied for sub-agents regardless of depth.
 * These are system-level or interactive tools that sub-agents should never use.
 */
const SUBAGENT_TOOL_DENY_ALWAYS = [
  "gateway",
  "agents_list",
  "session_status",
  "cron",
  "sessions_send",
];

/** Tools that only make sense for orchestrator sub-agents that can spawn children. */
const SUBAGENT_TOOL_DENY_LEAF = [
  "subagents",
  "sessions_list",
  "sessions_history",
  "sessions_spawn",
];

function resolveSubagentDenyListForRole(role: SubagentSessionRole): string[] {
  if (role === "leaf") {
    return [...SUBAGENT_TOOL_DENY_ALWAYS, ...SUBAGENT_TOOL_DENY_LEAF];
  }
  return [...SUBAGENT_TOOL_DENY_ALWAYS];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

function mergeConfiguredSubagentAllow(
  allow: string[] | undefined,
  alsoAllow: string[] | undefined,
): string[] | undefined {
  return allow && alsoAllow ? uniqueStrings([...allow, ...alsoAllow]) : allow;
}

/** Resolve sub-agent tool policy from stored session capabilities. */
export function resolveSubagentToolPolicyForSession(
  cfg: OpenClawConfig | undefined,
  sessionKey: string,
  opts?: {
    store?: SessionCapabilityStore;
  },
): SandboxToolPolicy {
  const configured = cfg?.tools?.subagents?.tools;
  const allow = Array.isArray(configured?.allow) ? configured!.allow : undefined;
  const alsoAllow = Array.isArray(configured?.alsoAllow) ? configured!.alsoAllow : undefined;
  const explicitAllow = new Set(
    [...(allow ?? []), ...(alsoAllow ?? [])].map((toolName) => normalizeToolName(toolName)),
  );
  // Default to "leaf" role for subagent sessions
  const role: SubagentSessionRole = "leaf";
  const deny = [
    ...resolveSubagentDenyListForRole(role).filter(
      (toolName) => !explicitAllow.has(normalizeToolName(toolName)),
    ),
    ...(Array.isArray(configured?.deny) ? configured!.deny : []),
  ];
  const mergedAllow = mergeConfiguredSubagentAllow(allow, alsoAllow);
  return { allow: mergedAllow, deny };
}

/** Resolve the tool policy inherited from a parent sub-agent session. */
export function resolveInheritedToolPolicyForSession(
  _cfg: OpenClawConfig | undefined,
  _sessionKey: string | undefined | null,
  _opts?: {
    store?: SessionCapabilityStore;
  },
): SandboxToolPolicy | undefined {
  // Simplified: no stored inherited tool policy in cross-wms
  return undefined;
}

/** Filter runtime tools by sandbox allow/deny policy. */
export function filterToolsByPolicy(tools: AnyAgentTool[], policy?: SandboxToolPolicy) {
  if (!policy) {
    return tools;
  }
  return tools.filter((tool) => {
    const name = normalizeToolName(tool.name);
    if (policy.deny?.some((denied) => normalizeToolName(denied) === name)) {
      return false;
    }
    if (policy.allow && policy.allow.length > 0) {
      return policy.allow.some((allowed) => normalizeToolName(allowed) === name);
    }
    return true;
  });
}

function pickSandboxToolPolicy(toolsConfig: AgentToolsConfig | undefined): SandboxToolPolicy | undefined {
  if (!toolsConfig) return undefined;
  const hasAllow = Array.isArray(toolsConfig.allow) && toolsConfig.allow.length > 0;
  const hasDeny = Array.isArray(toolsConfig.deny) && toolsConfig.deny.length > 0;
  const hasProfile = typeof toolsConfig.profile === "string" && toolsConfig.profile.trim();
  const hasAlsoAllow = Array.isArray(toolsConfig.alsoAllow) && toolsConfig.alsoAllow.length > 0;
  if (!hasAllow && !hasDeny && !hasProfile && !hasAlsoAllow) return undefined;
  return {
    ...(hasProfile ? { profile: toolsConfig.profile!.trim() } : {}),
    ...(hasAllow ? { allow: toolsConfig.allow } : {}),
    ...(hasDeny ? { deny: toolsConfig.deny } : {}),
    ...(hasAlsoAllow ? { alsoAllow: toolsConfig.alsoAllow } : {}),
  };
}

function resolveProviderToolPolicy(params: {
  byProvider?: Record<string, AgentToolsConfig>;
  modelProvider?: string;
  modelId?: string;
}): AgentToolsConfig | undefined {
  if (!params.byProvider) return undefined;
  const providerKey = params.modelProvider?.trim().toLowerCase();
  if (!providerKey) return undefined;
  // Check provider-specific config
  const providerConfig = params.byProvider[providerKey];
  if (providerConfig) return providerConfig;
  // Check by model id
  if (params.modelId) {
    const modelKey = params.modelId.trim().toLowerCase();
    for (const [key, config] of Object.entries(params.byProvider)) {
      if (key.toLowerCase() === modelKey) return config;
    }
  }
  return undefined;
}

/** Resolve the shared profile, scope, extra, and sandbox policy layers. */
export function resolveConfiguredToolPolicies(params: {
  cfg: OpenClawConfig;
  agentTools?: AgentToolsConfig;
  sandboxMode?: "off" | "non-main" | "all";
  agentId?: string | null;
  extraPolicies?: readonly (SandboxToolPolicy | undefined)[];
}): SandboxToolPolicy[] {
  const policies: SandboxToolPolicy[] = [];
  const profile = params.agentTools?.profile ?? params.cfg.tools?.profile;
  if (profile) {
    policies.push({ profile });
  }

  const globalPolicy = pickSandboxToolPolicy(params.cfg.tools);
  if (globalPolicy) {
    policies.push(globalPolicy);
  }

  const agentPolicy = pickSandboxToolPolicy(params.agentTools);
  if (agentPolicy) {
    policies.push(agentPolicy);
  }

  for (const policy of params.extraPolicies ?? []) {
    if (policy) {
      policies.push(policy);
    }
  }

  return policies;
}

/** Validate caller-supplied group ids against server-derived session context. */
export function resolveTrustedGroupId(params: {
  groupId?: string | null;
  sessionKey?: string | null;
  spawnedBy?: string | null;
}): {
  groupId: string | null | undefined;
  dropped: boolean;
} {
  const callerGroupId = (params.groupId ?? "").trim();
  if (!callerGroupId) {
    return { groupId: params.groupId, dropped: false };
  }
  // Simplified: in cross-wms, trust the caller group id if session context is absent
  // In full openclaw, this validates against session-derived group context
  return { groupId: callerGroupId, dropped: false };
}

/** Resolve the layered global, provider, agent, and profile tool policies. */
export function resolveEffectiveToolPolicy(params: {
  config?: OpenClawConfig;
  sessionKey?: string;
  agentId?: string;
  modelProvider?: string;
  modelId?: string;
}) {
  const globalTools = params.config?.tools;
  const profile = globalTools?.profile;
  const providerPolicy = resolveProviderToolPolicy({
    byProvider: globalTools?.byProvider,
    modelProvider: params.modelProvider,
    modelId: params.modelId,
  });

  const explicitProfileAlsoAllow = Array.isArray(globalTools?.alsoAllow)
    ? uniqueStrings(globalTools!.alsoAllow!)
    : undefined;

  return {
    agentId: params.agentId,
    globalPolicy: pickSandboxToolPolicy(globalTools),
    globalProviderPolicy: pickSandboxToolPolicy(providerPolicy),
    agentPolicy: undefined,
    agentProviderPolicy: undefined,
    profile,
    providerProfile: providerPolicy?.profile,
    profileAlsoAllow: explicitProfileAlsoAllow,
    providerProfileAlsoAllow: Array.isArray(providerPolicy?.alsoAllow)
      ? providerPolicy!.alsoAllow
      : undefined,
  };
}

/** Resolve group-scoped tool policy after validating session provenance. */
export function resolveGroupToolPolicy(_params: {
  config?: OpenClawConfig;
  sessionKey?: string;
  spawnedBy?: string | null;
  messageProvider?: string;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  accountId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
}): SandboxToolPolicy | undefined {
  // Simplified: no group channel plugin support in cross-wms
  return undefined;
}
