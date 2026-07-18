/**
 * 跨平台守护进程服务名称、标签和配置描述。
 */

const DEFAULT_LAUNCH_AGENT_LABEL = "com.cdf-know.daemon";
const DEFAULT_SYSTEMD_SERVICE_NAME = "cdf-know-daemon";
const DEFAULT_WINDOWS_TASK_NAME = "CrossWMSDaemon";
const SERVICE_MARKER = "crosswms";
const SERVICE_KIND = "daemon";
const SERVICE_RUNTIME_PID_ENV = "CROSS_WMS_SERVICE_PID";

const NODE_LAUNCH_AGENT_LABEL = "com.cdf-know.node";
const NODE_SYSTEMD_SERVICE_NAME = "cdf-know-node";
const NODE_WINDOWS_TASK_NAME = "CrossWMSNode";
const NODE_SERVICE_MARKER = "crosswms";
const NODE_SERVICE_KIND = "node";
const NODE_WINDOWS_TASK_SCRIPT_NAME = "node.cmd";

export {
  DEFAULT_LAUNCH_AGENT_LABEL,
  DEFAULT_SYSTEMD_SERVICE_NAME,
  DEFAULT_WINDOWS_TASK_NAME,
  SERVICE_MARKER,
  SERVICE_KIND,
  SERVICE_RUNTIME_PID_ENV,
  NODE_LAUNCH_AGENT_LABEL,
  NODE_SYSTEMD_SERVICE_NAME,
  NODE_WINDOWS_TASK_NAME,
  NODE_SERVICE_MARKER,
  NODE_SERVICE_KIND,
  NODE_WINDOWS_TASK_SCRIPT_NAME,
};

export function normalizeProfile(profile?: string): string | null {
  const trimmed = profile?.trim();
  if (!trimmed || trimmed.toLowerCase() === "default") {
    return null;
  }
  return trimmed;
}

export function resolveProfileSuffix(profile?: string): string {
  const normalized = normalizeProfile(profile);
  return normalized ? `-${normalized}` : "";
}

export function resolveLaunchAgentLabel(profile?: string): string {
  const normalized = normalizeProfile(profile);
  if (!normalized) {
    return DEFAULT_LAUNCH_AGENT_LABEL;
  }
  return `com.cdf-know.${normalized}`;
}

export function resolveSystemdServiceName(profile?: string): string {
  const suffix = resolveProfileSuffix(profile);
  if (!suffix) {
    return DEFAULT_SYSTEMD_SERVICE_NAME;
  }
  return `cdf-know-daemon${suffix}`;
}

export function resolveWindowsTaskName(profile?: string): string {
  const normalized = normalizeProfile(profile);
  if (!normalized) {
    return DEFAULT_WINDOWS_TASK_NAME;
  }
  return `CrossWMS Daemon (${normalized})`;
}

export function formatServiceDescription(params?: {
  profile?: string;
  version?: string;
}): string {
  const profile = normalizeProfile(params?.profile);
  const version = params?.version?.trim();
  const parts: string[] = [];
  if (profile) {
    parts.push(`profile: ${profile}`);
  }
  if (version) {
    parts.push(`v${version}`);
  }
  if (parts.length === 0) {
    return "CrossWMS Daemon";
  }
  return `CrossWMS Daemon (${parts.join(", ")})`;
}

export function resolveServiceDescription(params: {
  env: Record<string, string | undefined>;
  environment?: Record<string, string | undefined>;
  description?: string;
}): string {
  return (
    params.description ??
    formatServiceDescription({
      profile: params.env.CROSS_WMS_PROFILE,
      version: params.environment?.CROSS_WMS_SERVICE_VERSION ?? params.env.CROSS_WMS_SERVICE_VERSION,
    })
  );
}

export function resolveNodeLaunchAgentLabel(): string {
  return NODE_LAUNCH_AGENT_LABEL;
}

export function resolveNodeSystemdServiceName(): string {
  return NODE_SYSTEMD_SERVICE_NAME;
}

export function resolveNodeWindowsTaskName(): string {
  return NODE_WINDOWS_TASK_NAME;
}

export function formatNodeServiceDescription(params?: { version?: string }): string {
  const version = params?.version?.trim();
  if (!version) {
    return "CrossWMS Node Host";
  }
  return `CrossWMS Node Host (v${version})`;
}
