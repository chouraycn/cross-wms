/**
 * 技能安装 - 归档解压
 *
 * 提供技能归档的解压、根目录查找等功能。
 * 支持 zip 格式（使用 jszip），其他格式可通过扩展添加。
 */

import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { logger } from "../../../logger.js";
import type { ExtractOptions } from "./install-types.js";

/** 技能归档根目录标识文件 */
export const CLAWHUB_SKILL_ARCHIVE_ROOT_MARKERS = ["SKILL.md", "skill.json"];

/**
 * 解压归档文件到目标目录
 *
 * 目前支持 .zip 格式。
 *
 * @param archivePath - 归档文件路径
 * @param destDir - 目标目录
 * @param options - 解压选项
 * @returns Promise<string[]> - 解压出的文件列表（相对路径）
 */
export async function extractArchive(
  archivePath: string,
  destDir: string,
  options: ExtractOptions = {},
): Promise<string[]> {
  const { stripComponents = 0, overwrite = true } = options;

  logger.debug("[Skills] Extracting archive:", archivePath, "->", destDir);

  const archiveStat = await fs.stat(archivePath);
  if (!archiveStat.isFile()) {
    throw new Error(`Archive path is not a file: ${archivePath}`);
  }

  const ext = path.extname(archivePath).toLowerCase();
  const isTarGz = archivePath.toLowerCase().endsWith(".tar.gz") ||
    archivePath.toLowerCase().endsWith(".tgz");

  await fs.mkdir(destDir, { recursive: true });

  let extractedFiles: string[];

  if (ext === ".zip") {
    extractedFiles = await extractZip(archivePath, destDir, stripComponents, overwrite);
  } else if (isTarGz || ext === ".tar") {
    extractedFiles = await extractTarArchive(archivePath, destDir, stripComponents, overwrite);
  } else {
    throw new Error(`Unsupported archive format: ${archivePath}`);
  }

  logger.debug(
    "[Skills] Extracted",
    extractedFiles.length,
    "files from",
    archivePath,
    "to",
    destDir,
  );

  return extractedFiles;
}

/**
 * 解压 ZIP 归档
 */
async function extractZip(
  archivePath: string,
  destDir: string,
  stripComponents: number,
  overwrite: boolean,
): Promise<string[]> {
  const data = await fs.readFile(archivePath);
  const zip = await JSZip.loadAsync(data);
  const extractedFiles: string[] = [];

  const relativePaths: Array<{ relativePath: string; zipPath: string; dir: boolean }> = [];

  zip.forEach((zipPath, file) => {
    const isDir = file.dir;
    const components = zipPath.split("/").filter(Boolean);

    let relativePath: string;
    if (stripComponents > 0 && components.length > stripComponents) {
      relativePath = components.slice(stripComponents).join("/");
      if (isDir && !zipPath.endsWith("/")) {
        relativePath += "/";
      }
    } else if (stripComponents > 0) {
      return;
    } else {
      relativePath = zipPath;
    }

    if (!relativePath || relativePath === "." || relativePath === "./") {
      return;
    }

    relativePaths.push({ relativePath, zipPath, dir: isDir });
  });

  for (const { relativePath, zipPath, dir } of relativePaths) {
    const targetPath = path.join(destDir, relativePath);

    if (dir) {
      await fs.mkdir(targetPath, { recursive: true });
      continue;
    }

    const file = zip.file(zipPath);
    if (!file) continue;

    const targetParent = path.dirname(targetPath);
    await fs.mkdir(targetParent, { recursive: true });

    if (!overwrite) {
      try {
        await fs.access(targetPath);
        continue;
      } catch {
        // File doesn't exist, proceed
      }
    }

    const content = await file.async("nodebuffer");
    await fs.writeFile(targetPath, content);
    extractedFiles.push(relativePath);
  }

  return extractedFiles;
}

/**
 * 解压 TAR/TAR.GZ 归档（使用系统 tar 命令）
 */
async function extractTarArchive(
  archivePath: string,
  destDir: string,
  stripComponents: number,
  _overwrite: boolean,
): Promise<string[]> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  const args: string[] = ["-xf", archivePath, "-C", destDir];
  if (stripComponents > 0) {
    args.push("--strip-components", String(stripComponents));
  }

  logger.debug("[Skills] Running tar with args:", args.join(" "));

  try {
    await execFileAsync("tar", args);
  } catch (err) {
    throw new Error(`tar extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const files = await listFilesRecursive(destDir);
  return files.map((f) => path.relative(destDir, f));
}

/**
 * 递归列出目录中的所有文件
 */
async function listFilesRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];
  const stack: string[] = [dir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * 在已解压的目录中查找技能根目录
 *
 * 技能根目录是包含 SKILL.md 或 skill.json 文件的目录。
 * 如果归档中存在嵌套目录结构，此函数可以找到真正的技能目录。
 *
 * @param extractedDir - 解压后的目录路径
 * @returns Promise<string | null> - 技能根目录路径，未找到则返回 null
 */
export async function findArchiveRootDir(extractedDir: string): Promise<string | null> {
  logger.debug("[Skills] Finding skill root dir in:", extractedDir);

  const rootDir = await findDirWithMarkers(extractedDir, CLAWHUB_SKILL_ARCHIVE_ROOT_MARKERS);

  if (rootDir) {
    logger.debug("[Skills] Found skill root dir:", rootDir);
  } else {
    logger.warn("[Skills] No skill root dir found with markers:", CLAWHUB_SKILL_ARCHIVE_ROOT_MARKERS.join(", "));
  }

  return rootDir;
}

/**
 * 递归查找包含指定标识文件的目录
 */
async function findDirWithMarkers(
  dir: string,
  markers: string[],
  depth: number = 0,
): Promise<string | null> {
  const MAX_DEPTH = 5;
  if (depth > MAX_DEPTH) return null;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const marker of markers) {
      const hasMarker = entries.some((e) => e.isFile() && e.name === marker);
      if (hasMarker) {
        return dir;
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = path.join(dir, entry.name);
        const found = await findDirWithMarkers(subDir, markers, depth + 1);
        if (found) return found;
      }
    }
  } catch (err) {
    logger.warn("[Skills] Error scanning directory:", dir, err);
  }

  return null;
}

/**
 * 解压归档并自动找到技能根目录，然后执行回调
 *
 * 此函数会：
 * 1. 解压归档到临时目录
 * 2. 查找技能根目录（包含 SKILL.md 或 skill.json 的目录）
 * 3. 调用回调函数，传入技能根目录路径
 * 4. 回调完成后清理临时目录
 *
 * @param archivePath - 归档文件路径
 * @param destDir - 目标目录（用于最终安装）
 * @param callback - 回调函数，接收技能根目录路径作为参数
 * @returns Promise<T> - 回调函数的返回值
 */
export async function withExtractedArchiveRoot<T>(
  archivePath: string,
  destDir: string,
  callback: (skillRootDir: string) => Promise<T>,
): Promise<T> {
  const tmpDir = path.join(destDir, ".tmp-extract-" + Date.now());

  try {
    logger.debug("[Skills] Extracting archive to temp dir:", tmpDir);
    await extractArchive(archivePath, tmpDir);

    const skillRootDir = await findArchiveRootDir(tmpDir);

    if (!skillRootDir) {
      logger.debug("[Skills] No skill root found, using top-level dir:", tmpDir);
      return await callback(tmpDir);
    }

    logger.debug("[Skills] Using skill root dir:", skillRootDir);
    return await callback(skillRootDir);
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
      logger.debug("[Skills] Cleaned up temp extract dir:", tmpDir);
    } catch (err) {
      logger.warn("[Skills] Failed to clean up temp extract dir:", tmpDir, err);
    }
  }
}

/**
 * 检查归档文件是否为有效的技能归档
 *
 * @param archivePath - 归档文件路径
 * @returns Promise<boolean>
 */
export async function isValidSkillArchive(archivePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(archivePath);
    if (!stat.isFile()) return false;

    const ext = path.extname(archivePath).toLowerCase();
    const isTarGz = archivePath.toLowerCase().endsWith(".tar.gz") ||
      archivePath.toLowerCase().endsWith(".tgz");

    if (ext !== ".zip" && ext !== ".tar" && !isTarGz) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
