// 移植自 openclaw/src/infra/exec-approvals-effective.ts（降级实现）
// 从配置和策略文件解析有效的 exec 审批策略。
//
// 降级策略：
// 1. 源文件依赖 @openclaw/normalization-core/string-normalization 的 sortUniqueStrings，
//    cross-wms 中位于 ./string-normalization.js
// 2. 源文件依赖 ../config/types.openclaw.js 的 OpenClawConfig，从 ./_runtime-stubs.js 导入
// 3. 源文件依赖 ../routing/session-key.js 的 DEFAULT_AGENT_ID，从 ./_openclaw-infra-deps.js 导入
// 4. 源文件依赖 ./exec-approvals.js（已降级移植），提供类型与函数
import type { OpenClawConfig } from "./_runtime-stubs.js";
import {
  DEFAULT_EXEC_APPROVAL_ASK_FALLBACK,
  resolveExecApprovalAllowedDecisions,
  resolveExecApprovalsDisplayPath,
  resolveExecApprovalsFromFile,
  resolveExecModeFromPolicy,
  resolveExecModePolicy,
  type ExecApprovalDecision,
  type ExecApprovalsFile,
  type ExecAsk,
  type ExecMode,
  type ExecSecurity,
  type ExecTarget,
  maxAsk,
  minSecurity,
} from "./exec-approvals.js";

const DEFAULT_REQUESTED_SECURITY: ExecSecurity = "full";
const DEFAULT_REQUESTED_ASK: ExecAsk = "off";
const REQUESTED_DEFAULT_LABEL = {
  security: DEFAULT_REQUESTED_SECURITY,
  ask: DEFAULT_REQUESTED_ASK,
} as const;

type ExecPolicyConfig = {
  host?: ExecTarget;
  mode?: ExecMode;
  security?: ExecSecurity;
  ask?: ExecAsk;
};

type ExecPolicyHostSummary = {
  requested: ExecTarget;
  requestedSource: string;
};

type ExecPolicyFieldSummary<TValue extends ExecSecurity | ExecAsk> = {
  requested: TValue;
  requestedSource: string;
  host: TValue;
  hostSource: string;
  effective: TValue;
  note: string;
};

export type ExecPolicyScopeSnapshot = {
  scopeLabel: string;
  configPath: string;
  agentId?: string;
  host: ExecPolicyHostSummary;
  mode: {
    requested: ExecMode;
    requestedSource: string;
    effective: ExecMode;
    note: string;
  };
  security: ExecPolicyFieldSummary<ExecSecurity>;
  ask: ExecPolicyFieldSummary<ExecAsk>;
  askFallback: {
    effective: ExecSecurity;
    source: string;
  };
  allowedDecisions: readonly ExecApprovalDecision[];
};

type ExecPolicyRequestedField = "security" | "ask";

function resolveRequestedHost(params: {
  scopeExecConfig?: ExecPolicyConfig;
  globalExecConfig?: ExecPolicyConfig;
}): { value: ExecTarget; sourcePath: string } {
  const scopeValue = params.scopeExecConfig?.host;
  if (scopeValue !== undefined) {
    return { value: scopeValue, sourcePath: "scope" };
  }
  const globalValue = params.globalExecConfig?.host;
  if (globalValue !== undefined) {
    return { value: globalValue, sourcePath: "tools.exec" };
  }
  return { value: "auto", sourcePath: "__default__" };
}

function formatRequestedSource(params: {
  sourcePath: string;
  field: "security" | "ask";
  defaultValue: ExecSecurity | ExecAsk;
}): string {
  return params.sourcePath === "__default__"
    ? `OpenClaw default (${params.defaultValue})`
    : `${params.sourcePath}.${params.field}`;
}

function formatModeSource(params: { sourcePath: string; configPath: string }): string {
  if (params.sourcePath === "__default__") {
    return "derived from OpenClaw defaults";
  }
  return `${params.sourcePath === "scope" ? params.configPath : params.sourcePath}.mode`;
}

type ExecPolicyField = "security" | "ask" | "askFallback";

function resolveRequestedField<TValue extends ExecSecurity | ExecAsk>(params: {
  field: ExecPolicyRequestedField;
  scopeExecConfig?: ExecPolicyConfig;
  globalExecConfig?: ExecPolicyConfig;
}): { value: TValue; sourcePath: string } {
  const scopeValue = params.scopeExecConfig?.[params.field];
  if (scopeValue !== undefined) {
    return { value: scopeValue as TValue, sourcePath: "scope" };
  }
  const globalValue = params.globalExecConfig?.[params.field];
  if (globalValue !== undefined) {
    return { value: globalValue as TValue, sourcePath: "tools.exec" };
  }
  const defaultValue = REQUESTED_DEFAULT_LABEL[params.field] as TValue;
  return { value: defaultValue, sourcePath: "__default__" };
}

function hasLegacyExecPolicyOverride(exec?: ExecPolicyConfig): boolean {
  return exec?.security !== undefined || exec?.ask !== undefined;
}

function resolveRequestedPolicy(params: {
  scopeExecConfig?: ExecPolicyConfig;
  globalExecConfig?: ExecPolicyConfig;
  configPath: string;
}): {
  mode: ExecMode;
  modeSource: string;
  security: ExecSecurity;
  securitySource: string;
  ask: ExecAsk;
  askSource: string;
} {
  if (params.scopeExecConfig?.mode) {
    const policy = resolveExecModePolicy({
      mode: params.scopeExecConfig.mode,
      security: DEFAULT_REQUESTED_SECURITY,
      ask: DEFAULT_REQUESTED_ASK,
    });
    const source = formatModeSource({ sourcePath: "scope", configPath: params.configPath });
    return {
      mode: policy.mode,
      modeSource: source,
      security: policy.security,
      securitySource: source,
      ask: policy.ask,
      askSource: source,
    };
  }
  if (!hasLegacyExecPolicyOverride(params.scopeExecConfig) && params.globalExecConfig?.mode) {
    const policy = resolveExecModePolicy({
      mode: params.globalExecConfig.mode,
      security: DEFAULT_REQUESTED_SECURITY,
      ask: DEFAULT_REQUESTED_ASK,
    });
    const source = formatModeSource({ sourcePath: "tools.exec", configPath: params.configPath });
    return {
      mode: policy.mode,
      modeSource: source,
      security: policy.security,
      securitySource: source,
      ask: policy.ask,
      askSource: source,
    };
  }
  if (hasLegacyExecPolicyOverride(params.scopeExecConfig) && params.globalExecConfig?.mode) {
    const inherited = resolveExecModePolicy({
      mode: params.globalExecConfig.mode,
      security: DEFAULT_REQUESTED_SECURITY,
      ask: DEFAULT_REQUESTED_ASK,
    });
    const inheritedSource = formatModeSource({
      sourcePath: "tools.exec",
      configPath: params.configPath,
    });
    const scopeSecuritySource = formatRequestedSource({
      sourcePath: params.configPath,
      field: "security",
      defaultValue: DEFAULT_REQUESTED_SECURITY,
    });
    const scopeAskSource = formatRequestedSource({
      sourcePath: params.configPath,
      field: "ask",
      defaultValue: DEFAULT_REQUESTED_ASK,
    });
    const security = params.scopeExecConfig?.security ?? inherited.security;
    const ask = params.scopeExecConfig?.ask ?? inherited.ask;
    const securitySource =
      params.scopeExecConfig?.security !== undefined ? scopeSecuritySource : inheritedSource;
    const askSource =
      params.scopeExecConfig?.ask !== undefined ? scopeAskSource : inheritedSource;
    return {
      mode: resolveExecModeFromPolicy({ security, ask }),
      modeSource:
        securitySource === askSource
          ? `derived from ${securitySource}`
          : `derived from ${securitySource} and ${askSource}`,
      security,
      securitySource,
      ask,
      askSource,
    };
  }

  const security = resolveRequestedField<ExecSecurity>({
    field: "security",
    scopeExecConfig: params.scopeExecConfig,
    globalExecConfig: params.globalExecConfig,
  });
  const ask = resolveRequestedField<ExecAsk>({
    field: "ask",
    scopeExecConfig: params.scopeExecConfig,
    globalExecConfig: params.globalExecConfig,
  });
  const securitySource = formatRequestedSource({
    sourcePath: security.sourcePath === "scope" ? params.configPath : security.sourcePath,
    field: "security",
    defaultValue: DEFAULT_REQUESTED_SECURITY,
  });
  const askSource = formatRequestedSource({
    sourcePath: ask.sourcePath === "scope" ? params.configPath : ask.sourcePath,
    field: "ask",
    defaultValue: DEFAULT_REQUESTED_ASK,
  });
  return {
    mode: resolveExecModeFromPolicy({ security: security.value, ask: ask.value }),
    modeSource:
      securitySource === askSource
        ? `derived from ${securitySource}`
        : `derived from ${securitySource} and ${askSource}`,
    security: security.value,
    securitySource,
    ask: ask.value,
    askSource,
  };
}

function formatHostFieldSource(params: {
  hostPath: string;
  field: ExecPolicyField;
  sourceSuffix: string | null;
}): string {
  if (params.sourceSuffix) {
    return `${params.hostPath} ${params.sourceSuffix}`;
  }
  if (params.field === "askFallback") {
    return `OpenClaw default (${DEFAULT_EXEC_APPROVAL_ASK_FALLBACK})`;
  }
  return "inherits requested tool policy";
}

function resolveAskNote(params: {
  requestedAsk: ExecAsk;
  hostAsk: ExecAsk;
  effectiveAsk: ExecAsk;
}): string {
  if (params.effectiveAsk === params.requestedAsk) {
    return "requested ask applies";
  }
  return "more aggressive ask wins";
}

export function collectExecPolicyScopeSnapshots(params: {
  cfg: OpenClawConfig;
  approvals: ExecApprovalsFile;
  hostPath?: string;
}): ExecPolicyScopeSnapshot[] {
  const snapshots = [
    resolveExecPolicyScopeSnapshot({
      approvals: params.approvals,
      scopeExecConfig: params.cfg.tools as ExecPolicyConfig | undefined,
      configPath: "tools.exec",
      hostPath: params.hostPath,
      scopeLabel: "tools.exec",
    }),
  ];
  // 降级实现：不遍历 agents，因为 cfg.agents?.list 可能不存在
  return snapshots;
}

export function resolveExecPolicyScopeSnapshot(params: {
  approvals: ExecApprovalsFile;
  scopeExecConfig?: ExecPolicyConfig | undefined;
  globalExecConfig?: ExecPolicyConfig | undefined;
  configPath: string;
  scopeLabel: string;
  agentId?: string;
  hostPath?: string;
}): ExecPolicyScopeSnapshot {
  const requestedHost = resolveRequestedHost({
    scopeExecConfig: params.scopeExecConfig,
    globalExecConfig: params.globalExecConfig,
  });
  const requestedPolicy = resolveRequestedPolicy({
    scopeExecConfig: params.scopeExecConfig,
    globalExecConfig: params.globalExecConfig,
    configPath: params.configPath,
  });
  const resolved = resolveExecApprovalsFromFile({
    file: params.approvals,
    agentId: params.agentId,
    overrides: {
      security: requestedPolicy.security,
      ask: requestedPolicy.ask,
    },
  });
  const hostPath = params.hostPath ?? resolveExecApprovalsDisplayPath();
  const effectiveSecurity = minSecurity(requestedPolicy.security, resolved.agent.security);
  const effectiveAsk = maxAsk(requestedPolicy.ask, resolved.agent.ask);
  const effectiveAskFallback = minSecurity(effectiveSecurity, resolved.agent.askFallback);
  const effectiveMode =
    effectiveSecurity === requestedPolicy.security && effectiveAsk === requestedPolicy.ask
      ? requestedPolicy.mode
      : resolveExecModeFromPolicy({ security: effectiveSecurity, ask: effectiveAsk });
  return {
    scopeLabel: params.scopeLabel,
    configPath: params.configPath,
    ...(params.agentId ? { agentId: params.agentId } : {}),
    host: {
      requested: requestedHost.value,
      requestedSource:
        requestedHost.sourcePath === "__default__"
          ? "OpenClaw default (auto)"
          : `${requestedHost.sourcePath === "scope" ? params.configPath : requestedHost.sourcePath}.host`,
    },
    mode: {
      requested: requestedPolicy.mode,
      requestedSource: requestedPolicy.modeSource,
      effective: effectiveMode,
      note:
        effectiveMode === requestedPolicy.mode
          ? "requested mode applies"
          : "host policy changes effective mode",
    },
    security: {
      requested: requestedPolicy.security,
      requestedSource: requestedPolicy.securitySource,
      host: resolved.agent.security,
      hostSource: formatHostFieldSource({
        hostPath,
        field: "security",
        sourceSuffix: resolved.agentSources.security,
      }),
      effective: effectiveSecurity,
      note:
        effectiveSecurity === requestedPolicy.security
          ? "requested security applies"
          : "stricter host security wins",
    },
    ask: {
      requested: requestedPolicy.ask,
      requestedSource: requestedPolicy.askSource,
      host: resolved.agent.ask,
      hostSource: formatHostFieldSource({
        hostPath,
        field: "ask",
        sourceSuffix: resolved.agentSources.ask,
      }),
      effective: effectiveAsk,
      note: resolveAskNote({
        requestedAsk: requestedPolicy.ask,
        hostAsk: resolved.agent.ask,
        effectiveAsk,
      }),
    },
    askFallback: {
      effective: effectiveAskFallback,
      source: formatHostFieldSource({
        hostPath,
        field: "askFallback",
        sourceSuffix: resolved.agentSources.askFallback,
      }),
    },
    allowedDecisions: resolveExecApprovalAllowedDecisions({ ask: effectiveAsk }),
  };
}
