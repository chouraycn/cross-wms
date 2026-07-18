import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";
import type { Skill, SkillEntry, SkillSource } from "../types.js";
import { parseFrontmatter, resolveSkillInvocationPolicy, resolveSkillMetadata } from "./frontmatter.js";

export async function loadSkillFromDirectory(
  dirPath: string,
  source: SkillSource = "unknown",
): Promise<SkillEntry | null> {
  try {
    const skillFilePath = path.join(dirPath, "SKILL.md");
    const stat = await fs.stat(skillFilePath);
    if (!stat.isFile()) {
      return null;
    }

    const content = await fs.readFile(skillFilePath, "utf-8");
    const frontmatter = parseFrontmatter(content);
    const description = extractDescription(content);
    const name = path.basename(dirPath);
    const promptVersion = generatePromptVersion(content);

    const skill: Skill = {
      name,
      description,
      filePath: skillFilePath,
      baseDir: dirPath,
      promptVersion,
      source,
      disableModelInvocation: false,
    };

    const invocation = resolveSkillInvocationPolicy(frontmatter);
    const metadata = resolveSkillMetadata(frontmatter);

    skill.disableModelInvocation = invocation.disableModelInvocation;

    return {
      skill,
      frontmatter,
      metadata,
      invocation,
    };
  } catch (err) {
    logger.debug("[Skills] Failed to load skill from directory:", dirPath, err);
    return null;
  }
}

export async function loadSkillsFromDirectory(
  parentDir: string,
  source: SkillSource = "unknown",
): Promise<SkillEntry[]> {
  try {
    const entries = await fs.readdir(parentDir, { withFileTypes: true });
    const skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const skills: SkillEntry[] = [];
    for (const dirName of skillDirs) {
      const dirPath = path.join(parentDir, dirName);
      const skill = await loadSkillFromDirectory(dirPath, source);
      if (skill) {
        skills.push(skill);
      }
    }
    return skills;
  } catch (err) {
    logger.debug("[Skills] Failed to load skills from directory:", parentDir, err);
    return [];
  }
}

function extractDescription(content: string): string {
  const frontmatterEnd = content.indexOf("\n---", 3);
  const bodyStart = frontmatterEnd !== -1 ? frontmatterEnd + 4 : 0;
  const body = content.slice(bodyStart).trim();
  
  const firstParagraph = body.split("\n\n")[0]?.trim() || "";
  const cleanDescription = firstParagraph.replace(/^#\s+.+\n+/, "").trim();
  
  return cleanDescription.slice(0, 200);
}

function generatePromptVersion(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `v1-${Math.abs(hash).toString(36)}`;
}

export async function skillDirectoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return false;
    }
    const skillFile = path.join(dirPath, "SKILL.md");
    const skillStat = await fs.stat(skillFile);
    return skillStat.isFile();
  } catch {
    return false;
  }
}
