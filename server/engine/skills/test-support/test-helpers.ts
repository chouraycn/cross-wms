import fs from "node:fs/promises";
import path from "node:path";
import type { Skill } from "../types.js";
import type { SkillEntry } from "../types.js";

export async function writeSkill(params: {
  dir: string;
  name: string;
  description: string;
  body?: string;
}) {
  const { dir, name, description, body } = params;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body ?? `# ${name}\n`}\n`,
    "utf-8",
  );
}

export function createCanonicalFixtureSkill(params: {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  promptVersion?: string;
  disableModelInvocation?: boolean;
}): Skill {
  return {
    name: params.name,
    description: params.description,
    filePath: params.filePath,
    baseDir: params.baseDir,
    promptVersion: params.promptVersion,
    source: params.source as any,
    disableModelInvocation: params.disableModelInvocation ?? false,
  };
}

export function createFixtureSkillEntry(
  name: string,
  opts?: {
    source?: string;
    skillKey?: string;
    exposure?: SkillEntry["exposure"];
    invocation?: SkillEntry["invocation"];
  },
): SkillEntry {
  return {
    skill: createCanonicalFixtureSkill({
      name,
      description: `${name} description`,
      filePath: `/skills/${name}/SKILL.md`,
      baseDir: `/skills/${name}`,
      source: opts?.source ?? "openclaw-workspace",
    }),
    frontmatter: {},
    metadata: opts?.skillKey ? { skillKey: opts.skillKey } : undefined,
    invocation: opts?.invocation ?? {
      userInvocable: true,
      disableModelInvocation: false,
    },
    exposure: opts?.exposure,
  };
}