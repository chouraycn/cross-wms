// 移植自 openclaw/src/infra/executable-path.ts

import fs from "node:fs/promises";
import path from "node:path";

const IS_WIN = process.platform === "win32";
const EXECUTABLE_EXTENSIONS = IS_WIN ? [".exe", ".cmd", ".bat", ".ps1"] : [];

/** Resolves a single candidate path for an executable. */
export async function resolveExecutablePathCandidate(candidate: string): Promise<string | null> {
  const resolved = candidate?.trim();
  if (!resolved) return null;
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) return null;
    if (!IS_WIN && (stat.mode & 0o111) === 0) return null;
    return resolved;
  } catch {
    return null;
  }
}

/** Checks if a path points to an executable file. */
export async function isExecutableFile(filePath: string): Promise<boolean> {
  const resolved = filePath?.trim();
  if (!resolved) return false;
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) return false;
    if (IS_WIN) {
      const ext = path.extname(resolved).toLowerCase();
      return EXECUTABLE_EXTENSIONS.includes(ext) || !ext;
    }
    return (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** Resolves an executable from PATH environment variable entries. */
export async function resolveExecutableFromPathEnv(name: string, pathEnv?: string): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const paths = (pathEnv ?? process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    const candidate = path.join(dir, trimmed);
    const result = await resolveExecutablePathCandidate(candidate);
    if (result) return result;
  }
  return null;
}

/** Resolves an executable path, checking both absolute and PATH-relative. */
export async function resolveExecutablePath(name: string, options?: { pathEnv?: string; cwd?: string }): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  // Check if it's already an absolute or relative path
  if (trimmed.includes(path.sep) || (IS_WIN && trimmed.includes("/"))) {
    const resolved = path.resolve(options?.cwd ?? process.cwd(), trimmed);
    return resolveExecutablePathCandidate(resolved);
  }
  return resolveExecutableFromPathEnv(trimmed, options?.pathEnv);
}

/** Resolves an executable, falling back to the name if not found. */
export async function resolveExecutable(name: string, options?: { pathEnv?: string; cwd?: string }): Promise<string> {
  const resolved = await resolveExecutablePath(name, options);
  return resolved ?? name;
}
