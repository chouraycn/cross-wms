import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";
import { ensureWorkspaceSkillsDir } from "../loading/workspace.js";
import { writeWorkspaceSkill, readWorkspaceSkillFile, assertInsideWorkspace } from "./workspace-skill-write.js";
import type { WorkspaceSkillSupportFile } from "./install-types.js";

export type SourceInstallResult = {
  success: boolean;
  skillName?: string;
  installedPath?: string;
  error?: string;
};

export type SourceInstallOptions = {
  workspaceDir: string;
  skillName: string;
  content: string;
  force?: boolean;
  description?: string;
};

export async function installFromSource(
  options: SourceInstallOptions,
): Promise<SourceInstallResult> {
  const { workspaceDir, skillName, content, force = false, description } = options;

  try {
    if (!skillName || skillName.trim().length === 0) {
      return {
        success: false,
        error: "Skill name is required",
      };
    }

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: "Skill content is required",
      };
    }

    const skillsDir = await ensureWorkspaceSkillsDir(workspaceDir);
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
        // Directory doesn't exist, proceed
      }
    }

    await fs.mkdir(skillDir, { recursive: true });

    let finalContent = content;
    if (!content.includes("SKILL.md") && !content.startsWith("---")) {
      finalContent = generateSkillWithFrontmatter(skillName, content, description);
    }

    await fs.writeFile(path.join(skillDir, "SKILL.md"), finalContent, "utf-8");

    logger.info("[Skills] Installed skill from source:", skillName);

    return {
      success: true,
      skillName,
      installedPath: skillDir,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Source install failed:", err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

function generateSkillWithFrontmatter(
  skillName: string,
  body: string,
  description?: string,
): string {
  const desc = description || body.slice(0, 100).trim();
  return `---
name: ${skillName}
description: ${desc}
---

${body}
`;
}

export async function updateSkillContent(
  workspaceDir: string,
  skillName: string,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const skillsDir = await ensureWorkspaceSkillsDir(workspaceDir);
    const skillDir = path.join(skillsDir, skillName);
    const skillFile = path.join(skillDir, "SKILL.md");

    try {
      await fs.access(skillFile);
    } catch {
      return {
        success: false,
        error: `Skill '${skillName}' not found`,
      };
    }

    await fs.writeFile(skillFile, content, "utf-8");
    logger.info("[Skills] Updated skill content:", skillName);

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Update skill content failed:", err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function createSkillFromTemplate(
  workspaceDir: string,
  skillName: string,
  templateType: "basic" | "tool" | "workflow" = "basic",
): Promise<SourceInstallResult> {
  const templates: Record<string, string> = {
    basic: `---
name: ${skillName}
description: A new skill
emoji: ✨
---

# ${skillName}

This is a basic skill template.

## Usage

Describe how to use this skill here.
`,
    tool: `---
name: ${skillName}
description: A tool-based skill
emoji: 🔧
---

# ${skillName}

This skill provides tool functionality.

## Tools

- tool1: Description of tool1
- tool2: Description of tool2
`,
    workflow: `---
name: ${skillName}
description: A workflow-based skill
emoji: ⚙️
---

# ${skillName}

This skill implements a workflow.

## Workflow Steps

1. Step one description
2. Step two description
3. Step three description
`,
  };

  return installFromSource({
    workspaceDir,
    skillName,
    content: templates[templateType] || templates.basic,
  });
}

export function validateSkillName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Skill name cannot be empty" };
  }

  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: "Skill name must be at least 2 characters" };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: "Skill name must be at most 50 characters" };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return {
      valid: false,
      error: "Skill name can only contain letters, numbers, hyphens, and underscores",
    };
  }

  if (trimmed.startsWith("-") || trimmed.startsWith("_")) {
    return { valid: false, error: "Skill name cannot start with a hyphen or underscore" };
  }

  if (trimmed.endsWith("-") || trimmed.endsWith("_")) {
    return { valid: false, error: "Skill name cannot end with a hyphen or underscore" };
  }

  return { valid: true };
}

// ============================================================================
// 带支持文件的技能安装
// ============================================================================

/**
 * 从源代码安装技能（带支持文件）
 *
 * @param options - 安装选项
 * @param supportFiles - 支持文件列表
 * @returns Promise<SourceInstallResult>
 */
export async function installFromSourceWithSupportFiles(
  options: SourceInstallOptions,
  supportFiles: WorkspaceSkillSupportFile[] = [],
): Promise<SourceInstallResult> {
  const { workspaceDir, skillName, content, force = false, description } = options;

  try {
    if (!skillName || skillName.trim().length === 0) {
      return {
        success: false,
        error: "Skill name is required",
      };
    }

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: "Skill content is required",
      };
    }

    const nameValidation = validateSkillName(skillName);
    if (!nameValidation.valid) {
      return {
        success: false,
        error: nameValidation.error,
      };
    }

    const skillsDir = await ensureWorkspaceSkillsDir(workspaceDir);
    const skillDir = path.join(skillsDir, skillName);
    const skillFile = path.join(skillDir, "SKILL.md");

    let skillExists = false;
    try {
      await fs.access(skillFile);
      skillExists = true;
    } catch {
      // Skill doesn't exist
    }

    if (skillExists && !force) {
      return {
        success: false,
        skillName,
        error: `Skill '${skillName}' already exists. Use force=true to overwrite.`,
      };
    }

    let finalContent = content;
    if (!content.includes("SKILL.md") && !content.startsWith("---")) {
      finalContent = generateSkillWithFrontmatter(skillName, content, description);
    }

    await writeWorkspaceSkill({
      workspaceDir,
      skillDir,
      skillFile,
      content: finalContent,
      supportFiles: supportFiles.map((f) => ({ path: f.path, content: f.content })),
      mode: skillExists ? "update" : "create",
      symlinkPolicy: { allowWrites: false, allowedTargetRealPaths: [] },
    });

    logger.info("[Skills] Installed skill from source with support files:", skillName);

    return {
      success: true,
      skillName,
      installedPath: skillDir,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Source install with support files failed:", err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 读取技能及其支持文件
 *
 * @param workspaceDir - 工作区目录
 * @param skillName - 技能名称
 * @returns Promise<{ success: boolean; content?: string; supportFiles?: string[]; error?: string }>
 */
export async function readSkillWithSupportFiles(
  workspaceDir: string,
  skillName: string,
): Promise<{ success: boolean; content?: string; supportFiles?: string[]; error?: string }> {
  try {
    const skillsDir = path.join(workspaceDir, ".cross-wms", "skills");
    const skillDir = path.join(skillsDir, skillName);
    const skillFile = path.join(skillDir, "SKILL.md");

    const content = await readWorkspaceSkillFile(skillFile);

    if (content === null) {
      return {
        success: false,
        error: `Skill '${skillName}' not found`,
      };
    }

    const supportFiles: string[] = [];
    const entries = await fs.readdir(skillDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name !== "SKILL.md") {
        supportFiles.push(entry.name);
      } else if (entry.isDirectory()) {
        const subFiles = await listFilesInDir(path.join(skillDir, entry.name), entry.name);
        supportFiles.push(...subFiles);
      }
    }

    return {
      success: true,
      content,
      supportFiles: supportFiles.sort(),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Failed to read skill with support files:", err);
    return { success: false, error: errorMessage };
  }
}

/**
 * 递归列出目录中的文件（相对路径）
 */
async function listFilesInDir(dir: string, prefix: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(prefix, entry.name);

    if (entry.isDirectory()) {
      const subFiles = await listFilesInDir(fullPath, relativePath);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      results.push(relativePath);
    }
  }

  return results;
}

