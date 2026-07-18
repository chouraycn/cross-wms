import type { SkillEntry } from "../types.js";
import { resolveSkillKey, resolveSkillSource } from "../loading/skill-contract.js";
import { normalizeSkillName } from "./filter.js";

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

export function searchSkills(
  index: readonly SkillIndexEntry[],
  query: string,
): SkillIndexEntry[] {
  const normalizedQuery = normalizeSkillName(query);
  if (!normalizedQuery) {
    return [...index];
  }
  return index.filter((entry) => {
    if (entry.normalizedName.includes(normalizedQuery)) return true;
    if (entry.normalizedSkillKey.includes(normalizedQuery)) return true;
    const description = entry.entry.skill.description.toLowerCase();
    if (description.includes(query.toLowerCase())) return true;
    return false;
  });
}
