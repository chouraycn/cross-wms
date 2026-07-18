// 从平台管理目录解析受信任的系统二进制文件。
import fs from "node:fs";
import path from "node:path";
import { getWindowsInstallRoots, getWindowsProgramFilesRoots } from "./windows-install-roots.js";

/**
 * 系统二进制解析的信任级别。
 * - "strict"：仅固定 OS 管理目录。用于 openssl 等安全关键二进制，
 *   被攻破的二进制影响较大。
 * - "standard"：strict 目录加上常见本地管理员/包管理器目录，
 *   追加在系统目录之后。用于 ffmpeg 等工具二进制，
 *   OS 自身很少提供。
 */
type SystemBinTrust = "strict" | "standard";

// OS 管理或系统安装二进制所在的 Unix 目录。
// 排除用户可写或包管理器管理目录，防止攻击者植入的二进制覆盖合法系统可执行文件。
const UNIX_BASE_TRUSTED_DIRS = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"] as const;

// macOS 上 "standard" 信任追加的包管理器目录。
// 这些目录位于 strict 目录之后，确保 OS 二进制始终优先。
// 对 ffmpeg 等工具二进制可接受，但对 openssl 等安全关键二进制不可接受——
// 需要更高保证的调用方应坚持使用 "strict"。
const DARWIN_STANDARD_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"] as const;
const LINUX_STANDARD_DIRS = ["/usr/local/bin"] as const;

// Windows 上搜索可执行文件时探测的扩展名。
const WIN_PATHEXT = [".exe", ".cmd", ".bat", ".com"] as const;
const WINDOWS_PROGRAM_FILES_TOOL_DIR_PREFIXES = ["ImageMagick-", "GraphicsMagick-"] as const;
const WINDOWS_PROGRAM_FILES_TOOL_DIRS = ["ImageMagick", "GraphicsMagick"] as const;

const resolvedCacheStrict = new Map<string, string>();
const resolvedCacheStandard = new Map<string, string>();

function defaultIsExecutable(filePath: string): boolean {
  try {
    if (process.platform === "win32") {
      fs.accessSync(filePath, fs.constants.R_OK);
    } else {
      fs.accessSync(filePath, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

function collectWindowsProgramFilesToolDirs(programFilesRoot: string): string[] {
  const dirs = WINDOWS_PROGRAM_FILES_TOOL_DIRS.map((dir) => path.win32.join(programFilesRoot, dir));
  try {
    for (const entry of fs.readdirSync(programFilesRoot, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        WINDOWS_PROGRAM_FILES_TOOL_DIR_PREFIXES.some((prefix) => entry.name.startsWith(prefix))
      ) {
        dirs.push(path.win32.join(programFilesRoot, entry.name));
      }
    }
  } catch {
    // 受限上下文下 Program Files 可能不可读；静态候选仍覆盖常见安装。
  }
  return dirs;
}

let isExecutableFn: (filePath: string) => boolean = defaultIsExecutable;

/**
 * 构建 Windows 受信任目录列表。仅包含系统管理目录；
 * 排除 %LOCALAPPDATA% 等用户配置文件路径。
 */
function buildWindowsTrustedDirs(): readonly string[] {
  const dirs: string[] = [];
  const { systemRoot } = getWindowsInstallRoots();
  dirs.push(path.win32.join(systemRoot, "System32"));
  dirs.push(path.win32.join(systemRoot, "SysWOW64"));
  dirs.push(path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0"));

  for (const programFilesRoot of getWindowsProgramFilesRoots()) {
    // 信任机器已校验的 Program Files 根目录，而非假设 C:。
    dirs.push(path.win32.join(programFilesRoot, "OpenSSL-Win64", "bin"));
    dirs.push(path.win32.join(programFilesRoot, "OpenSSL", "bin"));
    dirs.push(path.win32.join(programFilesRoot, "ffmpeg", "bin"));
  }

  return dirs;
}

function buildWindowsStandardDirs(): readonly string[] {
  const { systemRoot } = getWindowsInstallRoots();
  const systemDriveRoot = path.win32.parse(systemRoot).root;
  const dirs = [path.win32.join(systemDriveRoot, "ProgramData", "chocolatey", "bin")];
  for (const programFilesRoot of getWindowsProgramFilesRoots()) {
    dirs.push(...collectWindowsProgramFilesToolDirs(programFilesRoot));
  }
  return dirs;
}

/**
 * 构建 Unix（macOS、Linux 等）的受信任目录列表，
 * 在 UNIX_BASE_TRUSTED_DIRS 之上扩展平台/环境特定路径。
 *
 * Strict：仅固定 OS 管理目录。
 *
 * Standard：strict 目录加上平台包管理器目录（追加在后），
 * 确保 OS 二进制始终优先。
 */
function buildUnixTrustedDirs(trust: SystemBinTrust): readonly string[] {
  const dirs: string[] = [...UNIX_BASE_TRUSTED_DIRS];
  const platform = process.platform;

  if (platform === "linux") {
    // 固定的 NixOS 系统 profile 路径。绝不从 NIX_PROFILES 派生信任：
    // env 控制的 Nix store/profile 条目可被攻击者选择。
    // 依赖非默认 Nix 路径的调用方必须通过 extraDirs 显式启用。
    dirs.push("/run/current-system/sw/bin");
    dirs.push("/snap/bin");
  }

  // "standard" 信任在常见本地管理员/包管理器目录中扩展非安全关键工具搜索，
  // 同时保持 strict 目录优先，确保 OS 二进制始终优先。
  if (trust === "standard") {
    if (platform === "darwin") {
      dirs.push(...DARWIN_STANDARD_DIRS);
    } else if (platform === "linux") {
      dirs.push(...LINUX_STANDARD_DIRS);
    }
  }

  return dirs;
}

let trustedDirsStrict: readonly string[] | null = null;
let trustedDirsStandard: readonly string[] | null = null;

function getTrustedDirs(trust: SystemBinTrust): readonly string[] {
  if (process.platform === "win32") {
    trustedDirsStrict ??= buildWindowsTrustedDirs();
    if (trust === "standard") {
      trustedDirsStandard ??= [...trustedDirsStrict, ...buildWindowsStandardDirs()];
      return trustedDirsStandard;
    }
    return trustedDirsStrict;
  }
  if (trust === "standard") {
    trustedDirsStandard ??= buildUnixTrustedDirs("standard");
    return trustedDirsStandard;
  }
  trustedDirsStrict ??= buildUnixTrustedDirs("strict");
  return trustedDirsStrict;
}

/**
 * 通过仅搜索受信任系统目录将二进制名解析为绝对路径。
 * 未找到时返回 null。结果在进程生命周期内缓存。
 *
 * 在 execFile/spawn 调用中必须使用此函数（而非裸二进制名）
 * 处理内部基础设施二进制（ffmpeg、ffprobe、openssl 等），
 * 防止通过用户可写目录的 PATH 劫持攻击。
 */
export function resolveSystemBin(
  name: string,
  opts?: { trust?: SystemBinTrust; extraDirs?: readonly string[] },
): string | null {
  const trust = opts?.trust ?? "strict";
  const hasExtra = (opts?.extraDirs?.length ?? 0) > 0;
  const cache = trust === "standard" ? resolvedCacheStandard : resolvedCacheStrict;

  if (!hasExtra) {
    const cached = cache.get(name);
    if (cached !== undefined) {
      return cached;
    }
  }

  const dirs = [...getTrustedDirs(trust), ...(opts?.extraDirs ?? [])];
  const isWin = process.platform === "win32";
  const hasExt = isWin && path.win32.extname(name).length > 0;

  for (const dir of dirs) {
    if (isWin && !hasExt) {
      for (const ext of WIN_PATHEXT) {
        const candidate = path.win32.join(dir, name + ext);
        if (isExecutableFn(candidate)) {
          if (!hasExtra) {
            cache.set(name, candidate);
          }
          return candidate;
        }
      }
    } else {
      const candidate = path.join(dir, name);
      if (isExecutableFn(candidate)) {
        if (!hasExtra) {
          cache.set(name, candidate);
        }
        return candidate;
      }
    }
  }

  return null;
}

/** 仅供测试：计算出的受信任目录 */
export function getTrustedDirsForTest(trust: SystemBinTrust = "strict"): readonly string[] {
  return getTrustedDirs(trust);
}

/** 重置缓存并可选地覆盖可执行文件检查函数（用于测试） */
export function resetResolveSystemBin(overrideIsExecutable?: (p: string) => boolean): void {
  resolvedCacheStrict.clear();
  resolvedCacheStandard.clear();
  trustedDirsStrict = null;
  trustedDirsStandard = null;
  isExecutableFn = overrideIsExecutable ?? defaultIsExecutable;
}
