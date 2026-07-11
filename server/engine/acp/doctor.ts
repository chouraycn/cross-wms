import type { PolicyRule, PolicyCondition } from "./policy.js";
import { getToolGroups, getGroupsForTool } from "./toolPolicyConformance.js";

let getGlobalChannelRegistry: () => any;

export type HealthFinding = {
  readonly id: string;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly target?: string;
  readonly fixHint?: string;
};

export type DoctorCheckScope =
  | "core"
  | "tools"
  | "channels"
  | "exec-approvals"
  | "sandbox"
  | "gateway"
  | "model-network"
  | "data-auth"
  | "policy";

export type DoctorCheckResult = {
  readonly scope: DoctorCheckScope;
  readonly findings: readonly HealthFinding[];
};

export type DoctorReport = {
  readonly ok: boolean;
  readonly scopesChecked: number;
  readonly totalFindings: number;
  readonly findings: readonly HealthFinding[];
};

const DOCTOR_CHECK_IDS = {
  core: {
    policyMissing: "doctor/core/policy-missing",
    policyInvalid: "doctor/core/policy-invalid",
    noRules: "doctor/core/no-rules",
    missingRuntime: "doctor/core/missing-runtime",
  },
  tools: {
    unknownTool: "doctor/tools/unknown-tool",
    toolWithoutGroup: "doctor/tools/tool-without-group",
    toolSchemaInvalid: "doctor/tools/tool-schema-invalid",
  },
  channels: {
    noChannels: "doctor/channels/no-channels",
    channelDisabled: "doctor/channels/channel-disabled",
    channelNotRegistered: "doctor/channels/channel-not-registered",
    channelConfigMissing: "doctor/channels/channel-config-missing",
    channelAuthMissing: "doctor/channels/channel-auth-missing",
  },
  execApprovals: {
    noApprovalPolicy: "doctor/exec-approvals/no-policy",
    overlyPermissive: "doctor/exec-approvals/overly-permissive",
    missingApprovalFlow: "doctor/exec-approvals/missing-approval-flow",
  },
  sandbox: {
    sandboxMissing: "doctor/sandbox/missing",
    sandboxUnhealthy: "doctor/sandbox/unhealthy",
    sandboxNotConfigured: "doctor/sandbox/not-configured",
    sandboxDockerMissing: "doctor/sandbox/docker-missing",
  },
  gateway: {
    gatewayNotConfigured: "doctor/gateway/not-configured",
    gatewayAuthMissing: "doctor/gateway/auth-missing",
    gatewayTokenMissing: "doctor/gateway/token-missing",
    gatewayPortConflict: "doctor/gateway/port-conflict",
    gatewayModeInvalid: "doctor/gateway/mode-invalid",
  },
  modelNetwork: {
    providerNotAvailable: "doctor/model-network/provider-not-available",
    providerAuthMissing: "doctor/model-network/provider-auth-missing",
    networkConnectionFailed: "doctor/model-network/connection-failed",
    modelNotFound: "doctor/model-network/model-not-found",
  },
  dataAuth: {
    authProfileMissing: "doctor/data-auth/auth-profile-missing",
    authConfigInvalid: "doctor/data-auth/auth-config-invalid",
    secretManagementMissing: "doctor/data-auth/secret-management-missing",
    sessionAuthMissing: "doctor/data-auth/session-auth-missing",
  },
  policy: {
    policyConflict: "doctor/policy/policy-conflict",
    policyOverlappingRules: "doctor/policy/overlapping-rules",
    policyMissingDefaults: "doctor/policy/missing-defaults",
    policyInconsistentLevels: "doctor/policy/inconsistent-levels",
  },
};

function validatePolicyRule(rule: PolicyRule): HealthFinding[] {
  const findings: HealthFinding[] = [];
  if (!rule.id || !rule.id.trim()) {
    findings.push({
      id: DOCTOR_CHECK_IDS.core.policyInvalid,
      severity: "error",
      message: "Policy rule has no id",
      fixHint: "Add an id to the policy rule",
    });
  }
  if (!rule.name || !rule.name.trim()) {
    findings.push({
      id: DOCTOR_CHECK_IDS.core.policyInvalid,
      severity: "warning",
      message: `Policy rule "${rule.id}" has no name`,
      fixHint: "Add a descriptive name to the policy rule",
    });
  }
  if (!["allow", "deny", "prompt"].includes(rule.level)) {
    findings.push({
      id: DOCTOR_CHECK_IDS.core.policyInvalid,
      severity: "error",
      message: `Policy rule "${rule.id}" has invalid level: ${rule.level}`,
      fixHint: "Set level to 'allow', 'deny', or 'prompt'",
    });
  }
  for (const condition of rule.conditions) {
    const conditionFindings = validatePolicyCondition(condition);
    if (conditionFindings.length > 0) {
      findings.push(...conditionFindings);
    }
  }
  return findings;
}

function validatePolicyCondition(condition: PolicyCondition): HealthFinding[] {
  const findings: HealthFinding[] = [];
  const validOperators = ["equals", "notEquals", "contains", "startsWith", "endsWith", "regex", "greaterThan", "lessThan", "exists"];
  if (!validOperators.includes(condition.operator)) {
    findings.push({
      id: DOCTOR_CHECK_IDS.core.policyInvalid,
      severity: "error",
      message: `Invalid condition operator: ${condition.operator}`,
      fixHint: `Use one of: ${validOperators.join(", ")}`,
    });
  }
  return findings;
}

export function checkCorePolicy(params: {
  rules?: PolicyRule[];
  runtimeAvailable?: boolean;
}): DoctorCheckResult {
  const findings: HealthFinding[] = [];
  const rules = params.rules ?? [];

  if (!params.runtimeAvailable) {
    findings.push({
      id: DOCTOR_CHECK_IDS.core.missingRuntime,
      severity: "warning",
      message: "ACP runtime is not available",
      fixHint: "Ensure ACP runtime is properly configured and started",
    });
  }

  if (rules.length === 0) {
    findings.push({
      id: DOCTOR_CHECK_IDS.core.noRules,
      severity: "warning",
      message: "No policy rules defined",
      fixHint: "Add policy rules to control tool access",
    });
    return { scope: "core", findings };
  }

  for (const rule of rules) {
    findings.push(...validatePolicyRule(rule));
  }

  return { scope: "core", findings };
}

export function checkToolPolicy(params: {
  toolNames?: string[];
}): DoctorCheckResult {
  const findings: HealthFinding[] = [];
  const toolNames = params.toolNames ?? [];
  const knownGroups = getToolGroups();

  for (const toolName of toolNames) {
    const groups = getGroupsForTool(toolName);
    if (groups.length === 0) {
      findings.push({
        id: DOCTOR_CHECK_IDS.tools.toolWithoutGroup,
        severity: "info",
        message: `Tool "${toolName}" is not assigned to any tool group`,
        fixHint: `Consider assigning to one of: ${knownGroups.join(", ")}`,
      });
    }
  }

  return { scope: "tools", findings };
}

export function checkExecApprovals(params: {
  defaultLevel?: string;
  approvalFlowEnabled?: boolean;
}): DoctorCheckResult {
  const findings: HealthFinding[] = [];
  const defaultLevel = params.defaultLevel ?? "prompt";

  if (!params.approvalFlowEnabled) {
    findings.push({
      id: DOCTOR_CHECK_IDS.execApprovals.missingApprovalFlow,
      severity: "warning",
      message: "Exec approval flow is not enabled",
      fixHint: "Enable exec approval flow for better security control",
    });
  }

  if (defaultLevel === "allow") {
    findings.push({
      id: DOCTOR_CHECK_IDS.execApprovals.overlyPermissive,
      severity: "warning",
      message: "Exec approval default level is 'allow', which may be overly permissive",
      fixHint: "Consider setting defaultLevel to 'prompt' for production",
    });
  }

  return { scope: "exec-approvals", findings };
}

export function checkChannels(params: {
  enabledChannels?: string[];
}): DoctorCheckResult {
  const findings: HealthFinding[] = [];

  // 防御性：当服务未通过 initDoctorChannelRegistry 注入通道注册表时，
  // 不能让诊断端点抛 500。降级为 info 提示即可（已有 live 通道注册表时行为不变）。
  const registryFn = typeof getGlobalChannelRegistry === 'function' ? getGlobalChannelRegistry : null;
  const registry = registryFn ? registryFn() : null;
  if (!registry || typeof registry.listAll !== 'function') {
    findings.push({
      id: DOCTOR_CHECK_IDS.channels.noChannels,
      severity: 'info',
      message: 'Channel registry is not initialized; skipping channel checks',
      fixHint: 'Call initDoctorChannelRegistry(getGlobalChannelRegistry) during server startup',
    });
    return { scope: 'channels', findings };
  }

  const registeredChannels = registry.listAll();

  if (registeredChannels.length === 0) {
    findings.push({
      id: DOCTOR_CHECK_IDS.channels.noChannels,
      severity: "warning",
      message: "No channels are registered",
      fixHint: "Register channel plugins using registerBuiltinChannels() or custom channel plugins",
    });
  }

  const enabledChannels = params.enabledChannels ?? [];
  const registeredChannelIds = new Set(registeredChannels.map((c: any) => c.id));

  for (const channelId of enabledChannels) {
    if (!registeredChannelIds.has(channelId as never)) {
      findings.push({
        id: DOCTOR_CHECK_IDS.channels.channelNotRegistered,
        severity: "error",
        message: `Channel "${channelId}" is enabled but not registered`,
        fixHint: `Register the "${channelId}" channel plugin`,
      });
    }
  }

  for (const channel of registeredChannels) {
    const hasMessageSend = channel.message?.send !== undefined;
    const hasMessageReceive = channel.message?.receive !== undefined;

    if (!hasMessageSend && !hasMessageReceive) {
      findings.push({
        id: DOCTOR_CHECK_IDS.channels.channelConfigMissing,
        severity: "warning",
        message: `Channel "${channel.id}" has no message adapters configured`,
        target: channel.id,
        fixHint: "Configure message send/receive adapters for the channel",
      });
    }

    if (channel.capabilities.authRequired && !channel.auth) {
      findings.push({
        id: DOCTOR_CHECK_IDS.channels.channelAuthMissing,
        severity: "error",
        message: `Channel "${channel.id}" requires authentication but no auth adapter is configured`,
        target: channel.id,
        fixHint: "Configure auth adapter for the channel",
      });
    }
  }

  return { scope: "channels", findings };
}

export function checkSandbox(params: {
  enabled?: boolean;
  dockerAvailable?: boolean;
  config?: Record<string, unknown>;
}): DoctorCheckResult {
  const findings: HealthFinding[] = [];

  if (params.enabled) {
    if (!params.dockerAvailable) {
      findings.push({
        id: DOCTOR_CHECK_IDS.sandbox.sandboxDockerMissing,
        severity: "error",
        message: "Sandbox is enabled but Docker is not available",
        fixHint: "Install Docker and ensure it is running",
      });
    }

    if (!params.config || Object.keys(params.config).length === 0) {
      findings.push({
        id: DOCTOR_CHECK_IDS.sandbox.sandboxNotConfigured,
        severity: "warning",
        message: "Sandbox is enabled but has no configuration",
        fixHint: "Configure sandbox settings (image, resources, network)",
      });
    }
  }

  return { scope: "sandbox", findings };
}

export function checkGateway(params: {
  mode?: string;
  authToken?: string;
  authPassword?: string;
  port?: number;
}): DoctorCheckResult {
  const findings: HealthFinding[] = [];

  if (!params.mode) {
    findings.push({
      id: DOCTOR_CHECK_IDS.gateway.gatewayNotConfigured,
      severity: "error",
      message: "Gateway mode is not configured",
      fixHint: "Set gateway.mode to 'local' or 'remote'",
    });
    return { scope: "gateway", findings };
  }

  if (!["local", "remote"].includes(params.mode)) {
    findings.push({
      id: DOCTOR_CHECK_IDS.gateway.gatewayModeInvalid,
      severity: "error",
      message: `Gateway mode "${params.mode}" is invalid`,
      fixHint: "Set gateway.mode to 'local' or 'remote'",
    });
  }

  if (params.mode === "local") {
    const hasAuth = params.authToken || params.authPassword;
    if (!hasAuth) {
      findings.push({
        id: DOCTOR_CHECK_IDS.gateway.gatewayAuthMissing,
        severity: "warning",
        message: "Local gateway has no authentication configured",
        fixHint: "Set gateway.auth.token or gateway.auth.password for security",
      });
      findings.push({
        id: DOCTOR_CHECK_IDS.gateway.gatewayTokenMissing,
        severity: "warning",
        message: "Gateway auth token is missing",
        fixHint: "Generate a gateway token using 'openclaw doctor --fix --generate-gateway-token'",
      });
    }
  }

  if (params.port && (params.port < 1 || params.port > 65535)) {
    findings.push({
      id: DOCTOR_CHECK_IDS.gateway.gatewayPortConflict,
      severity: "error",
      message: `Gateway port "${params.port}" is invalid`,
      fixHint: "Use a valid port number between 1 and 65535",
    });
  }

  return { scope: "gateway", findings };
}

export function checkModelNetwork(params: {
  providers?: string[];
  authConfigured?: boolean;
}): DoctorCheckResult {
  const findings: HealthFinding[] = [];

  if (!params.providers || params.providers.length === 0) {
    findings.push({
      id: DOCTOR_CHECK_IDS.modelNetwork.providerNotAvailable,
      severity: "warning",
      message: "No model providers are configured",
      fixHint: "Configure model providers in your agent settings",
    });
    return { scope: "model-network", findings };
  }

  if (!params.authConfigured) {
    findings.push({
      id: DOCTOR_CHECK_IDS.modelNetwork.providerAuthMissing,
      severity: "warning",
      message: "Model provider authentication is not configured",
      fixHint: "Configure API keys or credentials for model providers",
    });
  }

  return { scope: "model-network", findings };
}

export function checkDataAuth(params: {
  authProfiles?: string[];
  sessionAuthEnabled?: boolean;
  secretManagementEnabled?: boolean;
}): DoctorCheckResult {
  const findings: HealthFinding[] = [];

  if (!params.authProfiles || params.authProfiles.length === 0) {
    findings.push({
      id: DOCTOR_CHECK_IDS.dataAuth.authProfileMissing,
      severity: "warning",
      message: "No authentication profiles are configured",
      fixHint: "Configure authentication profiles for session security",
    });
  }

  if (!params.sessionAuthEnabled) {
    findings.push({
      id: DOCTOR_CHECK_IDS.dataAuth.sessionAuthMissing,
      severity: "warning",
      message: "Session authentication is not enabled",
      fixHint: "Enable session authentication for better security",
    });
  }

  if (!params.secretManagementEnabled) {
    findings.push({
      id: DOCTOR_CHECK_IDS.dataAuth.secretManagementMissing,
      severity: "info",
      message: "Secret management is not enabled",
      fixHint: "Consider enabling secret management for sensitive data",
    });
  }

  return { scope: "data-auth", findings };
}

export function checkPolicy(params: {
  rules?: PolicyRule[];
}): DoctorCheckResult {
  const findings: HealthFinding[] = [];
  const rules = params.rules ?? [];

  if (rules.length === 0) {
    return { scope: "policy", findings };
  }

  const levelCounts: Record<string, number> = {};
  for (const rule of rules) {
    levelCounts[rule.level] = (levelCounts[rule.level] || 0) + 1;
  }

  if (!levelCounts["deny"] && !levelCounts["prompt"]) {
    findings.push({
      id: DOCTOR_CHECK_IDS.policy.policyMissingDefaults,
      severity: "warning",
      message: "Policy has no deny or prompt rules, all rules are allow",
      fixHint: "Add deny or prompt rules for security boundaries",
    });
  }

  const ruleIds = new Set<string>();
  for (const rule of rules) {
    if (ruleIds.has(rule.id)) {
      findings.push({
        id: DOCTOR_CHECK_IDS.policy.policyConflict,
        severity: "error",
        message: `Duplicate policy rule id: ${rule.id}`,
        fixHint: "Ensure all policy rules have unique ids",
      });
    }
    ruleIds.add(rule.id);
  }

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const rule1 = rules[i];
      const rule2 = rules[j];

      if (rule1.category === rule2.category &&
          rule1.scope === rule2.scope &&
          rule1.level !== rule2.level) {
        findings.push({
          id: DOCTOR_CHECK_IDS.policy.policyInconsistentLevels,
          severity: "warning",
          message: `Rules "${rule1.id}" and "${rule2.id}" have inconsistent levels for same category/scope`,
          fixHint: "Review policy rules for consistency",
        });
      }
    }
  }

  return { scope: "policy", findings };
}

export async function runDoctorChecks(params: {
  scopes?: DoctorCheckScope[];
  rules?: PolicyRule[];
  toolNames?: string[];
  defaultLevel?: string;
  approvalFlowEnabled?: boolean;
  runtimeAvailable?: boolean;
  enabledChannels?: string[];
  sandbox?: {
    enabled?: boolean;
    dockerAvailable?: boolean;
    config?: Record<string, unknown>;
  };
  gateway?: {
    mode?: string;
    authToken?: string;
    authPassword?: string;
    port?: number;
  };
  modelNetwork?: {
    providers?: string[];
    authConfigured?: boolean;
  };
  dataAuth?: {
    authProfiles?: string[];
    sessionAuthEnabled?: boolean;
    secretManagementEnabled?: boolean;
  };
} = {}): Promise<DoctorReport> {
  const scopes = params.scopes ?? ["core", "tools", "exec-approvals", "channels"];
  const findings: HealthFinding[] = [];

  for (const scope of scopes) {
    let result: DoctorCheckResult;
    switch (scope) {
      case "core":
        result = checkCorePolicy({
          rules: params.rules,
          runtimeAvailable: params.runtimeAvailable,
        });
        break;
      case "tools":
        result = checkToolPolicy({ toolNames: params.toolNames });
        break;
      case "exec-approvals":
        result = checkExecApprovals({
          defaultLevel: params.defaultLevel,
          approvalFlowEnabled: params.approvalFlowEnabled,
        });
        break;
      case "channels":
        result = checkChannels({ enabledChannels: params.enabledChannels });
        break;
      case "sandbox":
        result = checkSandbox({
          enabled: params.sandbox?.enabled,
          dockerAvailable: params.sandbox?.dockerAvailable,
          config: params.sandbox?.config,
        });
        break;
      case "gateway":
        result = checkGateway({
          mode: params.gateway?.mode,
          authToken: params.gateway?.authToken,
          authPassword: params.gateway?.authPassword,
          port: params.gateway?.port,
        });
        break;
      case "model-network":
        result = checkModelNetwork({
          providers: params.modelNetwork?.providers,
          authConfigured: params.modelNetwork?.authConfigured,
        });
        break;
      case "data-auth":
        result = checkDataAuth({
          authProfiles: params.dataAuth?.authProfiles,
          sessionAuthEnabled: params.dataAuth?.sessionAuthEnabled,
          secretManagementEnabled: params.dataAuth?.secretManagementEnabled,
        });
        break;
      case "policy":
        result = checkPolicy({ rules: params.rules });
        break;
      default:
        continue;
    }
    findings.push(...result.findings);
  }

  return {
    ok: findings.every(f => f.severity !== "error"),
    scopesChecked: scopes.length,
    totalFindings: findings.length,
    findings,
  };
}

export function initDoctorChannelRegistry(registryFn: () => any): void {
  getGlobalChannelRegistry = registryFn;
}