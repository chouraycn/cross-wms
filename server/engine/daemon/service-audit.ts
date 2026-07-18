/**
 * 服务审计 - 审计已安装的守护进程服务定义，找出漂移和修复候选项。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { isBunRuntime, isNodeRuntime } from "./runtime-binary.js";
import { isVersionManagedNodePath, isSystemNodePath, resolveSystemNodePath } from "./runtime-paths.js";
import {
  hasInlineEnvironmentSource,
  isEnvironmentFileOnlySource,
  collectInlineManagedServiceEnvKeys,
} from "./service-managed-env.js";
import { isNonMinimalServicePathEntry, normalizeServicePathEntry } from "./service-path-policy.js";
import type { GatewayServiceEnvironmentValueSource } from "./service-types.js";
import { SERVICE_PROXY_ENV_KEYS } from "./service-env.js";

export type GatewayServiceCommand = {
  programArguments: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  environmentValueSources?: Record<string, GatewayServiceEnvironmentValueSource>;
  sourcePath?: string;
} | null;

export type ServiceConfigIssue = {
  code: string;
  message: string;
  detail?: string;
  level?: "recommended" | "aggressive";
};

export type ServiceConfigAudit = {
  ok: boolean;
  issues: ServiceConfigIssue[];
};

export const SERVICE_AUDIT_CODES = {
  gatewayCommandMissing: "gateway-command-missing",
  gatewayEntrypointMismatch: "gateway-entrypoint-mismatch",
  gatewayPathMissing: "gateway-path-missing",
  gatewayPathMissingDirs: "gateway-path-missing-dirs",
  gatewayPathNonMinimal: "gateway-path-nonminimal",
  gatewayTokenEmbedded: "gateway-token-embedded",
  gatewayManagedEnvEmbedded: "gateway-managed-env-embedded",
  gatewayPortMismatch: "gateway-port-mismatch",
  gatewayProxyEnvEmbedded: "gateway-proxy-env-embedded",
  gatewayTokenMismatch: "gateway-token-mismatch",
  gatewayRuntimeBun: "gateway-runtime-bun",
  gatewayRuntimeNodeVersionManager: "gateway-runtime-node-version-manager",
  gatewayRuntimeNodeSystemMissing: "gateway-runtime-node-system-missing",
  gatewayTokenDrift: "gateway-token-drift",
  gatewayServiceVersionMismatch: "gateway-service-version-mismatch",
  launchdKeepAlive: "launchd-keep-alive",
  launchdRunAtLoad: "launchd-run-at-load",
  systemdAfterNetworkOnline: "systemd-after-network-online",
  systemdRestartSec: "systemd-restart-sec",
  systemdWantsNetworkOnline: "systemd-wants-network-online",
  systemdKillModeProcessOrNone: "systemd-kill-mode-process-or-none",
} as const;

export function needsNodeRuntimeMigration(issues: ServiceConfigIssue[]): boolean {
  return issues.some(
    (issue) =>
      issue.code === SERVICE_AUDIT_CODES.gatewayRuntimeBun ||
      issue.code === SERVICE_AUDIT_CODES.gatewayRuntimeNodeVersionManager,
  );
}

function hasGatewaySubcommand(programArguments?: string[]): boolean {
  return Boolean(programArguments?.some((arg) => arg === "gateway"));
}

function auditGatewayCommand(programArguments: string[] | undefined, issues: ServiceConfigIssue[]) {
  if (!programArguments || programArguments.length === 0) {
    return;
  }
  if (!hasGatewaySubcommand(programArguments)) {
    issues.push({
      code: SERVICE_AUDIT_CODES.gatewayCommandMissing,
      message: "Service command does not include the gateway subcommand",
      level: "aggressive",
    });
  }
}

function normalizeServiceEnvKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

const SERVICE_PROXY_ENV_KEY_SET = new Set(
  SERVICE_PROXY_ENV_KEYS.flatMap((key) => {
    const normalized = normalizeServiceEnvKey(key);
    return normalized ? [normalized] : [];
  }),
);

function readEnvironmentValueSource(
  command: GatewayServiceCommand,
  normalizedKey: string,
): GatewayServiceEnvironmentValueSource | undefined {
  for (const [rawKey, source] of Object.entries(command?.environmentValueSources ?? {})) {
    if (normalizeServiceEnvKey(rawKey) === normalizedKey) {
      return source;
    }
  }
  return undefined;
}

function collectInlineProxyEnvKeys(command: GatewayServiceCommand): string[] {
  if (!command?.environment) {
    return [];
  }
  const inlineKeys: string[] = [];
  for (const [rawKey, value] of Object.entries(command.environment)) {
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    const normalized = normalizeServiceEnvKey(rawKey);
    if (!normalized || !SERVICE_PROXY_ENV_KEY_SET.has(normalized)) {
      continue;
    }
    if (!hasInlineEnvironmentSource(readEnvironmentValueSource(command, normalized))) {
      continue;
    }
    inlineKeys.push(normalized);
  }
  return inlineKeys.sort();
}

function auditProxyServiceEnvironment(
  command: GatewayServiceCommand,
  issues: ServiceConfigIssue[],
) {
  const inlineKeys = collectInlineProxyEnvKeys(command);
  if (inlineKeys.length === 0) {
    return;
  }
  issues.push({
    code: SERVICE_AUDIT_CODES.gatewayProxyEnvEmbedded,
    message: "Gateway service embeds proxy environment values that should not be persisted.",
    detail: `inline keys: ${inlineKeys.join(", ")}`,
    level: "recommended",
  });
}

function auditManagedServiceEnvironment(
  command: GatewayServiceCommand,
  issues: ServiceConfigIssue[],
  expectedManagedServiceEnvKeys?: Iterable<string>,
) {
  const inlineKeys = collectInlineManagedServiceEnvKeys(command, expectedManagedServiceEnvKeys);
  if (inlineKeys.length === 0) {
    return;
  }
  issues.push({
    code: SERVICE_AUDIT_CODES.gatewayManagedEnvEmbedded,
    message: "Gateway service embeds managed environment values that should load at runtime.",
    detail: `inline keys: ${inlineKeys.join(", ")}`,
    level: "recommended",
  });
}

export function readEmbeddedGatewayToken(command: GatewayServiceCommand): string | undefined {
  if (!command) {
    return undefined;
  }
  if (isEnvironmentFileOnlySource(command.environmentValueSources?.CROSS_WMS_GATEWAY_TOKEN)) {
    return undefined;
  }
  return command.environment?.CROSS_WMS_GATEWAY_TOKEN?.trim();
}

function auditGatewayToken(
  command: GatewayServiceCommand,
  issues: ServiceConfigIssue[],
  expectedGatewayToken?: string,
) {
  const serviceToken = readEmbeddedGatewayToken(command);
  if (!serviceToken) {
    return;
  }
  issues.push({
    code: SERVICE_AUDIT_CODES.gatewayTokenEmbedded,
    message: "Gateway service embeds CROSS_WMS_GATEWAY_TOKEN and should be reinstalled.",
    level: "recommended",
  });
  const expectedToken = expectedGatewayToken?.trim();
  if (!expectedToken || serviceToken === expectedToken) {
    return;
  }
  issues.push({
    code: SERVICE_AUDIT_CODES.gatewayTokenMismatch,
    message: "Gateway service token does not match current config.",
    detail: "service token is stale",
    level: "recommended",
  });
}

function getPathModule(platform: NodeJS.Platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function auditGatewayServicePath(
  command: GatewayServiceCommand,
  issues: ServiceConfigIssue[],
  platform: NodeJS.Platform,
) {
  if (platform === "win32") {
    return;
  }
  const servicePath = command?.environment?.PATH;
  if (!servicePath) {
    issues.push({
      code: SERVICE_AUDIT_CODES.gatewayPathMissing,
      message: "Gateway service PATH is not set; the daemon should use a minimal PATH.",
      level: "recommended",
    });
    return;
  }

  const parts = servicePath.split(getPathModule(platform).delimiter);
  const nonMinimal = parts.filter((entry) => {
    const normalized = normalizeServicePathEntry(entry, platform);
    return isNonMinimalServicePathEntry(normalized, platform);
  });
  if (nonMinimal.length > 0) {
    issues.push({
      code: SERVICE_AUDIT_CODES.gatewayPathNonMinimal,
      message:
        "Gateway service PATH includes version managers or package managers; recommend a minimal PATH.",
      detail: nonMinimal.join(", "),
      level: "recommended",
    });
  }
}

async function auditGatewayRuntime(
  env: Record<string, string | undefined>,
  command: GatewayServiceCommand,
  issues: ServiceConfigIssue[],
  platform: NodeJS.Platform,
) {
  const execPath = command?.programArguments?.[0];
  if (!execPath) {
    return;
  }

  if (isBunRuntime(execPath)) {
    issues.push({
      code: SERVICE_AUDIT_CODES.gatewayRuntimeBun,
      message: "Gateway service uses Bun.",
      detail: execPath,
      level: "recommended",
    });
    return;
  }

  if (!isNodeRuntime(execPath)) {
    return;
  }

  if (isVersionManagedNodePath(execPath, platform)) {
    issues.push({
      code: SERVICE_AUDIT_CODES.gatewayRuntimeNodeVersionManager,
      message: "Gateway service uses Node from a version manager; it can break after upgrades.",
      detail: execPath,
      level: "recommended",
    });
    if (!isSystemNodePath(execPath, env, platform)) {
      const systemNode = await resolveSystemNodePath(env, platform);
      if (!systemNode) {
        issues.push({
          code: SERVICE_AUDIT_CODES.gatewayRuntimeNodeSystemMissing,
          message: "System Node not found.",
          level: "recommended",
        });
      }
    }
  }
}

async function auditSystemdUnit(
  unitPath: string,
  issues: ServiceConfigIssue[],
) {
  let content;
  try {
    content = await fs.readFile(unitPath, "utf8");
  } catch {
    return;
  }

  const hasAfterNetworkOnline = /After=.*network-online\.target/i.test(content);
  const hasWantsNetworkOnline = /Wants=.*network-online\.target/i.test(content);

  if (!hasAfterNetworkOnline) {
    issues.push({
      code: SERVICE_AUDIT_CODES.systemdAfterNetworkOnline,
      message: "Missing systemd After=network-online.target",
      detail: unitPath,
      level: "recommended",
    });
  }
  if (!hasWantsNetworkOnline) {
    issues.push({
      code: SERVICE_AUDIT_CODES.systemdWantsNetworkOnline,
      message: "Missing systemd Wants=network-online.target",
      detail: unitPath,
      level: "recommended",
    });
  }

  const killModeMatch = content.match(/KillMode=(\S+)/i);
  const killMode = killModeMatch?.[1]?.toLowerCase();
  if (killMode === "process" || killMode === "none") {
    issues.push({
      code: SERVICE_AUDIT_CODES.systemdKillModeProcessOrNone,
      message:
        "KillMode is process/none; service child processes can survive stops and restarts.",
      detail: `${unitPath}: ${killMode}`,
      level: "recommended",
    });
  }
}

async function auditLaunchdPlist(
  plistPath: string,
  issues: ServiceConfigIssue[],
) {
  let content;
  try {
    content = await fs.readFile(plistPath, "utf8");
  } catch {
    return;
  }

  const hasRunAtLoad = /<key>RunAtLoad<\/key>\s*<true\s*\/>/i.test(content);
  const hasKeepAlive = /<key>KeepAlive<\/key>\s*<true\s*\/>/i.test(content);

  if (!hasRunAtLoad) {
    issues.push({
      code: SERVICE_AUDIT_CODES.launchdRunAtLoad,
      message: "LaunchAgent is missing RunAtLoad=true",
      detail: plistPath,
      level: "recommended",
    });
  }
  if (!hasKeepAlive) {
    issues.push({
      code: SERVICE_AUDIT_CODES.launchdKeepAlive,
      message: "LaunchAgent is missing KeepAlive=true",
      detail: plistPath,
      level: "recommended",
    });
  }
}

export async function auditGatewayServiceConfig(params: {
  env: Record<string, string | undefined>;
  command: GatewayServiceCommand;
  platform?: NodeJS.Platform;
  expectedGatewayToken?: string;
  expectedManagedServiceEnvKeys?: Iterable<string>;
  expectedServicePath?: string;
  expectedPort?: number;
  unitPath?: string;
  plistPath?: string;
}): Promise<ServiceConfigAudit> {
  const issues: ServiceConfigIssue[] = [];
  const platform = params.platform ?? process.platform;

  auditGatewayCommand(params.command?.programArguments, issues);
  auditManagedServiceEnvironment(params.command, issues, params.expectedManagedServiceEnvKeys);
  auditProxyServiceEnvironment(params.command, issues);
  auditGatewayToken(params.command, issues, params.expectedGatewayToken);
  auditGatewayServicePath(params.command, issues, platform);
  await auditGatewayRuntime(params.env, params.command, issues, platform);

  if (platform === "linux" && params.unitPath) {
    await auditSystemdUnit(params.unitPath, issues);
  } else if (platform === "darwin" && params.plistPath) {
    await auditLaunchdPlist(params.plistPath, issues);
  }

  return { ok: issues.length === 0, issues };
}

export function checkTokenDrift(params: {
  serviceToken: string | undefined;
  configToken: string | undefined;
}): ServiceConfigIssue | null {
  const serviceToken = params.serviceToken?.trim();
  const configToken = params.configToken?.trim();

  if (!serviceToken) {
    return null;
  }

  if (configToken && serviceToken !== configToken) {
    return {
      code: SERVICE_AUDIT_CODES.gatewayTokenDrift,
      message:
        "Config token differs from service token. The daemon will use the old token after restart.",
      level: "recommended",
    };
  }

  return null;
}
