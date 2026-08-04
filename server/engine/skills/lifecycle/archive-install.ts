import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";
import { formatErrorMessage } from "../../infra/errors.js";
import { pathExists } from "../../infra/fs-safe.js";
import { installPackageDir } from "../../infra/install-package-dir.js";
import { ensureWorkspaceSkillsDir, getWorkspaceSkillsDir } from "../loading/workspace.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import type {
  PluginHookBeforeInstallBuiltinScan,
  PluginHookBeforeInstallContext,
  PluginHookBeforeInstallEvent,
} from "../../plugins/hook-types.js";

// 重新导出 ClawHub 技能归档根目录标识（定义见 install-extract.ts）
export { CLAWHUB_SKILL_ARCHIVE_ROOT_MARKERS } from "./install-extract.js";

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

// ===================== Upload install support =====================

/** Skill slug pattern: lowercase alphanumeric with hyphens, 1-64 chars. */
const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Validates a requested skill slug for archive install/upload flows.
 *
 * @returns the validated slug
 * @throws Error if the slug is invalid (message starts with "Invalid skill slug")
 */
export function validateRequestedSkillSlug(slug: string): string {
  const trimmed = slug.trim();
  if (!trimmed || !SKILL_SLUG_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid skill slug "${slug}": must be 1-64 chars, lowercase alphanumeric with hyphens, and start with a letter or digit`,
    );
  }
  return trimmed;
}

/** Failure kinds for archive-based skill installs. */
export type SkillArchiveInstallFailureKind =
  | "invalid-request"
  | "archive-extraction"
  | "skill-conflict"
  | "policy-denied"
  | "timeout"
  | "unknown";

/** Logger interface accepted by archive install flows. */
export type SkillArchiveLogger = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};

/** Parameters for installing a skill from an archive path. */
export interface InstallSkillArchiveFromPathParams {
  archivePath: string;
  workspaceDir: string;
  slug: string;
  force?: boolean;
  timeoutMs?: number;
  logger?: SkillArchiveLogger;
  policy?: Record<string, unknown>;
}

/** Result of installing a skill from an archive path. */
export type InstallSkillArchiveFromPathResult =
  | { ok: true; targetDir: string }
  | { ok: false; failureKind: SkillArchiveInstallFailureKind; error: string };

/**
 * Installs a skill from a staged archive path into the workspace skills directory.
 *
 * This wraps {@link installFromDirectory} for the upload/remote install flow,
 * translating the generic result into the ok/failureKind discriminated union
 * expected by callers.
 */
export async function installSkillArchiveFromPath(
  params: InstallSkillArchiveFromPathParams,
): Promise<InstallSkillArchiveFromPathResult> {
  const { archivePath, workspaceDir, slug, force = false } = params;
  const log = params.logger ?? logger;

  try {
    try {
      const stat = await fs.stat(archivePath);
      if (!stat.isDirectory()) {
        return {
          ok: false,
          failureKind: "invalid-request",
          error: `Archive path is not a directory: ${archivePath}`,
        };
      }
    } catch {
      return {
        ok: false,
        failureKind: "invalid-request",
        error: `Archive path does not exist: ${archivePath}`,
      };
    }

    const result = await installFromDirectory(archivePath, {
      workspaceDir,
      skillName: slug,
      force,
    });

    if (!result.success) {
      const isConflict = result.error?.includes("already exists");
      return {
        ok: false,
        failureKind: isConflict ? "skill-conflict" : "archive-extraction",
        error: result.error ?? "Unknown install failure",
      };
    }

    log.info?.("[Skills] Installed skill archive:", slug);
    return { ok: true, targetDir: result.installedPath ?? "" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error?.("[Skills] Archive install failed:", err);
    return {
      ok: false,
      failureKind: "unknown",
      error: errorMessage,
    };
  }
}

// ===================== ClawHub 已解压技能根目录安装 =====================
// 参考 openclaw/src/skills/lifecycle/archive-install.ts：
// 校验根目录标识、解析目标目录、按策略调用 before_install 钩子、复制文件。

/** 未传入 rootMarkers 时使用的默认根目录标识 */
const DEFAULT_SKILL_ARCHIVE_ROOT_MARKERS = ["SKILL.md"] as const;

/** 策略 origin/source 的宽松类型（与 openclaw InstallPolicyOrigin/Source 对齐） */
type SkillInstallPolicyOrigin = { type: string; [key: string]: unknown };
type SkillInstallPolicySource = { kind: string; [key: string]: unknown };

/** installExtractedSkillRoot 接受的安装策略 */
type SkillInstallPolicy = {
  config?: unknown;
  installId?: string;
  origin: SkillInstallPolicyOrigin;
  requestedSpecifier?: string;
  source?: SkillInstallPolicySource;
};

/** installExtractedSkillRoot 接受的 logger 形态 */
type InstallExtractedLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
};

/** installExtractedSkillRoot 的返回结果 */
export type InstallExtractedSkillRootResult =
  | { ok: true; targetDir: string }
  | { ok: false; error: string; failureKind: SkillArchiveInstallFailureKind };

/** before_install 钩子使用的默认内置扫描结果（降级：通过，无发现） */
const EMPTY_BUILTIN_SCAN: PluginHookBeforeInstallBuiltinScan = {
  status: "ok",
  scannedFiles: 0,
  critical: 0,
  warn: 0,
  info: 0,
  findings: [],
};

/**
 * 归一化已跟踪的技能 slug：禁止路径分隔符与穿越片段。
 * 移植自 openclaw/src/skills/lifecycle/archive-install.ts。
 */
export function normalizeTrackedSkillSlug(raw: string): string {
  const slug = raw.trim();
  if (!slug || slug.includes("/") || slug.includes("\\") || slug.includes("..")) {
    throw new Error(`Invalid skill slug: ${raw}`);
  }
  return slug;
}

/** 校验技能安装 ID：禁止空、保留路径段、路径分隔符 */
function validateSkillInstallId(id: string): string | null {
  if (!id) {
    return "invalid skill slug: missing";
  }
  if (id === "." || id === "..") {
    return "invalid skill slug: reserved path segment";
  }
  if (id.includes("/") || id.includes("\\")) {
    return "invalid skill slug: path separators not allowed";
  }
  return null;
}

/**
 * 解析工作区内技能安装目标目录（防穿越）。
 * 返回 {workspaceDir}/.cross-wms/skills/{slug}，与 loading/workspace 约定一致。
 * 移植自 openclaw，base 目录采用服务端 .cross-wms/skills 约定。
 */
export function resolveWorkspaceSkillInstallDir(workspaceDir: string, slug: string): string {
  const skillsDir = path.resolve(getWorkspaceSkillsDir(workspaceDir));
  const idError = validateSkillInstallId(slug);
  if (idError) {
    throw new Error(idError);
  }
  const target = path.resolve(skillsDir, slug);
  const relative = path.relative(skillsDir, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Invalid skill slug "${slug}": path traversal detected`);
  }
  return target;
}

/** 将策略 origin 映射为 before_install 钩子的 origin 字符串 */
function formatInstallPolicyOriginForHook(origin: SkillInstallPolicyOrigin): string {
  const type = origin.type;
  if (type === "upload") {
    return "skill-upload";
  }
  const specRaw = origin.spec;
  const spec = typeof specRaw === "string" ? specRaw : undefined;
  const slugRaw = origin.slug;
  const slug = typeof slugRaw === "string" ? slugRaw : undefined;
  return spec ?? slug ?? type;
}

/** 检查目录是否包含任一根目录标识文件 */
async function hasSkillArchiveRoot(
  rootDir: string,
  rootMarkers: readonly string[],
): Promise<boolean> {
  for (const candidate of rootMarkers) {
    if (await pathExists(path.join(rootDir, candidate))) {
      return true;
    }
  }
  return false;
}

/** 调用 before_install 钩子；返回阻断原因字符串，或 undefined 表示放行 */
async function runSkillInstallPolicyHook(params: {
  policy: SkillInstallPolicy;
  slug: string;
  extractedRoot: string;
  effectiveMode: "install" | "update";
}): Promise<string | undefined> {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner || !hookRunner.hasHooks("before_install")) {
    return undefined;
  }
  const origin = formatInstallPolicyOriginForHook(params.policy.origin);
  const event: PluginHookBeforeInstallEvent = {
    targetType: "skill",
    targetName: params.slug,
    sourcePath: params.extractedRoot,
    sourcePathKind: "directory",
    origin,
    request: {
      kind: "skill-install",
      mode: params.effectiveMode,
      ...(params.policy.requestedSpecifier
        ? { requestedSpecifier: params.policy.requestedSpecifier }
        : {}),
    },
    builtinScan: EMPTY_BUILTIN_SCAN,
    skill: { installId: params.policy.installId ?? "archive" },
  };
  const ctx: PluginHookBeforeInstallContext = {
    targetType: "skill",
    requestKind: "skill-install",
    origin,
  };
  try {
    const hookResult = await hookRunner.runBeforeInstall(event, ctx);
    if (hookResult?.block) {
      return hookResult.blockReason || "Installation blocked by plugin hook";
    }
  } catch (err) {
    return `Installation blocked because before_install hook failed: ${formatErrorMessage(err)}`;
  }
  return undefined;
}

/**
 * 将已解压的技能根目录安装到工作区 skills 目录。
 *
 * 参考 openclaw/src/skills/lifecycle/archive-install.ts：
 * 校验根目录标识、解析（防穿越）目标目录、按模式与策略调用 before_install 钩子，
 * 最后通过 installPackageDir 复制文件并返回目标目录。
 */
export async function installExtractedSkillRoot(params: {
  workspaceDir: string;
  slug: string;
  extractedRoot: string;
  mode: "install" | "update";
  timeoutMs?: number;
  logger?: InstallExtractedLogger;
  policy?: SkillInstallPolicy;
  rootMarkers?: readonly string[];
}): Promise<InstallExtractedSkillRootResult> {
  try {
    if (
      !(await hasSkillArchiveRoot(
        params.extractedRoot,
        params.rootMarkers ?? DEFAULT_SKILL_ARCHIVE_ROOT_MARKERS,
      ))
    ) {
      return { ok: false, error: "archive is missing SKILL.md", failureKind: "invalid-request" };
    }

    let targetDir: string;
    try {
      targetDir = resolveWorkspaceSkillInstallDir(params.workspaceDir, params.slug);
    } catch (err) {
      return { ok: false, error: formatErrorMessage(err), failureKind: "invalid-request" };
    }

    const targetExists = await pathExists(targetDir);
    const effectiveMode = params.mode === "update" && targetExists ? "update" : "install";
    if (params.mode === "install" && targetExists) {
      return {
        ok: false,
        error: `Skill already exists at ${targetDir}. Re-run with force/update.`,
        failureKind: "skill-conflict",
      };
    }

    if (params.policy) {
      const blocked = await runSkillInstallPolicyHook({
        policy: params.policy,
        slug: params.slug,
        extractedRoot: params.extractedRoot,
        effectiveMode,
      });
      if (blocked) {
        return { ok: false, error: blocked, failureKind: "policy-denied" };
      }
    }

    const install = await installPackageDir({
      sourceDir: params.extractedRoot,
      targetDir,
      mode: effectiveMode,
      timeoutMs: params.timeoutMs ?? 120_000,
      logger: params.logger,
      copyErrorPrefix: "failed to install skill",
      hasDeps: false,
      depsLogMessage: "",
    });
    if (!install.ok) {
      return { ok: false, error: install.error, failureKind: "unknown" };
    }
    return { ok: true, targetDir };
  } catch (err) {
    return { ok: false, error: formatErrorMessage(err), failureKind: "unknown" };
  }
}
