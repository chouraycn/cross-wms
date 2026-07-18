import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";
import type { SkillEntry } from "../types.js";
import { loadSkillFromDirectory, loadSkillsFromDirectory } from "./local-loader.js";

const WORKSPACE_SKILLS_DIR = ".cross-wms/skills";

export async function getWorkspaceSkillsDir(workspaceDir: string): Promise<string> {
  return path.join(workspaceDir, WORKSPACE_SKILLS_DIR);
}

export async function loadWorkspaceSkills(workspaceDir: string): Promise<SkillEntry[]> {
  const skillsDir = await getWorkspaceSkillsDir(workspaceDir);
  try {
    await fs.access(skillsDir);
  } catch {
    logger.debug("[Skills] Workspace skills directory does not exist:", skillsDir);
    return [];
  }
  return loadSkillsFromDirectory(skillsDir, "workspace");
}

export async function loadWorkspaceSkill(
  workspaceDir: string,
  skillName: string,
): Promise<SkillEntry | null> {
  const skillsDir = await getWorkspaceSkillsDir(workspaceDir);
  const skillDir = path.join(skillsDir, skillName);
  return loadSkillFromDirectory(skillDir, "workspace");
}

export async function workspaceSkillExists(
  workspaceDir: string,
  skillName: string,
): Promise<boolean> {
  const skillsDir = await getWorkspaceSkillsDir(workspaceDir);
  const skillDir = path.join(skillsDir, skillName);
  const skillFile = path.join(skillDir, "SKILL.md");
  try {
    const stat = await fs.stat(skillFile);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function listWorkspaceSkillNames(workspaceDir: string): Promise<string[]> {
  const skillsDir = await getWorkspaceSkillsDir(workspaceDir);
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function ensureWorkspaceSkillsDir(workspaceDir: string): Promise<string> {
  const skillsDir = await getWorkspaceSkillsDir(workspaceDir);
  try {
    await fs.mkdir(skillsDir, { recursive: true });
  } catch (err) {
    logger.error("[Skills] Failed to create workspace skills directory:", skillsDir, err);
    throw err;
  }
  return skillsDir;
}
