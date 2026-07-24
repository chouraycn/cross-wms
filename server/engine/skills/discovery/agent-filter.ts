import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../../logger.js';
import type { SkillEntry } from '../types.js';
import { normalizeSkillName } from './filter.js';

export type AgentSkillVisibility = 'all' | 'whitelist' | 'tagged';

export interface AgentSkillFilter {
  agentId: string;
  allowedSkills?: string[];
  deniedSkills?: string[];
  skillTags?: string[];
  visibility: AgentSkillVisibility;
}

export interface FilteredSkillEntry {
  entry: SkillEntry;
  visible: boolean;
  reason: string;
}

export interface AgentFilterConfig {
  defaultVisibility?: AgentSkillVisibility;
}

const agentFilters = new Map<string, AgentSkillFilter>();
let defaultConfig: AgentFilterConfig = {
  defaultVisibility: 'all',
};

export function setAgentFilterConfig(config: AgentFilterConfig): void {
  defaultConfig = { ...defaultConfig, ...config };
  logger.debug('[agent-filter] default config updated', defaultConfig);
}

export function getAgentFilterConfig(): AgentFilterConfig {
  return { ...defaultConfig };
}

export function setAgentFilter(agentId: string, filter: Partial<AgentSkillFilter> & { visibility?: AgentSkillVisibility }): void {
  const normalizedId = agentId.trim();
  if (!normalizedId) {
    throw new Error('agentId cannot be empty');
  }

  const existing = agentFilters.get(normalizedId);
  const visibility = filter.visibility ?? existing?.visibility ?? defaultConfig.defaultVisibility ?? 'all';

  const normalizedFilter: AgentSkillFilter = {
    agentId: normalizedId,
    visibility,
    allowedSkills: filter.allowedSkills ? [...new Set(filter.allowedSkills.map(normalizeSkillName))] : existing?.allowedSkills,
    deniedSkills: filter.deniedSkills ? [...new Set(filter.deniedSkills.map(normalizeSkillName))] : existing?.deniedSkills,
    skillTags: filter.skillTags ? [...new Set(filter.skillTags.map((t) => t.trim().toLowerCase()).filter(Boolean))] : existing?.skillTags,
  };

  agentFilters.set(normalizedId, normalizedFilter);
  logger.debug('[agent-filter] filter set for agent', normalizedId, visibility);
}

export function getAgentFilter(agentId: string): AgentSkillFilter | undefined {
  const normalizedId = agentId.trim();
  return agentFilters.get(normalizedId);
}

export function removeAgentFilter(agentId: string): boolean {
  const normalizedId = agentId.trim();
  const existed = agentFilters.has(normalizedId);
  if (existed) {
    agentFilters.delete(normalizedId);
    logger.debug('[agent-filter] filter removed for agent', normalizedId);
  }
  return existed;
}

export function clearAllAgentFilters(): void {
  agentFilters.clear();
  logger.debug('[agent-filter] all agent filters cleared');
}

function getSkillTags(entry: SkillEntry): string[] {
  const tags: string[] = [];
  const frontmatter = entry.frontmatter ?? {};

  if (frontmatter.tags) {
    const parsed = typeof frontmatter.tags === 'string'
      ? frontmatter.tags.split(',').map((t: string) => t.trim())
      : Array.isArray(frontmatter.tags)
        ? (frontmatter.tags as any[]).map((t: unknown) => String(t).trim())
        : [];
    tags.push(...parsed.map((t: string) => t.toLowerCase()));
  }

  if (frontmatter.tag) {
    tags.push(String(frontmatter.tag).trim().toLowerCase());
  }

  const metadata = entry.metadata;
  if (metadata && typeof metadata === 'object' && 'tags' in metadata) {
    const metaTags = (metadata as { tags?: string[] | string }).tags;
    if (metaTags) {
      const parsed = typeof metaTags === 'string'
        ? metaTags.split(',').map((t) => t.trim())
        : metaTags.map((t) => String(t).trim());
      tags.push(...parsed.map((t) => t.toLowerCase()));
    }
  }

  return [...new Set(tags.filter(Boolean))];
}

export function isSkillVisibleForAgent(agentId: string, skillName: string, skill?: SkillEntry): boolean {
  const normalizedId = agentId.trim();
  const normalizedName = normalizeSkillName(skillName);
  const filter = agentFilters.get(normalizedId);

  if (!filter) {
    const defaultVis = defaultConfig.defaultVisibility ?? 'all';
    switch (defaultVis) {
      case 'all':
        return true;
      case 'whitelist':
        return false;
      case 'tagged':
        return false;
      default:
        return true;
    }
  }

  const deniedSkills = filter.deniedSkills ?? [];
  if (deniedSkills.some((s) => normalizeSkillName(s) === normalizedName)) {
    return false;
  }

  switch (filter.visibility) {
    case 'all':
      return true;

    case 'whitelist': {
      const allowedSkills = filter.allowedSkills ?? [];
      return allowedSkills.some((s) => normalizeSkillName(s) === normalizedName);
    }

    case 'tagged': {
      if (!skill) {
        return false;
      }
      const skillTags = getSkillTags(skill);
      const filterTags = filter.skillTags ?? [];
      return filterTags.some((tag) => skillTags.includes(tag.toLowerCase()));
    }

    default:
      return true;
  }
}

export function filterSkillsForAgent(agentId: string, skills: SkillEntry[]): FilteredSkillEntry[] {
  return skills.map((entry) => {
    const skillName = entry.skill.name;
    const visible = isSkillVisibleForAgent(agentId, skillName, entry);

    let reason = 'visible';
    if (!visible) {
      const filter = agentFilters.get(agentId.trim());
      if (filter?.deniedSkills?.some((s) => normalizeSkillName(s) === normalizeSkillName(skillName))) {
        reason = 'denied';
      } else if (filter?.visibility === 'whitelist') {
        reason = 'not-in-whitelist';
      } else if (filter?.visibility === 'tagged') {
        reason = 'tag-mismatch';
      } else {
        reason = 'hidden';
      }
    }

    return { entry, visible, reason };
  });
}

export function listAgentVisibleSkills(agentId: string, allSkills: SkillEntry[]): SkillEntry[] {
  return filterSkillsForAgent(agentId, allSkills)
    .filter((result) => result.visible)
    .map((result) => result.entry);
}

export function addSkillToAgentWhitelist(agentId: string, skillName: string): void {
  const normalizedId = agentId.trim();
  const normalizedName = normalizeSkillName(skillName);

  const existing = agentFilters.get(normalizedId);
  const allowedSkills = existing?.allowedSkills ? [...existing.allowedSkills] : [];

  if (!allowedSkills.some((s) => normalizeSkillName(s) === normalizedName)) {
    allowedSkills.push(normalizedName);
  }

  setAgentFilter(normalizedId, {
    allowedSkills,
    visibility: existing?.visibility ?? 'whitelist',
  });
}

export function removeSkillFromAgentWhitelist(agentId: string, skillName: string): boolean {
  const normalizedId = agentId.trim();
  const normalizedName = normalizeSkillName(skillName);
  const existing = agentFilters.get(normalizedId);

  if (!existing?.allowedSkills) {
    return false;
  }

  const filtered = existing.allowedSkills.filter((s) => normalizeSkillName(s) !== normalizedName);
  if (filtered.length === existing.allowedSkills.length) {
    return false;
  }

  setAgentFilter(normalizedId, { allowedSkills: filtered });
  return true;
}

export function denySkillForAgent(agentId: string, skillName: string): void {
  const normalizedId = agentId.trim();
  const normalizedName = normalizeSkillName(skillName);

  const existing = agentFilters.get(normalizedId);
  const deniedSkills = existing?.deniedSkills ? [...existing.deniedSkills] : [];

  if (!deniedSkills.some((s) => normalizeSkillName(s) === normalizedName)) {
    deniedSkills.push(normalizedName);
  }

  setAgentFilter(normalizedId, {
    deniedSkills,
    visibility: existing?.visibility ?? defaultConfig.defaultVisibility ?? 'all',
  });
}

export function allowSkillForAgent(agentId: string, skillName: string): boolean {
  const normalizedId = agentId.trim();
  const normalizedName = normalizeSkillName(skillName);
  const existing = agentFilters.get(normalizedId);

  if (!existing?.deniedSkills) {
    return false;
  }

  const filtered = existing.deniedSkills.filter((s) => normalizeSkillName(s) !== normalizedName);
  if (filtered.length === existing.deniedSkills.length) {
    return false;
  }

  setAgentFilter(normalizedId, { deniedSkills: filtered });
  return true;
}

interface PersistedFilterData {
  version: number;
  config: AgentFilterConfig;
  filters: AgentSkillFilter[];
}

const PERSISTENCE_VERSION = 1;

export function saveAgentFiltersToFile(filePath: string): void {
  const data: PersistedFilterData = {
    version: PERSISTENCE_VERSION,
    config: { ...defaultConfig },
    filters: Array.from(agentFilters.values()),
  };

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  logger.info('[agent-filter] filters saved to file', filePath, agentFilters.size, 'filters');
}

export function loadAgentFiltersFromFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    logger.warn('[agent-filter] filter file not found', filePath);
    return false;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as PersistedFilterData;

    if (data.version !== PERSISTENCE_VERSION) {
      logger.warn('[agent-filter] unsupported file version', data.version);
      return false;
    }

    if (data.config) {
      defaultConfig = { ...defaultConfig, ...data.config };
    }

    agentFilters.clear();
    if (data.filters && Array.isArray(data.filters)) {
      for (const filter of data.filters) {
        if (filter.agentId) {
          agentFilters.set(filter.agentId.trim(), {
            ...filter,
            allowedSkills: filter.allowedSkills ? filter.allowedSkills.map(normalizeSkillName) : undefined,
            deniedSkills: filter.deniedSkills ? filter.deniedSkills.map(normalizeSkillName) : undefined,
            skillTags: filter.skillTags ? filter.skillTags.map((t) => t.trim().toLowerCase()).filter(Boolean) : undefined,
          });
        }
      }
    }

    logger.info('[agent-filter] filters loaded from file', filePath, agentFilters.size, 'filters');
    return true;
  } catch (err) {
    logger.error('[agent-filter] failed to load filters from file', filePath, err);
    return false;
  }
}

export function getAgentFilterCount(): number {
  return agentFilters.size;
}

export function resolveEffectiveAgentSkillFilter(
  agentSkillFilter: string[] | undefined,
  entries: readonly SkillEntry[],
): string[] | undefined {
  if (!agentSkillFilter || agentSkillFilter.length === 0) {
    return undefined;
  }
  const normalizedFilter = new Set(agentSkillFilter.map(normalizeSkillName));
  const result: string[] = [];
  for (const entry of entries) {
    const name = normalizeSkillName(entry.skill.name);
    if (normalizedFilter.has(name)) {
      result.push(entry.skill.name);
    }
  }
  return result.length > 0 ? result : undefined;
}
