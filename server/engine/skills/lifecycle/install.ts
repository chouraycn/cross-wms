import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";
import type { SkillInstallSpec } from "../types.js";
import { ensureWorkspaceSkillsDir } from "../loading/workspace.js";
import { downloadWithRetry, verifyChecksum, getTempDir, cleanupTempDir } from "./install-download.js";
import { extractArchive, findArchiveRootDir } from "./install-extract.js";
import { writeWorkspaceSkill, readWorkspaceSkillFile } from "./workspace-skill-write.js";
import { extractPackage, type PackageManifest } from "./skill-packager.js";

export type InstallResult = {
  success: boolean;
  skillName?: string;
  installedPath?: string;
  error?: string;
  manifest?: PackageManifest;
};

export type InstallOptions = {
  workspaceDir: string;
  force?: boolean;
  onProgress?: (message: string) => void;
};

export async function installSkill(
  spec: SkillInstallSpec,
  options: InstallOptions,
): Promise<InstallResult> {
  const { workspaceDir, force = false, onProgress } = options;

  try {
    onProgress?.(`Starting install for ${spec.kind} skill...`);

    const skillsDir = await ensureWorkspaceSkillsDir(workspaceDir);
    const skillName = spec.id || `skill-${Date.now()}`;
    const skillDir = path.join(skillsDir, skillName);

    if (!force) {
      try {
        await fs.access(skillDir);
        return {
          success: false,
          skillName,
          error: `Skill '${skillName}' already exists. Use force=true to overwrite.`,
        };
      } catch {
        // Directory doesn't exist, proceed with install
      }
    }

    await fs.mkdir(skillDir, { recursive: true });

    const skillMdContent = generateSkillMarkdown(skillName, spec);
    await fs.writeFile(path.join(skillDir, "SKILL.md"), skillMdContent, "utf-8");

    onProgress?.(`Skill '${skillName}' installed successfully`);

    return {
      success: true,
      skillName,
      installedPath: skillDir,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Install failed:", err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

function generateSkillMarkdown(name: string, spec: SkillInstallSpec): string {
  return `---
name: ${name}
description: Skill installed via ${spec.kind} installer
emoji: 📦
---

# ${name}

This skill was installed via the ${spec.kind} installer.

## Installation

- Type: ${spec.kind}
${spec.label ? `- Label: ${spec.label}` : ""}
${spec.package ? `- Package: ${spec.package}` : ""}
${spec.formula ? `- Formula: ${spec.formula}` : ""}
${spec.module ? `- Module: ${spec.module}` : ""}
${spec.url ? `- URL: ${spec.url}` : ""}
${spec.bins ? `- Bins: ${spec.bins.join(", ")}` : ""}
${spec.os ? `- OS: ${spec.os.join(", ")}` : ""}
`;
}

export async function uninstallSkill(
  skillName: string,
  workspaceDir: string,
): Promise<{ success: boolean; error?: string }> {
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

    await fs.rm(skillDir, { recursive: true, force: true });
    logger.info("[Skills] Uninstalled skill:", skillName);

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Uninstall failed:", err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export function validateInstallSpec(spec: SkillInstallSpec): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!spec.kind) {
    errors.push("Install spec must have a 'kind' field");
  }

  const validKinds: SkillInstallSpec["kind"][] = ["brew", "node", "go", "uv", "download"];
  if (spec.kind && !validKinds.includes(spec.kind)) {
    errors.push(`Invalid install kind: ${spec.kind}. Must be one of: ${validKinds.join(", ")}`);
  }

  if (spec.kind === "brew" && !spec.formula) {
    errors.push("Brew install requires 'formula' field");
  }

  if (spec.kind === "node" && !spec.package) {
    errors.push("Node install requires 'package' field");
  }

  if (spec.kind === "go" && !spec.module) {
    errors.push("Go install requires 'module' field");
  }

  if (spec.kind === "uv" && !spec.package) {
    errors.push("UV install requires 'package' field");
  }

  if (spec.kind === "download" && !spec.url) {
    errors.push("Download install requires 'url' field");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// 下载安装与归档安装
// ============================================================================

/**
 * 从 URL 下载并安装技能
 *
 * 支持直接下载单文件技能，或下载归档文件后解压安装。
 *
 * @param url - 下载 URL
 * @param options - 安装选项
 * @returns Promise<InstallResult>
 */
export async function installFromDownload(
  url: string,
  options: InstallOptions & {
    skillName?: string;
    extract?: boolean;
    stripComponents?: number;
    checksum?: string;
    retries?: number;
  },
): Promise<InstallResult> {
  const {
    workspaceDir,
    skillName,
    extract = false,
    stripComponents = 0,
    checksum,
    retries = 3,
    force = false,
    onProgress,
  } = options;

  let tempDir: string | null = null;

  try {
    onProgress?.("Starting download...");
    logger.info("[Skills] Installing from download:", url);

    tempDir = await getTempDir("skill-download");
    const fileName = path.basename(new URL(url).pathname) || "download";
    const downloadPath = path.join(tempDir, fileName);

    onProgress?.("Downloading skill archive...");
    await downloadWithRetry(url, downloadPath, retries);

    if (checksum) {
      onProgress?.("Verifying checksum...");
      const checksumValid = await verifyChecksum(downloadPath, checksum);
      if (!checksumValid) {
        return {
          success: false,
          error: "Checksum verification failed",
        };
      }
    }

    if (fileName.toLowerCase().endsWith(".skill.zip")) {
      return await installFromPackage(downloadPath, {
        workspaceDir,
        force,
        onProgress,
      });
    }

    if (extract || isArchiveFile(fileName)) {
      onProgress?.("Extracting archive...");
      return await installFromArchive(downloadPath, {
        workspaceDir,
        skillName,
        stripComponents,
        force,
        onProgress,
      });
    }

    const finalSkillName = skillName || deriveSkillNameFromUrl(url);
    const content = await fs.readFile(downloadPath, "utf-8");

    onProgress?.("Installing skill...");
    const result = await writeWorkspaceSkill(workspaceDir, finalSkillName, content);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    onProgress?.(`Skill '${finalSkillName}' installed successfully`);

    return {
      success: true,
      skillName: finalSkillName,
      installedPath: result.skillDir,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Download install failed:", err);
    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}

/**
 * 从本地归档文件安装技能
 *
 * @param archivePath - 归档文件路径
 * @param options - 安装选项
 * @returns Promise<InstallResult>
 */
export async function installFromArchive(
  archivePath: string,
  options: InstallOptions & {
    skillName?: string;
    stripComponents?: number;
  },
): Promise<InstallResult> {
  const {
    workspaceDir,
    skillName,
    stripComponents = 0,
    force = false,
    onProgress,
  } = options;

  let tempDir: string | null = null;

  try {
    onProgress?.("Preparing archive installation...");
    logger.info("[Skills] Installing from archive:", archivePath);

    const archiveStat = await fs.stat(archivePath);
    if (!archiveStat.isFile()) {
      return {
        success: false,
        error: `Archive path is not a file: ${archivePath}`,
      };
    }

    tempDir = await getTempDir("skill-archive-extract");

    onProgress?.("Extracting archive...");
    await extractArchive(archivePath, tempDir, { stripComponents });

    onProgress?.("Finding skill root directory...");
    const skillRootDir = await findArchiveRootDir(tempDir);
    const sourceDir = skillRootDir || tempDir;

    const finalSkillName = skillName || await deriveSkillNameFromDir(sourceDir);

    onProgress?.("Installing skill...");

    const skillsDir = await ensureWorkspaceSkillsDir(workspaceDir);
    const targetSkillDir = path.join(skillsDir, finalSkillName);

    if (!force) {
      try {
        await fs.access(targetSkillDir);
        return {
          success: false,
          skillName: finalSkillName,
          error: `Skill '${finalSkillName}' already exists. Use force=true to overwrite.`,
        };
      } catch {
        // Directory doesn't exist, proceed
      }
    }

    await copyDirectoryContents(sourceDir, targetSkillDir);

    const skillFile = path.join(targetSkillDir, "SKILL.md");
    try {
      await fs.access(skillFile);
    } catch {
      await generateDefaultSkillFile(targetSkillDir, finalSkillName);
    }

    onProgress?.(`Skill '${finalSkillName}' installed successfully`);
    logger.info("[Skills] Installed skill from archive:", finalSkillName);

    return {
      success: true,
      skillName: finalSkillName,
      installedPath: targetSkillDir,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Archive install failed:", err);
    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}

/**
 * 从技能包文件安装技能
 *
 * @param packagePath - 技能包文件路径（.skill.zip）
 * @param options - 安装选项
 * @returns Promise<InstallResult>
 */
export async function installFromPackage(
  packagePath: string,
  options: InstallOptions & {
    skillName?: string;
  },
): Promise<InstallResult> {
  const {
    workspaceDir,
    skillName,
    force = false,
    onProgress,
  } = options;

  let tempDir: string | null = null;

  try {
    onProgress?.("Preparing package installation...");
    logger.info("[Skills] Installing from package:", packagePath);

    const pkgStat = await fs.stat(packagePath);
    if (!pkgStat.isFile()) {
      return {
        success: false,
        error: `Package path is not a file: ${packagePath}`,
      };
    }

    tempDir = await getTempDir("skill-package-extract");

    onProgress?.("Extracting skill package...");
    const manifest = await extractPackage(packagePath, tempDir);

    const finalSkillName = skillName || manifest.package.name;

    onProgress?.("Installing skill...");

    const skillsDir = await ensureWorkspaceSkillsDir(workspaceDir);
    const targetSkillDir = path.join(skillsDir, finalSkillName);

    if (!force) {
      try {
        await fs.access(targetSkillDir);
        return {
          success: false,
          skillName: finalSkillName,
          error: `Skill '${finalSkillName}' already exists. Use force=true to overwrite.`,
        };
      } catch {
        // Directory doesn't exist, proceed
      }
    }

    await copyDirectoryContents(tempDir, targetSkillDir);

    onProgress?.(`Skill '${finalSkillName}' installed successfully from package`);
    logger.info("[Skills] Installed skill from package:", finalSkillName);

    return {
      success: true,
      skillName: finalSkillName,
      installedPath: targetSkillDir,
      manifest,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Package install failed:", err);
    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}

/**
 * 判断文件是否为归档文件
 */
function isArchiveFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith(".zip") ||
    lower.endsWith(".tar") ||
    lower.endsWith(".tar.gz") ||
    lower.endsWith(".tgz")
  );
}

/**
 * 从 URL 推断技能名称
 */
function deriveSkillNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    const lastName = pathParts[pathParts.length - 1] || "skill";
    const name = lastName.replace(/\.(zip|tar|tar\.gz|tgz|md|skill\.zip)$/i, "");
    return sanitizeSkillName(name);
  } catch {
    return `skill-${Date.now()}`;
  }
}

/**
 * 从目录推断技能名称
 */
async function deriveSkillNameFromDir(dir: string): Promise<string> {
  try {
    const skillFile = path.join(dir, "SKILL.md");
    const content = await fs.readFile(skillFile, "utf-8");
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    if (nameMatch) {
      return sanitizeSkillName(nameMatch[1].trim());
    }
  } catch {
    // 忽略读取错误
  }

  const baseName = path.basename(dir);
  return sanitizeSkillName(baseName);
}

/**
 * 清理技能名称，确保其合法
 */
function sanitizeSkillName(name: string): string {
  let sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (sanitized.length < 2) {
    sanitized = `skill-${Date.now()}`;
  }

  return sanitized.slice(0, 50);
}

/**
 * 复制目录内容
 */
async function copyDirectoryContents(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryContents(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

/**
 * 生成默认技能文件
 */
async function generateDefaultSkillFile(skillDir: string, skillName: string): Promise<void> {
  const content = `---
name: ${skillName}
description: Skill installed from archive
emoji: 📦
---

# ${skillName}

This skill was installed from an archive file.
`;
  await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf-8");
}

/**
 * 更新已有技能
 *
 * @param workspaceDir - 工作区目录
 * @param skillName - 技能名称
 * @param content - 新的 SKILL.md 内容
 * @returns Promise<{ success: boolean; error?: string }>
 */
export async function updateSkill(
  workspaceDir: string,
  skillName: string,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const skillsDir = await ensureWorkspaceSkillsDir(workspaceDir);
    const skillDir = path.join(skillsDir, skillName);
    const skillFile = path.join(skillDir, "SKILL.md");

    const existingContent = await readWorkspaceSkillFile(skillFile);
    if (existingContent === null) {
      return { success: false, error: `Skill '${skillName}' not found` };
    }

    await writeWorkspaceSkill({
      workspaceDir,
      skillDir,
      skillFile,
      content,
      mode: "update",
      symlinkPolicy: { allowWrites: false, allowedTargetRealPaths: [] },
    });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Update skill failed:", err);
    return { success: false, error: errorMessage };
  }
}
