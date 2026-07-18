// 运行基于包管理器的全局更新和安装流程。
// 移植自 openclaw/src/infra/update-global.ts（降级实现）。
//
// 降级说明：
//  - pathExists 内联实现（来自 ../utils.js，cross-wms 未移植）
//  - BUNDLED_RUNTIME_SIDECAR_PATHS 降级为空数组（来自 ../plugins/runtime-sidecar-paths.js）
//  - collectPackageDistInventory/readPackageDistInventoryIfPresent 降级为 stub
//  - 重型 IO 函数保留实现，使用内联 pathExists
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";
import {
  applyNpmFreshnessBypassEnv,
  applyPosixNpmScriptShellEnv,
  createNpmFreshnessBypassArgs,
} from "./npm-install-env.js";
import { readPackageVersion } from "./package-json.js";
import { applyPathPrepend } from "./path-prepend.js";
import { parseSemver } from "./runtime-guard.js";

// ============================================================================
// 类型定义
// ============================================================================

/** OpenClaw 全局安装和更新流支持的包管理器。 */
export type GlobalInstallManager = "npm" | "pnpm" | "bun";

/** 运行包管理器命令，带超时和环境控制。 */
export type CommandRunner = (
  argv: string[],
  options: { timeoutMs: number; cwd?: string; env?: NodeJS.ProcessEnv },
) => Promise<{
  stdout: string;
  stderr: string;
  code: number | null;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
  termination?: "exit" | "timeout" | "no-output-timeout" | "signal";
}>;

type ResolvedGlobalInstallCommand = {
  manager: GlobalInstallManager;
  command: string;
};

/**
 * 解析后的包管理器命令加上用于安装、验证和暂存包交换的根路径。
 */
export type ResolvedGlobalInstallTarget = ResolvedGlobalInstallCommand & {
  globalRoot: string | null;
  packageRoot: string | null;
  directNodeModulesRoot?: boolean;
};

/** npm prefix 布局路径，用于安装、暂存和暴露全局 bin。 */
export type NpmGlobalPrefixLayout = {
  prefix: string;
  globalRoot: string;
  binDir: string;
};

// ============================================================================
// 常量
// ============================================================================

const PRIMARY_PACKAGE_NAME = "openclaw";
const ALL_PACKAGE_NAMES = [PRIMARY_PACKAGE_NAME] as const;
const GLOBAL_RENAME_PREFIX = ".";
/** 用户请求安装移动 main 分支时使用的 npm 兼容 spec。 */
export const OPENCLAW_MAIN_PACKAGE_SPEC = "github:openclaw/openclaw#main";
const COREPACK_ENABLE_DOWNLOAD_PROMPT_DEFAULT = "0";
const NPM_GLOBAL_INSTALL_QUIET_FLAGS = ["--no-fund", "--no-audit", "--loglevel=error"] as const;
const PNPM_OPENCLAW_BUILD_ALLOWLIST_FLAG = `--allow-build=${PRIMARY_PACKAGE_NAME}`;
const FIRST_PACKAGED_DIST_INVENTORY_VERSION = { major: 2026, minor: 4, patch: 15 };
const OMITTED_PRIVATE_QA_BUNDLED_PLUGIN_ROOTS = new Set([
  "dist/extensions/qa-channel",
  "dist/extensions/qa-lab",
  "dist/extensions/qa-matrix",
]);

// ============================================================================
// 降级 stub：BUNDLED_RUNTIME_SIDECAR_PATHS（来自 ../plugins/runtime-sidecar-paths.js）
// ============================================================================

/** 降级：openclaw 从 ../plugins/runtime-sidecar-paths.js 导入；cross-wms 未移植，返回空数组。 */
const BUNDLED_RUNTIME_SIDECAR_PATHS: string[] = [];

// ============================================================================
// 内联辅助函数
// ============================================================================

/** 内联 pathExists（来自 openclaw ../utils.js） */
async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function tryRealpath(targetPath: string): Promise<string> {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function normalizePackageTarget(value: string): string {
  return value.trim();
}

function normalizePackageVersionForComparison(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/^[vV](?=\d)/, "");
}

function stripPrimaryPackageAlias(spec: string): string {
  const normalized = normalizePackageTarget(spec);
  const prefix = `${PRIMARY_PACKAGE_NAME}@`;
  return normalized.toLowerCase().startsWith(prefix)
    ? normalized.slice(prefix.length).trim()
    : normalized;
}

function isPnpmOpenClawSourceInstallSpec(spec: string): boolean {
  const target = stripPrimaryPackageAlias(spec);
  return (
    /^github:/i.test(target) ||
    /^git\+(?:ssh|https|http|file):/i.test(target) ||
    /^git:/i.test(target)
  );
}

// ============================================================================
// 降级 stub：package-dist-inventory 函数
// ============================================================================

const PACKAGE_DIST_INVENTORY_RELATIVE_PATH = "dist/package-dist-inventory.json";

/** 降级：openclaw 从 ./package-dist-inventory.js 导入；cross-wms 的版本 API 不同，返回 null。 */
async function readPackageDistInventoryIfPresent(_packageRoot: string): Promise<string[] | null> {
  return null;
}

/** 降级：返回空数组。 */
async function collectPackageDistInventory(_packageRoot: string): Promise<string[]> {
  return [];
}

// ============================================================================
// 纯函数（无外部 IO 依赖，可直接移植）
// ============================================================================

/** 当用户目标请求移动 main 分支包 spec 时返回 true。 */
export function isMainPackageTarget(value: string): boolean {
  return normalizeLowercaseStringOrEmpty(normalizePackageTarget(value)) === "main";
}

/**
 * 对应作为包管理器 spec 传递而非注册表 dist-tag 处理的目标返回 true。
 */
export function isExplicitPackageInstallSpec(value: string): boolean {
  const trimmed = normalizePackageTarget(value);
  if (!trimmed) {
    return false;
  }
  return (
    /\.(?:tgz|tar\.gz)$/iu.test(trimmed) ||
    trimmed.includes("://") ||
    trimmed.includes("#") ||
    /^(?:file|github|git\+ssh|git\+https|git\+http|git\+file|npm):/i.test(trimmed)
  );
}

/**
 * 从 `openclaw@1.2.3` 这样的包 spec 中提取固定安装版本。
 * 移动 tag、URL、git ref 和别名返回 null，因为它们安装后无法可靠比较。
 */
export function resolveExpectedInstalledVersionFromSpec(
  packageName: string,
  spec: string,
): string | null {
  const normalizedPackageName = packageName.trim();
  const normalizedSpec = normalizePackageTarget(spec);
  if (!normalizedPackageName || !normalizedSpec.startsWith(`${normalizedPackageName}@`)) {
    return null;
  }
  const rawVersion = normalizedSpec.slice(normalizedPackageName.length + 1).trim();
  if (
    !rawVersion ||
    rawVersion.includes("/") ||
    rawVersion.includes(":") ||
    rawVersion.includes("#") ||
    /^(latest|beta|next|main)$/i.test(rawVersion)
  ) {
    return null;
  }
  return normalizePackageVersionForComparison(rawVersion);
}

/** 当包目标可以通过注册表解析版本时返回 true。 */
export function canResolveRegistryVersionForPackageTarget(value: string): boolean {
  const trimmed = normalizePackageTarget(value);
  if (!trimmed) {
    return false;
  }
  if (isMainPackageTarget(trimmed) || isExplicitPackageInstallSpec(trimmed)) {
    return false;
  }
  return /^(?:latest|beta|next|dev)$/i.test(trimmed) || /^\d/.test(trimmed);
}

/**
 * 将用户 tag 或显式包目标转换为全局安装命令使用的包管理器 spec。
 */
export function resolveGlobalInstallSpec(params: {
  packageName: string;
  tag: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const override =
    params.env?.OPENCLAW_UPDATE_PACKAGE_SPEC?.trim() ||
    process.env.OPENCLAW_UPDATE_PACKAGE_SPEC?.trim();
  if (override) {
    return override;
  }
  const target = normalizePackageTarget(params.tag);
  if (isMainPackageTarget(target)) {
    return OPENCLAW_MAIN_PACKAGE_SPEC;
  }
  if (isExplicitPackageInstallSpec(target)) {
    return target;
  }
  return `${params.packageName}@${target}`;
}

// ============================================================================
// 包管理器命令解析（纯逻辑）
// ============================================================================

function resolveBunGlobalRoot(): string {
  const bunInstall = process.env.BUN_INSTALL?.trim() || path.join(os.homedir(), ".bun");
  return path.join(bunInstall, "install", "global", "node_modules");
}

function inferNpmPrefixFromPackageRoot(pkgRoot?: string | null): string | null {
  const trimmed = pkgRoot?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = path.resolve(trimmed);
  const nodeModulesDir = path.dirname(normalized);
  if (path.basename(nodeModulesDir) !== "node_modules") {
    return null;
  }
  const parentDir = path.dirname(nodeModulesDir);
  if (path.basename(parentDir) === "lib") {
    return path.dirname(parentDir);
  }
  if (
    process.platform === "win32" &&
    normalizeLowercaseStringOrEmpty(path.basename(parentDir)) === "npm"
  ) {
    return parentDir;
  }
  return null;
}

function resolvePreferredNpmCommand(pkgRoot?: string | null): string | null {
  if (!pkgRoot) {
    return null;
  }
  const nodeModulesDir = path.dirname(path.resolve(pkgRoot));
  const parentDir = path.dirname(nodeModulesDir);
  const binDir = path.join(parentDir, "bin");
  const npmPath = path.join(binDir, "npm");
  try {
    if (fsSync.statSync(npmPath).isFile()) {
      return npmPath;
    }
  } catch {
    // 忽略
  }
  return null;
}

function resolveNpmCommandBesidePackageRoot(pkgRoot?: string | null): string | null {
  return resolvePreferredNpmCommand(pkgRoot);
}

function resolvePreferredGlobalManagerCommand(
  manager: GlobalInstallManager,
  pkgRoot?: string | null,
): string {
  if (manager !== "npm") {
    return manager;
  }
  return resolvePreferredNpmCommand(pkgRoot) ?? manager;
}

/**
 * 解析全局安装执行的包管理器命令。
 * npm 可能在可用时使用现有包根旁边的 npm 二进制文件。
 */
export function resolveGlobalInstallCommand(
  manager: GlobalInstallManager,
  pkgRoot?: string | null,
): ResolvedGlobalInstallCommand {
  return {
    manager,
    command: resolvePreferredGlobalManagerCommand(manager, pkgRoot),
  };
}

function normalizeGlobalInstallCommand(
  managerOrCommand: GlobalInstallManager | ResolvedGlobalInstallCommand,
  pkgRoot?: string | null,
): ResolvedGlobalInstallCommand {
  return typeof managerOrCommand === "string"
    ? resolveGlobalInstallCommand(managerOrCommand, pkgRoot)
    : managerOrCommand;
}

function resolveInstallCommandForManager(
  managerOrCommand: GlobalInstallManager | ResolvedGlobalInstallCommand,
  manager: GlobalInstallManager,
  pkgRoot?: string | null,
): ResolvedGlobalInstallCommand {
  const normalized = normalizeGlobalInstallCommand(managerOrCommand, pkgRoot);
  return normalized.manager === manager
    ? normalized
    : resolveGlobalInstallCommand(manager, pkgRoot);
}

// ============================================================================
// npm prefix 布局解析（纯逻辑）
// ============================================================================

/**
 * 从 npm 全局根推断 npm prefix、包根和 bin 路径。
 * 仅当调用方选择时才接受直接 `node_modules` 根。
 */
export function resolveNpmGlobalPrefixLayoutFromGlobalRoot(
  globalRoot?: string | null,
  options: { allowDirectNodeModulesRoot?: boolean } = {},
): NpmGlobalPrefixLayout | null {
  const trimmed = globalRoot?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = path.resolve(trimmed);
  const nodeModulesBasename = path.basename(normalized);
  if (nodeModulesBasename !== "node_modules") {
    return null;
  }
  const layoutDir = path.dirname(normalized);
  const layoutBasename = path.basename(layoutDir);
  if (layoutBasename === "lib") {
    const prefix = path.dirname(layoutDir);
    return {
      prefix,
      globalRoot: normalized,
      binDir: path.join(prefix, "bin"),
    };
  }
  if (process.platform === "win32" && normalizeLowercaseStringOrEmpty(layoutBasename) === "npm") {
    return {
      prefix: layoutDir,
      globalRoot: normalized,
      binDir: layoutDir,
    };
  }
  if (options.allowDirectNodeModulesRoot) {
    return {
      prefix: layoutDir,
      globalRoot: normalized,
      binDir: path.join(layoutDir, "bin"),
    };
  }
  return null;
}

/** 从 npm prefix 解析布局。 */
export function resolveNpmGlobalPrefixLayoutFromPrefix(prefix: string): NpmGlobalPrefixLayout {
  const normalized = path.resolve(prefix.trim());
  if (process.platform === "win32") {
    return {
      prefix: normalized,
      globalRoot: path.join(normalized, "node_modules"),
      binDir: normalized,
    };
  }
  return {
    prefix: normalized,
    globalRoot: path.join(normalized, "lib", "node_modules"),
    binDir: path.join(normalized, "bin"),
  };
}

/** 从全局根解析 pnpm 全局目录。 */
export function resolvePnpmGlobalDirFromGlobalRoot(globalRoot?: string | null): string | null {
  const trimmed = globalRoot?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = path.resolve(trimmed);
  if (path.basename(normalized) !== "node_modules") {
    return null;
  }
  const layoutDir = path.dirname(normalized);
  return /^\d+$/u.test(path.basename(layoutDir)) ? path.dirname(layoutDir) : null;
}

// ============================================================================
// 全局根解析（使用 runCommand 抽象）
// ============================================================================

/**
 * 读取包管理器命令的全局 `node_modules` 根。
 * Bun 使用其确定性安装根，因为没有 `root -g` 命令。
 */
export async function resolveGlobalRoot(
  managerOrCommand: GlobalInstallManager | ResolvedGlobalInstallCommand,
  runCommand: CommandRunner,
  timeoutMs: number,
  pkgRoot?: string | null,
): Promise<string | null> {
  const resolved = normalizeGlobalInstallCommand(managerOrCommand, pkgRoot);
  if (resolved.manager === "bun") {
    return resolveBunGlobalRoot();
  }
  const argv = [resolved.command, "root", "-g"];
  const res = await runCommand(argv, { timeoutMs }).catch(() => null);
  if (!res || res.code !== 0) {
    return null;
  }
  const root = res.stdout.trim();
  return root || null;
}

// ============================================================================
// 降级的重型 IO 函数（依赖未移植模块或复杂 IO，降级为简化实现）
// ============================================================================

function inferGlobalRootFromPackageRoot(pkgRoot?: string | null): string | null {
  const trimmed = pkgRoot?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = path.resolve(trimmed);
  const nodeModulesDir = path.dirname(normalized);
  return path.basename(nodeModulesDir) === "node_modules" ? nodeModulesDir : null;
}

function inferPnpmGlobalRootFromPackageRoot(pkgRoot?: string | null): string | null {
  const trimmed = pkgRoot?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = path.resolve(trimmed);
  const nodeModulesDir = path.dirname(normalized);
  if (path.basename(nodeModulesDir) !== "node_modules") {
    return null;
  }
  const layoutDir = path.dirname(nodeModulesDir);
  return /^\d+$/u.test(path.basename(layoutDir)) ? nodeModulesDir : null;
}

function inferBunGlobalRootFromPackageRoot(pkgRoot?: string | null): string | null {
  const bunRoot = resolveBunGlobalRoot();
  const trimmed = pkgRoot?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = path.resolve(trimmed);
  return normalized.startsWith(bunRoot) ? bunRoot : null;
}

function isDirectNpmNodeModulesRoot(globalRoot?: string | null): boolean {
  if (!globalRoot) {
    return false;
  }
  const layout = resolveNpmGlobalPrefixLayoutFromGlobalRoot(globalRoot, {
    allowDirectNodeModulesRoot: true,
  });
  return layout !== null && layout.prefix === path.dirname(globalRoot);
}

async function isPnpmGlobalPackageRoot(pkgRoot?: string | null): Promise<boolean> {
  const globalRoot = inferPnpmGlobalRootFromPackageRoot(pkgRoot);
  if (!globalRoot) {
    return false;
  }
  const layoutDir = path.dirname(globalRoot);
  if (!(await pathExists(path.join(globalRoot, ".modules.yaml")))) {
    return false;
  }
  return (
    (await pathExists(path.join(layoutDir, "pnpm-lock.yaml"))) ||
    (await pathExists(path.join(layoutDir, "package.json")))
  );
}

/**
 * 解析有效的全局安装目标，请求时尊重现有包根，并在命令探测前检测 pnpm 或 bun 布局。
 */
export async function resolveGlobalInstallTarget(params: {
  manager: GlobalInstallManager | ResolvedGlobalInstallCommand;
  runCommand: CommandRunner;
  timeoutMs: number;
  pkgRoot?: string | null;
  honorPackageRoot?: boolean;
}): Promise<ResolvedGlobalInstallTarget> {
  const honoredPackageRootGlobalRoot = params.honorPackageRoot
    ? inferGlobalRootFromPackageRoot(params.pkgRoot)
    : null;
  const pnpmPackageRootGlobalRoot = (await isPnpmGlobalPackageRoot(params.pkgRoot))
    ? inferPnpmGlobalRootFromPackageRoot(params.pkgRoot)
    : null;
  const bunPackageRootGlobalRoot = inferBunGlobalRootFromPackageRoot(params.pkgRoot);
  const honoredDirectNpmRoot =
    pnpmPackageRootGlobalRoot === null &&
    bunPackageRootGlobalRoot === null &&
    isDirectNpmNodeModulesRoot(honoredPackageRootGlobalRoot);
  const command = bunPackageRootGlobalRoot
    ? resolveInstallCommandForManager(params.manager, "bun", params.pkgRoot)
    : pnpmPackageRootGlobalRoot
      ? resolveInstallCommandForManager(params.manager, "pnpm", params.pkgRoot)
      : honoredDirectNpmRoot
        ? resolveInstallCommandForManager(params.manager, "npm", params.pkgRoot)
        : normalizeGlobalInstallCommand(params.manager, params.pkgRoot);
  const globalRoot = await resolveGlobalRoot(
    command,
    params.runCommand,
    params.timeoutMs,
    params.pkgRoot,
  );
  const pkgRootGlobalRoot = command.manager === "pnpm" ? pnpmPackageRootGlobalRoot : null;
  const targetGlobalRoot =
    (command.manager === "bun" ? bunPackageRootGlobalRoot : null) ??
    pkgRootGlobalRoot ??
    (command.manager === "npm" ? honoredPackageRootGlobalRoot : null) ??
    globalRoot;
  return {
    ...command,
    globalRoot: targetGlobalRoot,
    packageRoot: targetGlobalRoot ? path.join(targetGlobalRoot, PRIMARY_PACKAGE_NAME) : null,
    ...(honoredPackageRootGlobalRoot &&
    targetGlobalRoot === honoredPackageRootGlobalRoot &&
    honoredDirectNpmRoot
      ? { directNodeModulesRoot: true }
      : {}),
  };
}

/**
 * 识别哪个全局包管理器拥有现有包根。
 * 先检查命令探测，然后是 pnpm/bun 布局指纹。
 */
export async function detectGlobalInstallManagerForRoot(
  runCommand: CommandRunner,
  pkgRoot: string,
  timeoutMs: number,
): Promise<GlobalInstallManager | null> {
  const pkgReal = await tryRealpath(pkgRoot);

  const candidates: Array<{
    manager: "npm" | "pnpm";
    argv: string[];
  }> = [
    { manager: "npm", argv: ["npm", "root", "-g"] },
    { manager: "pnpm", argv: ["pnpm", "root", "-g"] },
  ];

  for (const { manager, argv } of candidates) {
    const res = await runCommand(argv, { timeoutMs }).catch(() => null);
    if (!res || res.code !== 0) {
      continue;
    }
    const globalRoot = res.stdout.trim();
    if (!globalRoot) {
      continue;
    }
    const globalReal = await tryRealpath(globalRoot);
    for (const name of ALL_PACKAGE_NAMES) {
      const expected = path.join(globalReal, name);
      const expectedReal = await tryRealpath(expected);
      if (path.resolve(expectedReal) === path.resolve(pkgReal)) {
        return manager;
      }
    }
  }

  if (await isPnpmGlobalPackageRoot(pkgRoot)) {
    return "pnpm";
  }

  const bunGlobalRoot = resolveBunGlobalRoot();
  const bunGlobalReal = await tryRealpath(bunGlobalRoot);
  for (const name of ALL_PACKAGE_NAMES) {
    const bunExpected = path.join(bunGlobalReal, name);
    const bunExpectedReal = await tryRealpath(bunExpected);
    if (path.resolve(bunExpectedReal) === path.resolve(pkgReal)) {
      return "bun";
    }
  }

  if (resolveNpmCommandBesidePackageRoot(pkgRoot)) {
    return "npm";
  }

  return null;
}

/**
 * 当没有可信包根可用时，通过探测包管理器根检测已安装的全局 OpenClaw 包。
 */
export async function detectGlobalInstallManagerByPresence(
  runCommand: CommandRunner,
  timeoutMs: number,
): Promise<GlobalInstallManager | null> {
  for (const manager of ["npm", "pnpm"] as const) {
    const root = await resolveGlobalRoot(manager, runCommand, timeoutMs);
    if (!root) {
      continue;
    }
    for (const name of ALL_PACKAGE_NAMES) {
      if (await pathExists(path.join(root, name))) {
        return manager;
      }
    }
  }

  const bunRoot = resolveBunGlobalRoot();
  for (const name of ALL_PACKAGE_NAMES) {
    if (await pathExists(path.join(bunRoot, name))) {
      return "bun";
    }
  }
  return null;
}

// ============================================================================
// 全局安装命令构建（纯逻辑）
// ============================================================================

/**
 * 构建全局 OpenClaw 安装的主包管理器 argv。
 * npm 接收 quiet/freshness-bypass 标志；pnpm 源安装允许构建。
 */
export function globalInstallArgs(
  managerOrCommand: GlobalInstallManager | ResolvedGlobalInstallCommand,
  spec: string,
  pkgRoot?: string | null,
  installPrefix?: string | null,
): string[] {
  const resolved = normalizeGlobalInstallCommand(managerOrCommand, pkgRoot);
  if (resolved.manager === "pnpm") {
    return [
      resolved.command,
      "add",
      "-g",
      ...(installPrefix ? ["--global-dir", installPrefix] : []),
      ...(isPnpmOpenClawSourceInstallSpec(spec) ? [PNPM_OPENCLAW_BUILD_ALLOWLIST_FLAG] : []),
      spec,
    ];
  }
  if (resolved.manager === "bun") {
    return [resolved.command, "add", "-g", spec];
  }
  return [
    resolved.command,
    "i",
    "-g",
    ...(installPrefix ? ["--prefix", installPrefix] : []),
    spec,
    ...NPM_GLOBAL_INSTALL_QUIET_FLAGS,
    ...createNpmFreshnessBypassArgs(process.env, new Date(), {
      npmConfigPrefix: installPrefix,
    }),
  ];
}

/**
 * 构建 npm 不带可选依赖的重试 argv。
 * 非 npm 管理器没有等效回退，返回 null。
 */
export function globalInstallFallbackArgs(
  managerOrCommand: GlobalInstallManager | ResolvedGlobalInstallCommand,
  spec: string,
  pkgRoot?: string | null,
  installPrefix?: string | null,
): string[] | null {
  const resolved = normalizeGlobalInstallCommand(managerOrCommand, pkgRoot);
  if (resolved.manager !== "npm") {
    return null;
  }
  return [
    resolved.command,
    "i",
    "-g",
    ...(installPrefix ? ["--prefix", installPrefix] : []),
    spec,
    "--omit=optional",
    ...NPM_GLOBAL_INSTALL_QUIET_FLAGS,
    ...createNpmFreshnessBypassArgs(process.env, new Date(), {
      npmConfigPrefix: installPrefix,
    }),
  ];
}

// ============================================================================
// 安装环境构建（降级实现）
// ============================================================================

async function resolvePortableGitPathPrepend(): Promise<string[]> {
  // 降级：openclaw 在 Windows 上解析 PortableGit；cross-wms 返回空数组。
  return [];
}

function applyWindowsPackageInstallEnv(_env: Record<string, string>): void {
  // 降级：openclaw 在 Windows 上应用包安装环境；cross-wms 不做处理。
}

function applyCorepackDownloadPromptEnv(env: Record<string, string>): void {
  if (env.COREPACK_ENABLE_DOWNLOAD_PROMPT === undefined) {
    env.COREPACK_ENABLE_DOWNLOAD_PROMPT = COREPACK_ENABLE_DOWNLOAD_PROMPT_DEFAULT;
  }
}

/**
 * 构建全局安装使用的包管理器环境。
 * 保留调用方环境值，添加平台特定安装默认值，
 * 禁用会挂起无人值守更新的 npm/corepack 提示。
 */
export async function createGlobalInstallEnv(
  env?: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv | undefined> {
  const pathPrepend = await resolvePortableGitPathPrepend();
  const sourceEnv = env ?? process.env;
  const merged = Object.fromEntries(
    Object.entries(sourceEnv)
      .filter(([, value]) => value != null)
      .map(([key, value]) => [key, String(value)]),
  ) as Record<string, string>;
  applyPathPrepend(merged, pathPrepend);
  applyWindowsPackageInstallEnv(merged);
  applyCorepackDownloadPromptEnv(merged);
  applyNpmFreshnessBypassEnv(merged);
  applyPosixNpmScriptShellEnv(merged);
  return merged;
}

// ============================================================================
// 验证函数（降级实现）
// ============================================================================

function shouldRequirePackagedDistInventory(version: string | null | undefined): boolean {
  const parsed = parseSemver(version ?? null);
  if (!parsed) {
    return false;
  }
  if (parsed.major !== FIRST_PACKAGED_DIST_INVENTORY_VERSION.major) {
    return parsed.major > FIRST_PACKAGED_DIST_INVENTORY_VERSION.major;
  }
  if (parsed.minor !== FIRST_PACKAGED_DIST_INVENTORY_VERSION.minor) {
    return parsed.minor > FIRST_PACKAGED_DIST_INVENTORY_VERSION.minor;
  }
  return parsed.patch >= FIRST_PACKAGED_DIST_INVENTORY_VERSION.patch;
}

async function collectCriticalInstalledPackageDistPaths(packageRoot: string): Promise<string[]> {
  // 降级：使用 BUNDLED_RUNTIME_SIDECAR_PATHS（空数组）
  void packageRoot;
  return BUNDLED_RUNTIME_SIDECAR_PATHS.filter(
    (relativePath) => !OMITTED_PRIVATE_QA_BUNDLED_PLUGIN_ROOTS.has(relativePath),
  );
}

async function collectSourceCheckoutInstallErrors(packageRoot: string): Promise<string[]> {
  const realPackageRoot = await tryRealpath(packageRoot);
  const hasSourceCheckoutShape =
    ((await pathExists(path.join(realPackageRoot, ".git"))) ||
      (await pathExists(path.join(realPackageRoot, "pnpm-workspace.yaml")))) &&
    (await pathExists(path.join(realPackageRoot, "src"))) &&
    (await pathExists(path.join(realPackageRoot, "extensions")));
  return hasSourceCheckoutShape
    ? [`global package root resolves to source checkout: ${realPackageRoot}`]
    : [];
}

async function collectInstalledPathErrors(params: {
  packageRoot: string;
  expectedFiles: string[];
  actualFiles: string[];
  missingMessage: (relativePath: string) => string;
  unexpectedMessage?: (relativePath: string) => string;
}): Promise<string[]> {
  const errors: string[] = [];
  const actualSet = new Set(params.actualFiles);
  for (const expected of params.expectedFiles) {
    if (!actualSet.has(expected)) {
      if (await pathExists(path.join(params.packageRoot, expected))) {
        continue;
      }
      errors.push(params.missingMessage(expected));
    }
  }
  if (params.unexpectedMessage) {
    const expectedSet = new Set(params.expectedFiles);
    for (const actual of params.actualFiles) {
      if (!expectedSet.has(actual)) {
        errors.push(params.unexpectedMessage(actual));
      }
    }
  }
  return errors;
}

async function collectInstalledPackageDistErrors(params: {
  packageRoot: string;
  installedVersion: string | null;
  expectedVersion?: string | null;
}): Promise<string[]> {
  const criticalPaths = await collectCriticalInstalledPackageDistPaths(params.packageRoot);
  let inventoryFiles: string[] | null = null;
  let inventoryError: string | null = null;
  try {
    inventoryFiles = await readPackageDistInventoryIfPresent(params.packageRoot);
  } catch {
    inventoryError = `invalid package dist inventory ${PACKAGE_DIST_INVENTORY_RELATIVE_PATH}`;
  }

  if (inventoryFiles !== null) {
    const actualFiles = await collectPackageDistInventory(params.packageRoot);
    const inventoryErrors = await collectInstalledPathErrors({
      packageRoot: params.packageRoot,
      expectedFiles: inventoryFiles,
      actualFiles,
      missingMessage: (relativePath) => `missing packaged dist file ${relativePath}`,
      unexpectedMessage: (relativePath) => `unexpected packaged dist file ${relativePath}`,
    });
    const inventorySet = new Set(inventoryFiles);
    const supplementalCriticalPaths = criticalPaths.filter(
      (relativePath) => !inventorySet.has(relativePath),
    );
    if (supplementalCriticalPaths.length === 0) {
      return inventoryErrors;
    }
    return [
      ...inventoryErrors,
      ...(await collectInstalledPathErrors({
        packageRoot: params.packageRoot,
        expectedFiles: supplementalCriticalPaths,
        actualFiles,
        missingMessage: (relativePath) => `missing bundled runtime sidecar ${relativePath}`,
      })),
    ];
  }

  if (inventoryError) {
    if (shouldRequirePackagedDistInventory(params.installedVersion)) {
      return [inventoryError];
    }
    return [];
  }

  return [];
}

/**
 * 验证全局包根看起来像打包的 OpenClaw 安装，
 * 并在提供时匹配预期具体版本。
 */
export async function collectInstalledGlobalPackageErrors(params: {
  packageRoot: string;
  expectedVersion?: string | null;
}): Promise<string[]> {
  const errors: string[] = [];
  errors.push(...(await collectSourceCheckoutInstallErrors(params.packageRoot)));
  const installedVersion = await readPackageVersion(params.packageRoot);
  const expectedComparable = normalizePackageVersionForComparison(params.expectedVersion);
  const installedComparable = normalizePackageVersionForComparison(installedVersion);
  if (expectedComparable && installedComparable !== expectedComparable) {
    errors.push(
      `expected installed version ${expectedComparable}, found ${installedComparable ?? "<missing>"}`,
    );
  }
  errors.push(
    ...(await collectInstalledPackageDistErrors({
      packageRoot: params.packageRoot,
      installedVersion,
      expectedVersion: params.expectedVersion,
    })),
  );
  return errors;
}

// ============================================================================
// 清理函数
// ============================================================================

/** 移除中断重命名留下的隐藏全局包目录。 */
export async function cleanupGlobalRenameDirs(params: {
  globalRoot: string;
  packageName: string;
}): Promise<{ removed: string[] }> {
  const removed: string[] = [];
  const root = params.globalRoot.trim();
  const name = params.packageName.trim();
  if (!root || !name) {
    return { removed };
  }
  const prefix = `${GLOBAL_RENAME_PREFIX}${name}-`;
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return { removed };
  }
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) {
      continue;
    }
    const target = path.join(root, entry);
    try {
      const stat = await fs.lstat(target);
      if (!stat.isDirectory()) {
        continue;
      }
      await fs.rm(target, { recursive: true, force: true });
      removed.push(entry);
    } catch {
      // 忽略清理失败
    }
  }
  return { removed };
}
