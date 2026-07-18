import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";
import type { SkillInstallSpec } from "../types.js";
import { ensureWorkspaceSkillsDir } from "../loading/workspace.js";

export type InstallResult = {
  success: boolean;
  skillName?: string;
  installedPath?: string;
  error?: string;
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
