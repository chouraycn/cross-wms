/**
 * 服务环境变量构建 - 为托管守护进程服务构建最小化的可移植环境块。
 */
import os from "node:os";
import path from "node:path";
import { resolveDaemonStateDir, resolveHomeDir } from "./paths.js";
import {
  resolveLaunchAgentLabel,
  resolveSystemdServiceName,
  resolveWindowsTaskName,
  resolveNodeLaunchAgentLabel,
  resolveNodeSystemdServiceName,
  resolveNodeWindowsTaskName,
  SERVICE_MARKER,
  SERVICE_KIND,
  NODE_SERVICE_MARKER,
  NODE_SERVICE_KIND,
  NODE_WINDOWS_TASK_SCRIPT_NAME,
} from "./constants.js";

export const SERVICE_PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
] as const;

function readServiceProxyEnvironment(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const proxyEnv: Record<string, string | undefined> = {};
  for (const key of SERVICE_PROXY_ENV_KEYS) {
    const value = env[key];
    if (value?.trim()) {
      proxyEnv[key] = value;
    }
  }
  return proxyEnv;
}

function resolveSystemPathDirs(platform: NodeJS.Platform): string[] {
  if (platform === "darwin") {
    return [
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ];
  }
  if (platform === "linux") {
    return ["/usr/local/bin", "/usr/bin", "/bin"];
  }
  return [];
}

function buildMinimalServicePath(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): string {
  if (platform === "win32") {
    return env.PATH ?? "";
  }
  const parts: string[] = [];
  const home = env.HOME;

  if (home && platform === "linux") {
    const userDirs = [
      `${home}/.local/bin`,
      `${home}/.npm-global/bin`,
      `${home}/bin`,
    ];
    for (const dir of userDirs) {
      parts.push(dir);
    }
  }

  const systemDirs = resolveSystemPathDirs(platform);
  for (const dir of systemDirs) {
    if (!parts.includes(dir)) {
      parts.push(dir);
    }
  }

  return parts.join(path.delimiter);
}

function resolveServiceTmpDir(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): string {
  if (platform === "darwin") {
    try {
      return path.join(resolveDaemonStateDir(env), "tmp");
    } catch {
      return env.TMPDIR?.trim() || os.tmpdir();
    }
  }
  return env.TMPDIR?.trim() || os.tmpdir();
}

export function buildServiceEnvironment(params: {
  env: Record<string, string | undefined>;
  port?: number;
  launchdLabel?: string;
  platform?: NodeJS.Platform;
  extraPathDirs?: string[];
  execPath?: string;
  version?: string;
}): Record<string, string | undefined> {
  const { env, port, launchdLabel, extraPathDirs, version } = params;
  const platform = params.platform ?? process.platform;
  const profile = env.CROSS_WMS_PROFILE;
  const resolvedLaunchdLabel =
    launchdLabel || (platform === "darwin" ? resolveLaunchAgentLabel(profile) : undefined);

  const serviceEnv: Record<string, string | undefined> = {
    HOME: env.HOME,
    TMPDIR: resolveServiceTmpDir(env, platform),
    CROSS_WMS_STATE_DIR: env.CDF_STATE_DIR,
    ...readServiceProxyEnvironment(env),
  };

  if (platform !== "win32") {
    serviceEnv.PATH = buildMinimalServicePath(env, platform);
  }

  if (port !== undefined) {
    serviceEnv.CROSS_WMS_GATEWAY_PORT = String(port);
  }

  return {
    ...serviceEnv,
    CROSS_WMS_PROFILE: profile,
    CROSS_WMS_LAUNCHD_LABEL: resolvedLaunchdLabel,
    CROSS_WMS_SYSTEMD_UNIT: `${resolveSystemdServiceName(profile)}.service`,
    CROSS_WMS_WINDOWS_TASK_NAME: resolveWindowsTaskName(profile),
    CROSS_WMS_SERVICE_MARKER: SERVICE_MARKER,
    CROSS_WMS_SERVICE_KIND: SERVICE_KIND,
    ...(version ? { CROSS_WMS_SERVICE_VERSION: version } : {}),
    ...(extraPathDirs && extraPathDirs.length > 0
      ? { EXTRA_PATH_DIRS: extraPathDirs.join(path.delimiter) }
      : {}),
  };
}

export function buildNodeServiceEnvironment(params: {
  env: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  extraPathDirs?: string[];
  execPath?: string;
  version?: string;
}): Record<string, string | undefined> {
  const { env, extraPathDirs, version } = params;
  const platform = params.platform ?? process.platform;
  const gatewayToken = env.CROSS_WMS_GATEWAY_TOKEN;

  const serviceEnv: Record<string, string | undefined> = {
    HOME: env.HOME,
    TMPDIR: resolveServiceTmpDir(env, platform),
    CROSS_WMS_STATE_DIR: env.CDF_STATE_DIR,
    ...readServiceProxyEnvironment(env),
  };

  if (platform !== "win32") {
    serviceEnv.PATH = buildMinimalServicePath(env, platform);
  }

  return {
    ...serviceEnv,
    CROSS_WMS_GATEWAY_TOKEN: gatewayToken,
    CROSS_WMS_LAUNCHD_LABEL: resolveNodeLaunchAgentLabel(),
    CROSS_WMS_SYSTEMD_UNIT: `${resolveNodeSystemdServiceName()}.service`,
    CROSS_WMS_WINDOWS_TASK_NAME: resolveNodeWindowsTaskName(),
    CROSS_WMS_TASK_SCRIPT_NAME: NODE_WINDOWS_TASK_SCRIPT_NAME,
    CROSS_WMS_LOG_PREFIX: "node",
    CROSS_WMS_SERVICE_MARKER: NODE_SERVICE_MARKER,
    CROSS_WMS_SERVICE_KIND: NODE_SERVICE_KIND,
    ...(version ? { CROSS_WMS_SERVICE_VERSION: version } : {}),
    ...(extraPathDirs && extraPathDirs.length > 0
      ? { EXTRA_PATH_DIRS: extraPathDirs.join(path.delimiter) }
      : {}),
  };
}
