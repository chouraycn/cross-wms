// 暴露根范围路径解析辅助，带 fs-safe 默认值。
// 降级实现：从 openclaw/src/infra/root-paths.ts 移植，
// 由于 @openclaw/fs-safe/advanced 的根路径解析 API 未移植，提供本地降级 stub。
// 大多数 API 抛出明确错误；基础路径检查使用本地 fs 实现。
import "./fs-safe-defaults.js";
import fs from "node:fs";
import path from "node:path";

/**
 * 确保目录在根范围内存在（降级 stub）。
 * openclaw 的 @openclaw/fs-safe/advanced 导出此函数，cross-wms 未移植高级路径解析。
 */
export async function ensureDirectoryWithinRoot(rootDir: string, relativePath: string): Promise<string> {
  const resolved = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escape detected: ${relativePath} resolves outside ${rootDir}`);
  }
  await fs.promises.mkdir(resolved, { recursive: true });
  return resolved;
}

/**
 * 解析根范围内的现有路径（降级 stub）。
 */
export function resolveExistingPathsWithinRoot(rootDir: string, relativePath: string): string {
  const resolved = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escape detected: ${relativePath} resolves outside ${rootDir}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }
  return resolved;
}

/**
 * 解析根范围内的路径（降级 stub）。
 */
export function resolvePathsWithinRoot(rootDir: string, relativePath: string): string {
  const resolved = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escape detected: ${relativePath} resolves outside ${rootDir}`);
  }
  return resolved;
}

/**
 * 解析根范围内的单个路径（降级 stub）。
 */
export function resolvePathWithinRoot(rootDir: string, relativePath: string): string {
  return resolvePathsWithinRoot(rootDir, relativePath);
}

/**
 * 严格解析根范围内的现有路径（降级 stub）。
 */
export function resolveStrictExistingPathsWithinRoot(rootDir: string, relativePath: string): string {
  return resolveExistingPathsWithinRoot(rootDir, relativePath);
}

/**
 * 解析根范围内的可写路径（降级 stub）。
 */
export function resolveWritablePathWithinRoot(rootDir: string, relativePath: string): string {
  return resolvePathsWithinRoot(rootDir, relativePath);
}

/**
 * 路径范围对象（降级 stub）。
 * openclaw 的 @openclaw/fs-safe/advanced 导出 pathScope 用于创建路径范围上下文。
 */
export type PathScope = {
  rootDir: string;
  resolve(relativePath: string): string;
  ensureDir(relativePath: string): Promise<string>;
};

export function pathScope(rootDir: string): PathScope {
  return {
    rootDir,
    resolve: (relativePath) => resolvePathWithinRoot(rootDir, relativePath),
    ensureDir: (relativePath) => ensureDirectoryWithinRoot(rootDir, relativePath),
  };
}
