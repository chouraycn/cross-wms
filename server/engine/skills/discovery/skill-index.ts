import type { SkillEntry } from "../types.js";
import { resolveSkillKey, resolveSkillSource } from "../loading/skill-contract.js";
import { normalizeSkillName } from "./filter.js";
import {
  combinedSearch,
  fuzzySearch,
  semanticSearch,
  suggestSkills,
  findRelatedSkills,
  buildSkillIndex,
  type SearchResult,
  type SearchIndex,
} from "./semantic-search.js";
import { logger } from "../../../logger.js";

export type SkillIndexEntry = {
  entry: SkillEntry;
  name: string;
  normalizedName: string;
  skillKey: string;
  normalizedSkillKey: string;
  source: string;
  bundled: boolean;
  agentAllowed: boolean;
  runtimeVisible: boolean;
  promptVisible: boolean;
  userInvocable: boolean;
};

type BuildSkillIndexOptions = {
  bundledNames?: ReadonlySet<string>;
  agentSkillFilter?: readonly string[];
};

export function isSkillRuntimeVisible(entry: SkillEntry): boolean {
  return entry.exposure?.includeInRuntimeRegistry ?? true;
}

export function isSkillPromptVisible(entry: SkillEntry): boolean {
  if (entry.exposure) {
    return entry.exposure.includeInAvailableSkillsPrompt ?? true;
  }
  if (entry.invocation) {
    return !entry.invocation.disableModelInvocation;
  }
  return !entry.skill.disableModelInvocation;
}

export function isSkillUserInvocable(entry: SkillEntry): boolean {
  if (entry.exposure) {
    return entry.exposure.userInvocable ?? true;
  }
  if (entry.invocation) {
    return entry.invocation.userInvocable ?? true;
  }
  return true;
}

export function filterPromptVisibleSkillEntries(entries: readonly SkillEntry[]): SkillEntry[] {
  return entries.filter(isSkillPromptVisible);
}

export function filterUserInvocableSkillEntries(entries: readonly SkillEntry[]): SkillEntry[] {
  return entries.filter(isSkillUserInvocable);
}

export function buildSkillIndexEntries(
  entries: readonly SkillEntry[],
  opts?: BuildSkillIndexOptions,
): SkillIndexEntry[] {
  const agentSkillSet =
    opts?.agentSkillFilter === undefined ? undefined : new Set(opts.agentSkillFilter);
  return entries.map((entry) => createSkillIndexEntry(entry, opts, agentSkillSet));
}

function createSkillIndexEntry(
  entry: SkillEntry,
  opts: BuildSkillIndexOptions | undefined,
  agentSkillSet: ReadonlySet<string> | undefined,
): SkillIndexEntry {
  const name = entry.skill.name;
  const skillKey = resolveSkillKey(entry.skill, entry.metadata);
  const source = resolveSkillSource(entry.skill);
  return {
    entry,
    name,
    normalizedName: normalizeSkillName(name),
    skillKey,
    normalizedSkillKey: normalizeSkillName(skillKey),
    source,
    bundled: source === "bundled" || (source === "unknown" && opts?.bundledNames?.has(name) === true),
    agentAllowed: agentSkillSet === undefined || agentSkillSet.has(name),
    runtimeVisible: isSkillRuntimeVisible(entry),
    promptVisible: isSkillPromptVisible(entry),
    userInvocable: isSkillUserInvocable(entry),
  };
}

export function findSkillByNormalizedName(
  index: readonly SkillIndexEntry[],
  name: string,
): SkillIndexEntry | undefined {
  const normalized = normalizeSkillName(name);
  return index.find(
    (entry) => entry.normalizedName === normalized || entry.normalizedSkillKey === normalized,
  );
}

export type SearchMode = "exact" | "fuzzy" | "semantic" | "combined";

export type SearchOptions = {
  mode?: SearchMode;
  topK?: number;
  fuzzyThreshold?: number;
  exactBoost?: number;
  fuzzyBoost?: number;
  semanticBoost?: number;
  tagBoost?: number;
};

export function searchSkills(
  index: readonly SkillIndexEntry[],
  query: string,
  options: SearchOptions = {},
): SkillIndexEntry[] {
  const { mode = "combined" } = options;
  const normalizedQuery = normalizeSkillName(query);
  
  if (!normalizedQuery) {
    return [...index];
  }
  
  if (mode === "exact") {
    return index.filter((entry) => {
      if (entry.normalizedName.includes(normalizedQuery)) return true;
      if (entry.normalizedSkillKey.includes(normalizedQuery)) return true;
      const description = entry.entry.skill.description.toLowerCase();
      if (description.includes(query.toLowerCase())) return true;
      return false;
    });
  }
  
  const skills = index.map((e) => e.entry);
  let searchResults: SearchResult[];
  
  switch (mode) {
    case "fuzzy":
      searchResults = fuzzySearch(query, skills, options.fuzzyThreshold);
      break;
    case "semantic":
      searchResults = semanticSearch(query, skills, options.topK);
      break;
    case "combined":
    default:
      searchResults = combinedSearch(query, skills, {
        topK: options.topK,
        fuzzyThreshold: options.fuzzyThreshold,
        exactBoost: options.exactBoost,
        fuzzyBoost: options.fuzzyBoost,
        semanticBoost: options.semanticBoost,
        tagBoost: options.tagBoost,
      });
      break;
  }
  
  const resultNames = new Set(searchResults.map((r) => r.skillName));
  return index.filter((entry) => resultNames.has(entry.name));
}

export function searchSkillsWithScores(
  index: readonly SkillIndexEntry[],
  query: string,
  options: SearchOptions = {},
): (SkillIndexEntry & { score: number; matchType: SearchResult["matchType"] })[] {
  const { mode = "combined" } = options;
  const normalizedQuery = normalizeSkillName(query);
  
  if (!normalizedQuery) {
    return index.map((entry) => ({ ...entry, score: 0, matchType: "exact" }));
  }
  
  const skills = index.map((e) => e.entry);
  let searchResults: SearchResult[];
  
  switch (mode) {
    case "fuzzy":
      searchResults = fuzzySearch(query, skills, options.fuzzyThreshold);
      break;
    case "semantic":
      searchResults = semanticSearch(query, skills, options.topK);
      break;
    case "combined":
    default:
      searchResults = combinedSearch(query, skills, {
        topK: options.topK,
        fuzzyThreshold: options.fuzzyThreshold,
        exactBoost: options.exactBoost,
        fuzzyBoost: options.fuzzyBoost,
        semanticBoost: options.semanticBoost,
        tagBoost: options.tagBoost,
      });
      break;
  }
  
  const resultsMap = new Map(searchResults.map((r) => [r.skillName, r]));
  return index
    .map((entry) => {
      const result = resultsMap.get(entry.name);
      if (!result) return null;
      return { ...entry, score: result.score, matchType: result.matchType };
    })
    .filter((entry): entry is SkillIndexEntry & { score: number; matchType: SearchResult["matchType"] } => entry !== null)
    .sort((a, b) => b.score - a.score);
}

export {
  combinedSearch,
  fuzzySearch,
  semanticSearch,
  suggestSkills,
  findRelatedSkills,
  buildSkillIndex,
};

export type { SearchResult, SearchIndex };

export function normalizeSkillIndexName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}
