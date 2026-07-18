/**
 * Git 仓库根发现 — 通过遍历祖先目录定位 .git
 *
 * 参考 openclaw/src/infra/git-root.ts
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_GIT_DISCOVERY_MAX_DEPTH = 12;

function walkUpFrom<T>(
  startDir: string,
  opts: { maxDepth?: number },
  resolveAtDir: (dir: string) => T | null | undefined,
): T | null {
  let current = path.resolve(startDir);
  const maxDepth = opts.maxDepth ?? DEFAULT_GIT_DISCOVERY_MAX_DEPTH;
  for (let i = 0; i < maxDepth; i += 1) {
    const resolved = resolveAtDir(current);
    if (resolved !== null && resolved !== undefined) {
      return resolved;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

function hasGitMarker(repoRoot: string): boolean {
  const gitPath = path.join(repoRoot, ".git");
  try {
    const stat = fs.statSync(gitPath);
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

/** 从 startDir 向上查找 git 仓库根目录 */
export function findGitRoot(startDir: string, opts: { maxDepth?: number } = {}): string | null {
  // .git 文件即使不是有效的 gitdir 指针也算仓库标记
  return walkUpFrom(startDir, opts, (repoRoot) => (hasGitMarker(repoRoot) ? repoRoot : null));
}

function resolveGitDirFromMarker(repoRoot: string): string | null {
  const gitPath = path.join(repoRoot, ".git");
  try {
    const stat = fs.statSync(gitPath);
    if (stat.isDirectory()) {
      return gitPath;
    }
    if (!stat.isFile()) {
      return null;
    }
    const raw = fs.readFileSync(gitPath, "utf-8");
    const match = raw.match(/gitdir:\s*(.+)/i);
    if (!match?.[1]) {
      return null;
    }
    return path.resolve(repoRoot, match[1].trim());
  } catch {
    return null;
  }
}

/** 解析 .git/HEAD 的绝对路径，支持 worktree 间接 gitdir */
export function resolveGitHeadPath(
  startDir: string,
  opts: { maxDepth?: number } = {},
): string | null {
  // 比 findGitRoot 更严格：继续向上查找直到找到可解析的 git dir
  return walkUpFrom(startDir, opts, (repoRoot) => {
    const gitDir = resolveGitDirFromMarker(repoRoot);
    return gitDir ? path.join(gitDir, "HEAD") : null;
  });
}
