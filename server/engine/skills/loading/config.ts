import { normalizeStringEntries } from "../../infra/string-normalization.js";
import type { SkillConfig, OpenClawConfig } from "../../config/types.skills.js";
import type { SkillEligibilityContext, SkillEntry, SkillsInstallPreferences } from "../types.js";
import { resolveSkillKey } from "./frontmatter.js";
import { resolveSkillSource } from "./source.js";

const DEFAULT_CONFIG_VALUES: Record<string, boolean> = {
  "browser.enabled": true,
  "browser.evaluateEnabled": true,
};

export function resolveSkillsInstallPreferences(config?: OpenClawConfig): SkillsInstallPreferences {
  const raw = config?.skills?.install;
  const preferBrew = raw?.preferBrew ?? true;
  const manager = (raw?.nodeManager as string | undefined)?.toLowerCase().trim() || "";
  const nodeManager: SkillsInstallPreferences["nodeManager"] =
    manager === "pnpm" || manager === "yarn" || manager === "bun" || manager === "npm"
      ? manager
      : "npm";
  return { preferBrew, nodeManager };
}

export function isConfigPathTruthy(config: OpenClawConfig | undefined, pathStr: string): boolean {
  return isConfigPathTruthyWithDefaults(config, pathStr, DEFAULT_CONFIG_VALUES);
}

function isConfigPathTruthyWithDefaults(
  config: OpenClawConfig | undefined,
  pathStr: string,
  defaults: Record<string, boolean>,
): boolean {
  const value = getNestedValue(config, pathStr);
  if (value === true || value === false) {
    return value;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  return defaults[pathStr] ?? false;
}

function getNestedValue(obj: unknown, pathStr: string): unknown {
  const parts = pathStr.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function resolveSkillConfig(
  config: OpenClawConfig | undefined,
  skillKey: string,
): SkillConfig | undefined {
  const skills = config?.skills?.entries;
  if (!skills || typeof skills !== "object") {
    return undefined;
  }
  const entry = (skills as Record<string, SkillConfig | undefined>)[skillKey];
  if (!entry || typeof entry !== "object") {
    return undefined;
  }
  return entry;
}

function normalizeAllowlist(input: unknown): ReadonlySet<string> | undefined {
  if (!input) {
    return undefined;
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  const normalized = normalizeStringEntries(input);
  return normalized.length > 0 ? new Set(normalized) : undefined;
}

const BUNDLED_SOURCES = new Set(["openclaw-bundled", "bundled"]);

function isBundledSkill(entry: SkillEntry): boolean {
  return BUNDLED_SOURCES.has(resolveSkillSource(entry.skill));
}

export function resolveBundledAllowlist(config?: OpenClawConfig): ReadonlySet<string> | undefined {
  return normalizeAllowlist(config?.skills?.allowBundled);
}

export function isBundledSkillAllowed(entry: SkillEntry, allowlist?: ReadonlySet<string>): boolean {
  if (!allowlist || allowlist.size === 0) {
    return true;
  }
  if (!isBundledSkill(entry)) {
    return true;
  }
  const key = resolveSkillKey(entry.skill, entry);
  return allowlist.has(key) || allowlist.has(entry.skill.name);
}

async function hasBinary(name: string): Promise<boolean> {
  try {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("which", [name]);
    return result.status === 0;
  } catch {
    return false;
  }
}

function evaluateRuntimeEligibility(params: {
  os?: string | string[];
  remotePlatforms?: string[];
  always?: boolean;
  requires?: Record<string, unknown>;
  hasBin: (name: string) => Promise<boolean>;
  hasRemoteBin?: (name: string) => boolean;
  hasAnyRemoteBin?: (names: string[]) => boolean;
  hasEnv: (envName: string) => boolean;
  isConfigPathTruthy: (configPath: string) => boolean;
}): boolean {
  const { os, always, requires, hasEnv } = params;

  if (always) {
    return true;
  }

  if (os) {
    const osList = Array.isArray(os) ? os : [os];
    if (osList.length > 0 && !osList.includes(process.platform)) {
      return false;
    }
  }

  if (requires?.env) {
    const envVars = Array.isArray(requires.env) ? requires.env : [requires.env];
    for (const envVar of envVars) {
      if (!hasEnv(String(envVar))) {
        return false;
      }
    }
  }

  return true;
}

export function shouldIncludeSkill(params: {
  entry: SkillEntry;
  config?: OpenClawConfig;
  bundledAllowlist: ReadonlySet<string> | undefined;
  eligibility?: SkillEligibilityContext;
}): boolean {
  const { entry, config, bundledAllowlist, eligibility } = params;
  const skillKey = resolveSkillKey(entry.skill, entry);
  const skillConfig = resolveSkillConfig(config, skillKey);

  if (skillConfig?.enabled === false) {
    return false;
  }
  if (!isBundledSkillAllowed(entry, bundledAllowlist)) {
    return false;
  }
  return evaluateRuntimeEligibility({
    os: entry.metadata?.os,
    remotePlatforms: eligibility?.remote?.platforms,
    always: entry.metadata?.always,
    requires: entry.metadata?.requires,
    hasBin,
    hasRemoteBin: eligibility?.remote?.hasBin,
    hasAnyRemoteBin: eligibility?.remote?.hasAnyBin,
    hasEnv: (envName) =>
      Boolean(
        process.env[envName] ||
        skillConfig?.env?.[envName] ||
        (skillConfig?.apiKey && entry.metadata?.primaryEnv === envName),
      ),
    isConfigPathTruthy: (configPath) => isConfigPathTruthy(config, configPath),
  });
}