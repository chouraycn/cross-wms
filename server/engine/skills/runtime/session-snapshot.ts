import type { Skill, SkillSnapshot, SkillEntry } from "../types.js";
import { formatSkillsForPrompt } from "../loading/skill-contract.js";
import { isSkillPromptVisible } from "../discovery/skill-index.js";
import { WORKSPACE_SKILLS_PROMPT_FORMAT_VERSION } from "../types.js";

export type SessionSkillSnapshot = {
  skills: Skill[];
  prompt: string;
  version: number;
  promptFormatVersion: number;
  createdAt: number;
};

export type BuildSnapshotOptions = {
  skillFilter?: string[];
  includePrompt?: boolean;
};

export function buildSessionSkillSnapshot(
  entries: readonly SkillEntry[],
  options?: BuildSnapshotOptions,
): SessionSkillSnapshot {
  const { skillFilter, includePrompt = true } = options || {};

  const visibleEntries = entries.filter(isSkillPromptVisible);

  let filteredSkills = visibleEntries.map((e) => e.skill);
  if (skillFilter && skillFilter.length > 0) {
    const filterSet = new Set(skillFilter.map((s) => s.toLowerCase()));
    filteredSkills = filteredSkills.filter((skill) =>
      filterSet.has(skill.name.toLowerCase()),
    );
  }

  const prompt = includePrompt ? formatSkillsForPrompt(filteredSkills) : "";

  return {
    skills: filteredSkills,
    prompt,
    version: 1,
    promptFormatVersion: WORKSPACE_SKILLS_PROMPT_FORMAT_VERSION,
    createdAt: Date.now(),
  };
}

export function snapshotToLegacyFormat(
  snapshot: SessionSkillSnapshot,
): SkillSnapshot {
  return {
    prompt: snapshot.prompt,
    skills: snapshot.skills.map((s) => ({
      name: s.name,
      primaryEnv: undefined,
      requiredEnv: undefined,
    })),
    resolvedSkills: snapshot.skills,
    version: snapshot.version,
    promptFormatVersion: snapshot.promptFormatVersion,
  };
}

export function snapshotsEqual(
  a: SessionSkillSnapshot,
  b: SessionSkillSnapshot,
): boolean {
  if (a.skills.length !== b.skills.length) return false;
  if (a.version !== b.version) return false;
  if (a.promptFormatVersion !== b.promptFormatVersion) return false;

  const aNames = a.skills.map((s) => s.name).sort();
  const bNames = b.skills.map((s) => s.name).sort();

  return aNames.every((name, i) => name === bNames[i]);
}

export function diffSnapshots(
  oldSnapshot: SessionSkillSnapshot,
  newSnapshot: SessionSkillSnapshot,
): {
  added: string[];
  removed: string[];
  changed: string[];
} {
  const oldNames = new Set(oldSnapshot.skills.map((s) => s.name));
  const newNames = new Set(newSnapshot.skills.map((s) => s.name));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const skill of newSnapshot.skills) {
    if (!oldNames.has(skill.name)) {
      added.push(skill.name);
    }
  }

  for (const skill of oldSnapshot.skills) {
    if (!newNames.has(skill.name)) {
      removed.push(skill.name);
    }
  }

  const oldSkillMap = new Map(oldSnapshot.skills.map((s) => [s.name, s]));
  for (const newSkill of newSnapshot.skills) {
    const oldSkill = oldSkillMap.get(newSkill.name);
    if (oldSkill && oldSkill.promptVersion !== newSkill.promptVersion) {
      changed.push(newSkill.name);
    }
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
  };
}

export function getSkillFromSnapshot(
  snapshot: SessionSkillSnapshot,
  skillName: string,
): Skill | undefined {
  return snapshot.skills.find(
    (s) => s.name.toLowerCase() === skillName.toLowerCase(),
  );
}

export function getSkillNamesFromSnapshot(
  snapshot: SessionSkillSnapshot,
): string[] {
  return snapshot.skills.map((s) => s.name).sort();
}
