import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";
import { ensureWorkspaceSkillsDir } from "../loading/workspace.js";

export type ArchiveInstallResult = {
  success: boolean;
  skillName?: string;
  installedPath?: string;
  extractedFiles?: string[];
  error?: string;
};

export type ArchiveInstallOptions = {
  workspaceDir: string;
  skillName?: string;
  force?: boolean;
  stripComponents?: number;
};

export async function installFromDirectory(
  sourceDir: string,
  options: ArchiveInstallOptions,
): Promise<ArchiveInstallResult> {
  const { workspaceDir, skillName, force = false, stripComponents = 0 } = options;

  try {
    const sourceStat = await fs.stat(sourceDir);
    if (!sourceStat.isDirectory()) {
      return {
        success: false,
        error: `Source path is not a directory: ${sourceDir}`,
      };
    }

    const skillsDir = await ensureWorkspaceSkillsDir(workspaceDir);
    const targetSkillName = skillName || path.basename(sourceDir);
    const targetDir = path.join(skillsDir, targetSkillName);

    if (!force) {
      try {
        await fs.access(targetDir);
        return {
          success: false,
          skillName: targetSkillName,
          error: `Skill '${targetSkillName}' already exists. Use force=true to overwrite.`,
        };
      } catch {
        // Directory doesn't exist, proceed
      }
    }

    await fs.mkdir(targetDir, { recursive: true });

    const extractedFiles = await copyDirectoryContents(sourceDir, targetDir, stripComponents);

    const skillFile = path.join(targetDir, "SKILL.md");
    try {
      await fs.access(skillFile);
    } catch {
      await generateDefaultSkillFile(targetDir, targetSkillName);
      extractedFiles.push("SKILL.md");
    }

    logger.info("[Skills] Installed skill from directory:", targetSkillName);

    return {
      success: true,
      skillName: targetSkillName,
      installedPath: targetDir,
      extractedFiles,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Archive install failed:", err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

async function copyDirectoryContents(
  sourceDir: string,
  targetDir: string,
  stripComponents: number,
): Promise<string[]> {
  const copiedFiles: string[] = [];

  let effectiveSource = sourceDir;
  if (stripComponents > 0) {
    let current = sourceDir;
    for (let i = 0; i < stripComponents; i++) {
      const entries = await fs.readdir(current, { withFileTypes: true });
      const subdirs = entries.filter((e) => e.isDirectory());
      if (subdirs.length === 0) break;
      current = path.join(current, subdirs[0].name);
    }
    effectiveSource = current;
  }

  const stack: string[] = [effectiveSource];
  const basePath = effectiveSource;

  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(basePath, sourcePath);
      const targetPath = path.join(targetDir, relativePath);

      if (entry.isDirectory()) {
        await fs.mkdir(targetPath, { recursive: true });
        stack.push(sourcePath);
      } else if (entry.isFile()) {
        const targetParent = path.dirname(targetPath);
        await fs.mkdir(targetParent, { recursive: true });
        await fs.copyFile(sourcePath, targetPath);
        copiedFiles.push(relativePath);
      }
    }
  }

  return copiedFiles;
}

async function generateDefaultSkillFile(skillDir: string, skillName: string): Promise<void> {
  const content = `---
name: ${skillName}
description: Skill installed from local directory
---

# ${skillName}

This skill was installed from a local directory.
`;
  await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf-8");
}

export async function archiveSkill(
  skillName: string,
  workspaceDir: string,
  archiveDir: string,
): Promise<{ success: boolean; archivePath?: string; error?: string }> {
  try {
    const skillsDir = await ensureWorkspaceSkillsDir(workspaceDir);
    const skillDir = path.join(skillsDir, skillName);

    try {
      await fs.access(skillDir);
    } catch {
      return {
        success: false,
        error: `Skill '${skillName}' not found`,
      };
    }

    await fs.mkdir(archiveDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveName = `${skillName}-${timestamp}`;
    const archivePath = path.join(archiveDir, archiveName);

    await fs.mkdir(archivePath, { recursive: true });
    await copyDirectoryContents(skillDir, archivePath, 0);

    logger.info("[Skills] Archived skill:", skillName, "to", archivePath);

    return {
      success: true,
      archivePath,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Archive failed:", err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
