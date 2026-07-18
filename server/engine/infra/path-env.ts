// 为 OpenClaw 子进程构建 PATH 值。
// 降级实现：从 openclaw/src/infra/path-env.ts 移植，
// - normalizeStringEntries/normalizeUniqueStringEntries 使用本地 string-normalization.ts 替代 @openclaw/normalization-core/string-normalization
// - resolveBrewPathDirs 本地实现（cross-wms 的 brew.ts 未导出此函数）
// - isTruthyEnvValue 使用本地 ./env.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizeStringEntries,
  normalizeUniqueStringEntries,
} from "./string-normalization.js";
import { isTruthyEnvValue } from "./env.js";

/**
 * 返回适合 PATH 增强的标准 Homebrew bin 目录。
 * 本地实现（openclaw 的 ./brew.js 导出此函数，cross-wms 的 brew.ts 未导出）。
 */
function resolveBrewPathDirs(opts?: { homeDir?: string }): string[] {
  const homeDir = opts?.homeDir ?? os.homedir();
  const dirs: string[] = [];
  // Linuxbrew 默认值
  dirs.push(path.join(homeDir, ".linuxbrew", "bin"));
  dirs.push(path.join(homeDir, ".linuxbrew", "sbin"));
  dirs.push("/home/linuxbrew/.linuxbrew/bin", "/home/linuxbrew/.linuxbrew/sbin");
  // macOS 默认值（一些 Linux 设置也使用）
  dirs.push("/opt/homebrew/bin", "/usr/local/bin");
  return dirs;
}

type EnsureOpenClawPathOpts = {
  /** 应保持首位的可执行文件目录，用于 shebang 兼容的子进程。 */
  execPath?: string;
  /** 仅当项目本地 bin 回退被显式启用时使用的工作目录。 */
  cwd?: string;
  /** 用于 package-manager 和 user-bin 回退候选的 home 目录。 */
  homeDir?: string;
  /** 用于测试和平台特定候选过滤的平台覆盖。 */
  platform?: NodeJS.Platform;
  /** 要合并的现有 PATH 值；默认为 process.env.PATH。 */
  pathEnv?: string;
  /** 选择加入在可信系统路径之后追加 cwd/node_modules/.bin。 */
  allowProjectLocalBin?: boolean;
};

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function splitPathParts(pathEnv: string): Set<string> {
  return new Set(normalizeStringEntries(pathEnv.split(path.delimiter)));
}

function isKnownPathDir(existingPathParts: ReadonlySet<string>, dirPath: string): boolean {
  return existingPathParts.has(dirPath) || isDirectory(dirPath);
}

function isLinuxbrewPath(dirPath: string): boolean {
  return dirPath.split(path.sep).includes(".linuxbrew");
}

function resolvePathBootstrapBrewDirs(params: {
  homeDir: string;
  platform: NodeJS.Platform;
  existingPathParts: ReadonlySet<string>;
}): string[] {
  const candidates = resolveBrewPathDirs({ homeDir: params.homeDir });
  if (params.platform !== "darwin") {
    return candidates;
  }
  return candidates.filter(
    (candidate) => !isLinuxbrewPath(candidate) || params.existingPathParts.has(candidate),
  );
}

function mergePath(params: { existing: string; prepend?: string[]; append?: string[] }): string {
  return normalizeUniqueStringEntries([
    ...(params.prepend ?? []),
    ...params.existing.split(path.delimiter),
    ...(params.append ?? []),
  ]).join(path.delimiter);
}

function candidateBinDirs(
  opts: EnsureOpenClawPathOpts,
  existingPathParts: ReadonlySet<string>,
): { prepend: string[]; append: string[] } {
  const execPath = opts.execPath ?? process.execPath;
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os.homedir();
  const platform = opts.platform ?? process.platform;

  const prepend: string[] = [];
  const append: string[] = [];

  // 保持活动运行时目录在 PATH 加固之前，以便基于 shebang 的
  // 子进程继续使用当前 OpenClaw 进程所在的同一 Node/Bun。
  try {
    const execDir = path.dirname(execPath);
    if (isExecutable(execPath)) {
      prepend.push(execDir);
    }
  } catch {
    // 忽略
  }

  // 捆绑的 macOS 应用：`openclaw` 位于可执行文件旁边（process.execPath）。
  try {
    const execDir = path.dirname(execPath);
    const siblingCli = path.join(execDir, "openclaw");
    if (isExecutable(siblingCli)) {
      prepend.push(execDir);
    }
  } catch {
    // 忽略
  }

  // 项目本地安装是常见的基于 repo 的攻击向量（bin 劫持）。
  // 默认禁用；如果 operator 显式启用，仅追加（永不前置）。
  const allowProjectLocalBin =
    opts.allowProjectLocalBin === true ||
    isTruthyEnvValue(process.env.OPENCLAW_ALLOW_PROJECT_LOCAL_BIN);
  if (allowProjectLocalBin) {
    const localBinDir = path.join(cwd, "node_modules", ".bin");
    if (isExecutable(path.join(localBinDir, "openclaw"))) {
      append.push(localBinDir);
    }
  }

  // 仅不可变 OS 目录进入 prepend，因此它们优先于
  // 用户可写位置，防止系统二进制文件的 PATH 劫持。
  prepend.push("/usr/bin", "/bin");

  // 用户可写 / package-manager 目录被追加，因此它们永远不会
  // 遮蔽可信 OS 二进制文件。
  // 这包括 Brew/Homebrew 目录，在 launchd/最小环境中查找 `openclaw` 很有用，
  // 但不得被视为可信。
  append.push(...resolvePathBootstrapBrewDirs({ homeDir, platform, existingPathParts }));
  const miseDataDir = process.env.MISE_DATA_DIR ?? path.join(homeDir, ".local", "share", "mise");
  const miseShims = path.join(miseDataDir, "shims");
  if (isKnownPathDir(existingPathParts, miseShims)) {
    append.push(miseShims);
  }
  if (platform === "darwin") {
    append.push(path.join(homeDir, "Library", "pnpm"));
  }
  if (process.env.XDG_BIN_HOME) {
    append.push(process.env.XDG_BIN_HOME);
  }
  append.push(path.join(homeDir, ".local", "bin"));
  append.push(path.join(homeDir, ".local", "share", "pnpm"));
  append.push(path.join(homeDir, ".bun", "bin"));
  append.push(path.join(homeDir, ".yarn", "bin"));

  return {
    prepend: prepend.filter((candidate) => isKnownPathDir(existingPathParts, candidate)),
    append: append.filter((candidate) => isKnownPathDir(existingPathParts, candidate)),
  };
}

/**
 * 尽力 PATH 引导，以便需要 `openclaw` CLI 的技能可以在
 * launchd/最小环境（以及 macOS 应用 bundle 内）运行。
 */
export function ensureOpenClawCliOnPath(opts: EnsureOpenClawPathOpts = {}) {
  if (isTruthyEnvValue(process.env.OPENCLAW_PATH_BOOTSTRAPPED)) {
    return;
  }
  // 在文件系统探测之前标记，以便来自嵌套引导的重复调用不会
  // 持续重排 PATH。
  process.env.OPENCLAW_PATH_BOOTSTRAPPED = "1";

  const existing = opts.pathEnv ?? process.env.PATH ?? "";
  const existingPathParts = splitPathParts(existing);
  const { prepend, append } = candidateBinDirs(opts, existingPathParts);
  if (prepend.length === 0 && append.length === 0) {
    return;
  }

  const merged = mergePath({ existing, prepend, append });
  if (merged) {
    process.env.PATH = merged;
  }
}
