import { logger } from "../../../logger.js";
import type { SkillEntry } from "../types.js";
import { loadWorkspaceSkills } from "../loading/workspace.js";

export type RefreshResult = {
  success: boolean;
  previousCount: number;
  newCount: number;
  added: string[];
  removed: string[];
  changed: string[];
};

type SkillCacheEntry = {
  entries: SkillEntry[];
  lastRefreshTime: number;
  workspaceDir: string;
};

let cache: SkillCacheEntry | null = null;
const REFRESH_INTERVAL_MS = 30_000;

export async function refreshSkills(workspaceDir: string): Promise<RefreshResult> {
  const previousSkills = cache?.entries || [];
  const previousNames = new Set(previousSkills.map((s) => s.skill.name));
  const previousVersions = new Map(
    previousSkills.map((s) => [s.skill.name, s.skill.promptVersion]),
  );

  try {
    const newEntries = await loadWorkspaceSkills(workspaceDir);
    const newNames = new Set(newEntries.map((s) => s.skill.name));

    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    for (const entry of newEntries) {
      const name = entry.skill.name;
      if (!previousNames.has(name)) {
        added.push(name);
      } else {
        const oldVersion = previousVersions.get(name);
        if (oldVersion !== entry.skill.promptVersion) {
          changed.push(name);
        }
      }
    }

    for (const name of previousNames) {
      if (!newNames.has(name)) {
        removed.push(name);
      }
    }

    cache = {
      entries: newEntries,
      lastRefreshTime: Date.now(),
      workspaceDir,
    };

    logger.debug(
      "[Skills] Refresh complete:",
      `${newEntries.length} skills (${added.length} added, ${removed.length} removed, ${changed.length} changed)`,
    );

    return {
      success: true,
      previousCount: previousSkills.length,
      newCount: newEntries.length,
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort(),
    };
  } catch (err) {
    logger.error("[Skills] Refresh failed:", err);
    return {
      success: false,
      previousCount: previousSkills.length,
      newCount: previousSkills.length,
      added: [],
      removed: [],
      changed: [],
    };
  }
}

export function getCachedSkills(): SkillEntry[] {
  return cache?.entries || [];
}

export function getLastRefreshTime(): number | null {
  return cache?.lastRefreshTime || null;
}

export function clearSkillCache(): void {
  cache = null;
}

export function needsRefresh(workspaceDir: string): boolean {
  if (!cache) return true;
  if (cache.workspaceDir !== workspaceDir) return true;
  return Date.now() - cache.lastRefreshTime > REFRESH_INTERVAL_MS;
}

export async function getSkills(
  workspaceDir: string,
  forceRefresh = false,
): Promise<SkillEntry[]> {
  if (forceRefresh || needsRefresh(workspaceDir)) {
    await refreshSkills(workspaceDir);
  }
  return getCachedSkills();
}

export function setRefreshInterval(ms: number): void {
  // This is a placeholder for configuration
  logger.debug("[Skills] Refresh interval configured:", ms, "ms");
}
