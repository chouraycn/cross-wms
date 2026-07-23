import path from "node:path";
import { getChildLogger } from "../../logging/logger.js";
import type { SkillEntry } from "../types.js";
import { resolveBundledSkillsContext } from "../loading/bundled-context.js";
import { loadWorkspaceSkills } from "../loading/workspace.js";
import { loadSkillsFromDirectory } from "../loading/local-loader.js";
import { resolveEffectiveAgentSkillFilter } from "./agent-filter.js";
import { normalizeSkillIndexName } from "./skill-index.js";

const logger = getChildLogger({ component: "skills" });

export interface SkillStatusConfigCheck {
  name: string;
  status: "pass" | "fail" | "warning";
  message?: string;
}

export interface SkillInstallOption {
  id: string;
  kind: string;
  label: string;
  bins: string[];
}

export interface SkillStatusEntry {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  filePath: string;
  baseDir: string;
  skillKey: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  blockedByAgentFilter: boolean;
  eligible: boolean;
  platformIncompatible: boolean;
  modelVisible: boolean;
  userInvocable: boolean;
  commandVisible: boolean;
  requirements: string[];
  missing: string[];
  configChecks: SkillStatusConfigCheck[];
  install: SkillInstallOption[];
}

export interface SkillStatusReport {
  workspaceDir: string;
  managedSkillsDir: string;
  agentId?: string;
  agentSkillFilter?: string[];
  skills: SkillStatusEntry[];
}

export interface SkillStatusSummary {
  total: number;
  eligible: number;
  promptVisible: number;
  modelVisible: number;
  userInvocable: number;
  disabled: number;
  platformIncompatible: number;
  missingDeps: number;
}

export function computeSkillStatus(entries: readonly SkillEntry[]): SkillStatusSummary {
  const total = entries.length;
  let eligible = 0;
  let promptVisible = 0;
  let modelVisible = 0;
  let userInvocable = 0;
  let disabled = 0;
  let platformIncompatible = 0;
  let missingDeps = 0;

  for (const entry of entries) {
    const metadata = entry.metadata || {};
    const always = (metadata.always as boolean) || false;
    const isDisabled = (metadata.disabled as boolean) || false;
    const disableModelInvocation = (metadata.disableModelInvocation as boolean) || false;
    const requiredOs = (metadata.os as string[]) ?? [];
    const platformOk = requiredOs.length === 0 || requiredOs.includes(process.platform);
    const bins = (metadata.requires as Record<string, unknown>)?.bins as string[] ?? [];

    if (!isDisabled && platformOk) {
      eligible++;
    }

    if (always && !isDisabled && platformOk) {
      promptVisible++;
    }

    if (!disableModelInvocation && !isDisabled) {
      modelVisible++;
    }

    if (!isDisabled) {
      userInvocable++;
    }

    if (isDisabled) {
      disabled++;
    }

    if (!platformOk) {
      platformIncompatible++;
    }

    if (bins.length > 0) {
      missingDeps++;
    }
  }

  return {
    total,
    eligible,
    promptVisible,
    modelVisible,
    userInvocable,
    disabled,
    platformIncompatible,
    missingDeps,
  };
}

export function resolveSkillStatusEntry(
  skills: readonly SkillStatusEntry[],
  requestedName: string,
): SkillStatusEntry | null {
  const raw = requestedName.trim();
  if (!raw) {
    return null;
  }

  const lower = raw.toLowerCase();
  const normalized = normalizeSkillIndexName(raw);
  let caseInsensitiveMatch: SkillStatusEntry | null = null;
  let caseInsensitiveMatches = 0;
  let normalizedMatch: SkillStatusEntry | null = null;
  let normalizedMatches = 0;

  for (const skill of skills) {
    if (skill.name === raw || skill.skillKey === raw) {
      return skill;
    }

    const nameLower = skill.name.toLowerCase();
    const keyLower = skill.skillKey.toLowerCase();
    if (nameLower === lower || keyLower === lower) {
      caseInsensitiveMatch = skill;
      caseInsensitiveMatches += 1;
      continue;
    }

    if (
      normalized &&
      (normalizeSkillIndexName(skill.name) === normalized ||
        normalizeSkillIndexName(skill.skillKey) === normalized)
    ) {
      normalizedMatch = skill;
      normalizedMatches += 1;
    }
  }

  if (caseInsensitiveMatches > 1) {
    return null;
  }
  if (caseInsensitiveMatches === 1) {
    return caseInsensitiveMatch;
  }
  if (normalizedMatches === 1) {
    return normalizedMatch;
  }
  return null;
}

export async function buildSkillStatusReport(params: {
  workspaceDir: string;
  managedSkillsDir: string;
  agentId?: string;
  agentSkillFilter?: string[];
}): Promise<SkillStatusReport> {
  const { workspaceDir, managedSkillsDir, agentId, agentSkillFilter } = params;

  const workspaceSkills = await loadWorkspaceSkills(workspaceDir);

  const bundledContext = resolveBundledSkillsContext();
  const bundledSkills: SkillEntry[] = [];
  if (bundledContext.dir) {
    try {
      bundledSkills.push(...(await loadSkillsFromDirectory(bundledContext.dir, "bundled")));
    } catch (err) {
      logger.debug("[Status] Failed to load bundled skills:", err);
    }
  }

  const managedSkills: SkillEntry[] = [];
  try {
    managedSkills.push(...(await loadSkillsFromDirectory(managedSkillsDir, "managed")));
  } catch (err) {
    logger.debug("[Status] Failed to load managed skills:", err);
  }

  const allEntries = [...bundledSkills, ...workspaceSkills, ...managedSkills];

  const effectiveFilter = resolveEffectiveAgentSkillFilter(agentSkillFilter, allEntries);
  const filteredEntries = effectiveFilter
    ? allEntries.filter((entry) => effectiveFilter.includes(entry.skill.name))
    : allEntries;

  const statusEntries: SkillStatusEntry[] = [];

  for (const entry of filteredEntries) {
    const metadata = entry.metadata || {};
    const requiredOs = (metadata.os as string[]) ?? [];
    const platformIncompatible = requiredOs.length > 0 && !requiredOs.includes(process.platform);

    const bins = (metadata.requires as Record<string, unknown>)?.bins as string[] ?? [];
    const requirements = [...bins];
    const missing: string[] = [];

    for (const bin of bins) {
      try {
        const hasBin = await hasBinary(bin);
        if (!hasBin) {
          missing.push(bin);
        }
      } catch {
        missing.push(bin);
      }
    }

    const installSpecs = metadata.install as Array<Record<string, unknown>> ?? [];
    const installOptions: SkillInstallOption[] = installSpecs.map((spec, index) => ({
      id: `${entry.skill.name}-${index}`,
      kind: spec.kind as string || "unknown",
      label: spec.label as string || `${spec.kind} install`,
      bins: spec.bins as string[] || [],
    }));

    const configChecks: SkillStatusConfigCheck[] = [];

    statusEntries.push({
      name: entry.skill.name,
      description: entry.skill.description || "",
      source: entry.skill.source,
      bundled: entry.skill.source === "bundled",
      filePath: entry.skill.filePath,
      baseDir: entry.skill.baseDir,
      skillKey: entry.skill.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      primaryEnv: metadata.primaryEnv as string,
      emoji: metadata.emoji as string,
      homepage: metadata.homepage as string,
      always: (metadata.always as boolean) || false,
      disabled: (metadata.disabled as boolean) || false,
      blockedByAllowlist: false,
      blockedByAgentFilter: false,
      eligible: !platformIncompatible && missing.length === 0,
      platformIncompatible,
      modelVisible: !(metadata.disableModelInvocation as boolean),
      userInvocable: true,
      commandVisible: true,
      requirements,
      missing,
      configChecks,
      install: installOptions,
    });
  }

  return {
    workspaceDir,
    managedSkillsDir,
    agentId,
    agentSkillFilter,
    skills: statusEntries.sort((a, b) => a.name.localeCompare(b.name)),
  };
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

export function formatStatusReport(report: SkillStatusReport): string {
  const lines: string[] = [];
  lines.push(`技能状态报告 (${report.workspaceDir})`);
  lines.push(`总计: ${report.skills.length} 技能`);
  lines.push("");

  const bySource = groupBySource(report.skills);
  for (const [source, skills] of Object.entries(bySource)) {
    lines.push(`## ${source} (${skills.length})`);
    for (const skill of skills) {
      const status = skill.eligible ? "✓" : "✗";
      const flags: string[] = [];
      if (skill.disabled) flags.push("disabled");
      if (skill.platformIncompatible) flags.push("platform");
      if (skill.missing.length > 0) flags.push(`missing: ${skill.missing.join(",")}`);
      const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
      lines.push(`  ${status} ${skill.name}${flagStr}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function listSkillsBySource(
  skills: SkillStatusEntry[],
): Record<string, SkillStatusEntry[]> {
  return groupBySource(skills);
}

export function getSkillNames(skills: SkillStatusEntry[]): string[] {
  return skills.map((s) => s.name).sort((a, b) => a.localeCompare(b));
}

function groupBySource(skills: SkillStatusEntry[]): Record<string, SkillStatusEntry[]> {
  const result: Record<string, SkillStatusEntry[]> = {};
  for (const skill of skills) {
    const source = skill.source || "unknown";
    if (!result[source]) {
      result[source] = [];
    }
    result[source].push(skill);
  }
  return result;
}