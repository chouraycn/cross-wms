// Provides stricter filesystem helpers for canonical path and symlink-sensitive operations.
// 降级实现：从本地 _fs-safe-stubs.ts 重新导出，替代 @openclaw/fs-safe/advanced。
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import "./_fs-safe-stubs.js";

export {
  assertNoPathAliasEscape,
  basenameFromMediaSource,
  hasEncodedFileUrlSeparator,
  isWindowsNetworkPath,
  assertNoWindowsNetworkPath,
  safeFileURLToPath,
  trySafeFileURLToPath,
  writeSiblingTempFile,
  type WriteSiblingTempFileOptions,
  type WriteSiblingTempFileResult,
} from "./_fs-safe-stubs.js";

// ============================================================================
// 硬链接防护
// ============================================================================

/** 断言目标文件不是硬链接（nlink > 1） */
export function assertNoHardlinkedFinalPath(filePath: string): void {
  const stat = fsSync.lstatSync(filePath);
  if (stat.isFile() && stat.nlink > 1) {
    throw new Error(`Hardlinked file is not allowed: ${filePath}`);
  }
}

// ============================================================================
// 符号链接父目录防护
// ============================================================================

export type AssertNoSymlinkParentsOptions = {
  rootDir?: string;
  allowSymlinkInRoot?: boolean;
};

/** 检查路径的所有父目录中是否存在符号链接 */
export async function assertNoSymlinkParents(
  filePath: string,
  options?: AssertNoSymlinkParentsOptions,
): Promise<void> {
  const resolved = path.resolve(filePath);
  const rootDir = options?.rootDir ? path.resolve(options.rootDir) : null;

  let current = resolved;
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) break;

    try {
      const stat = await fs.lstat(parent);
      if (stat.isSymbolicLink()) {
        if (rootDir && parent === rootDir && options?.allowSymlinkInRoot) {
          // 允许根目录本身是符号链接
        } else {
          throw new Error(`Symlink parent is not allowed: ${parent}`);
        }
      }
      // 找到第一个存在的父目录，停止检查（更高层不会被本次操作触及）
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // 父目录不存在，继续向上检查
        current = parent;
        continue;
      }
      throw error;
    }
  }
}

/** 同步检查路径的所有父目录中是否存在符号链接 */
export function assertNoSymlinkParentsSync(
  filePath: string,
  options?: AssertNoSymlinkParentsOptions,
): void {
  const resolved = path.resolve(filePath);
  const rootDir = options?.rootDir ? path.resolve(options.rootDir) : null;

  let current = resolved;
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) break;

    try {
      const stat = fsSync.lstatSync(parent);
      if (stat.isSymbolicLink()) {
        if (rootDir && parent === rootDir && options?.allowSymlinkInRoot) {
          // 允许根目录本身是符号链接
        } else {
          throw new Error(`Symlink parent is not allowed: ${parent}`);
        }
      }
      // 找到第一个存在的父目录，停止检查
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // 父目录不存在，继续向上检查
        current = parent;
        continue;
      }
      throw error;
    }
  }
}

// ============================================================================
// 文件身份比较
// ============================================================================

export type FileIdentityStat = {
  dev: number;
  ino: number;
};

/** 比较两个文件是否是同一个底层文件（通过 dev 和 ino） */
export async function sameFileIdentity(left: string, right: string): Promise<boolean> {
  const leftStat = await fs.lstat(left).catch(() => null);
  const rightStat = await fs.lstat(right).catch(() => null);
  if (!leftStat || !rightStat) return false;
  return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
}

// ============================================================================
// 安全文件写入
// ============================================================================

/** 清理不受信任的文件名 */
export function sanitizeUntrustedFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

/** 通过兄弟临时文件路径安全写入（原子写入） */
export async function writeViaSiblingTempPath(options: {
  filePath: string;
  content: string | Buffer;
  mode?: number;
}): Promise<string> {
  const dir = path.dirname(options.filePath);
  const base = path.basename(options.filePath);
  const tempPath = path.join(
    dir,
    `.tmp-${base}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`,
  );

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempPath, options.content, { mode: options.mode ?? 0o600 });

  try {
    await fs.rename(tempPath, options.filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }

  return options.filePath;
}

/** 格式化 POSIX 文件模式 */
export function formatPosixMode(mode: number): string {
  return (mode & 0o777).toString(8);
}
