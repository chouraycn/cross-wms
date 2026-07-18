import type { SkillCommandSpec, SkillEntry } from "../types.js";
import { normalizeSkillName } from "./filter.js";

export function extractCommandSpecsFromSkill(entry: SkillEntry): SkillCommandSpec[] {
  const commands: SkillCommandSpec[] = [];
  const skillName = entry.skill.name;
  const skillSource = entry.skill.source;

  commands.push({
    name: skillName,
    skillName,
    description: entry.skill.description,
    skillSource,
    sourceFilePath: entry.skill.filePath,
  });

  const commandNames = entry.frontmatter["commands"];
  if (commandNames) {
    const names = commandNames.split(",").map((s) => s.trim()).filter(Boolean);
    for (const name of names) {
      if (name !== skillName) {
        commands.push({
          name,
          skillName,
          description: entry.skill.description,
          skillSource,
          sourceFilePath: entry.skill.filePath,
        });
      }
    }
  }

  return commands;
}

export function buildCommandIndex(entries: readonly SkillEntry[]): Map<string, SkillCommandSpec> {
  const index = new Map<string, SkillCommandSpec>();
  for (const entry of entries) {
    const commands = extractCommandSpecsFromSkill(entry);
    for (const cmd of commands) {
      const normalized = normalizeSkillName(cmd.name);
      if (!index.has(normalized)) {
        index.set(normalized, cmd);
      }
    }
  }
  return index;
}

export function findCommandByName(
  index: Map<string, SkillCommandSpec>,
  name: string,
): SkillCommandSpec | undefined {
  return index.get(normalizeSkillName(name));
}

export function listAllCommands(entries: readonly SkillEntry[]): SkillCommandSpec[] {
  const commands: SkillCommandSpec[] = [];
  for (const entry of entries) {
    commands.push(...extractCommandSpecsFromSkill(entry));
  }
  return commands;
}
