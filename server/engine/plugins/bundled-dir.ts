/** Resolves the bundled plugin directory for source checkouts, dist builds, and tests. */
//
// 移植自 openclaw/src/plugins/bundled-dir.ts。
//
// 降级策略：
//  - 原文件依赖 @openclaw/normalization-core/string-coerce 的
//    normalizeOptionalLowercaseString。改用 cross-wms 的 ../infra/string-coerce.js。
//  - 原文件依赖 @openclaw/normalization-core/string-normalization 的 uniqueStrings。
//    改用 cross-wms 的 ../infra/string-normalization.js。
//  - 原文件依赖 ../infra/openclaw-root.js 的 resolveOpenClawPackageRootSync。
//    cross-wms 尚未移植该模块。这里内联降级实现：始终返回 undefined（降级模式
//    下不检测包根目录，bundled 插件目录解析回退到 execPath/walk-up 逻辑）。
//  - 原文件依赖 ../infra/path-guards.js 的 isPathInside。改用 cross-wms 的
//    ../infra/path-safety.js（已提供同名导出）。
//  - 原文件依赖 ../utils.js 的 resolveUserPath。cross-wms 尚未移植该模块。
//    这里内联降级实现：解析路径相对于 HOME/USERPROFILE 或当前工作目录。
//  - 原文件使用 import.meta.url。根据降级策略，替换为 __filename。
//  - 行为与 openclaw 原版一致：解析 source checkout/dist build/test 场景下的
//    bundled 插件目录。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeOptionalLowercaseString } from "../infra/string-coerce.js";
import { uniqueStrings } from "../infra/string-normalization.js";
import { isPathInside } from "../infra/path-safety.js";

// ============================================================================
// 内联降级：../infra/openclaw-root.js —— resolveOpenClawPackageRootSync
// ============================================================================

/**
 * 解析 OpenClaw 包根目录。
 *
 * 降级说明：cross-wms 的 infra/openclaw-root.js 尚未移植。openclaw 原版
 * 基于 argv1/moduleUrl 解析包根目录。这里降级为始终返回 undefined，
// 使 resolveBundledPluginsDirUncached 回退到 execPath/walk-up 逻辑。
 */
function resolveOpenClawPackageRootSync(_params: {
  argv1?: string;
  moduleUrl?: string;
}): string | undefined {
  return undefined;
}

// ============================================================================
// 内联降级：../utils.js —— resolveUserPath
// ============================================================================

/**
 * 解析用户路径。
 *
 * 降级说明：cross-wms 的 utils.js 尚未移植。openclaw 原版解析 ~ 与
 * 环境变量。这里内联实现相同的逻辑：支持 ~ 开头与相对于 HOME 的路径。
 */
function resolveUserPath(rawPath: string, env: NodeJS.ProcessEnv = process.env): string {
  if (rawPath.startsWith("~")) {
    const home = env.HOME ?? env.USERPROFILE ?? os.homedir();
    return path.resolve(home, rawPath.slice(1));
  }
  return path.resolve(rawPath);
}

// ============================================================================
// bundled-dir 实现
// ============================================================================

const DISABLED_BUNDLED_PLUGINS_DIR = path.join(os.tmpdir(), "openclaw-empty-bundled-plugins");
const TEST_TRUST_BUNDLED_PLUGINS_DIR_ENV = "OPENCLAW_TEST_TRUST_BUNDLED_PLUGINS_DIR";
let bundledPluginsDirOverrideForTest: string | undefined;
const bundledPluginsDirCache = new Map<string, string | undefined>();

/** Diagnostic emitted when source-checkout bundled plugins lack dependency installs. */
export type SourceCheckoutDependencyDiagnostic = {
  source: string;
  message: string;
};

/** Returns true when env disables bundled plugin discovery. */
export function areBundledPluginsDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = normalizeOptionalLowercaseString(env.OPENCLAW_DISABLE_BUNDLED_PLUGINS);
  return raw === "1" || raw === "true";
}

function resolveDisabledBundledPluginsDir(): string {
  fs.mkdirSync(DISABLED_BUNDLED_PLUGINS_DIR, { recursive: true });
  return DISABLED_BUNDLED_PLUGINS_DIR;
}

function isSourceCheckoutRoot(packageRoot: string): boolean {
  return (
    fs.existsSync(path.join(packageRoot, "pnpm-workspace.yaml")) &&
    fs.existsSync(path.join(packageRoot, "src")) &&
    fs.existsSync(path.join(packageRoot, "extensions"))
  );
}

function isTruthyEnvValue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function shouldTrustTestBundledPluginsDirOverride(env: NodeJS.ProcessEnv): boolean {
  const isVitestProcess = Boolean(env.VITEST) || Boolean(process.env.VITEST);
  return (
    isVitestProcess &&
    (isTruthyEnvValue(env[TEST_TRUST_BUNDLED_PLUGINS_DIR_ENV]) ||
      isTruthyEnvValue(process.env[TEST_TRUST_BUNDLED_PLUGINS_DIR_ENV]))
  );
}

function hasUsableBundledPluginTree(pluginsDir: string): boolean {
  if (!fs.existsSync(pluginsDir)) {
    return false;
  }
  try {
    return fs.readdirSync(pluginsDir, { withFileTypes: true }).some((entry) => {
      if (!entry.isDirectory()) {
        return false;
      }
      const pluginDir = path.join(pluginsDir, entry.name);
      return (
        fs.existsSync(path.join(pluginDir, "package.json")) ||
        fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"))
      );
    });
  } catch {
    return false;
  }
}

function safeRealpathSync(targetPath: string): string | null {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return null;
  }
}

function pathContains(parentDir: string, childPath: string): boolean {
  return isPathInside(parentDir, childPath);
}

function trustedBundledPluginRootsForPackageRoot(packageRoot: string): string[] {
  const roots = [
    path.join(packageRoot, "dist", "extensions"),
    path.join(packageRoot, "dist-runtime", "extensions"),
  ];
  if (isSourceCheckoutRoot(packageRoot)) {
    roots.push(path.join(packageRoot, "extensions"));
  }
  return roots;
}

function resolvePackageRootsForBundledPlugins(): string[] {
  const argvRoot = resolveOpenClawPackageRootSync({ argv1: process.argv[1] });
  // 降级：__filename 替换 import.meta.url
  const moduleRoot = resolveOpenClawPackageRootSync({ moduleUrl: __filename });
  return uniqueStrings([argvRoot, moduleRoot].filter((entry): entry is string => Boolean(entry)));
}

export function resolveSourceCheckoutDependencyDiagnostic(
  env: NodeJS.ProcessEnv = process.env,
): SourceCheckoutDependencyDiagnostic | null {
  if (areBundledPluginsDisabled(env)) {
    return null;
  }
  for (const packageRoot of resolvePackageRootsForBundledPlugins()) {
    if (!isSourceCheckoutRoot(packageRoot)) {
      continue;
    }
    const extensionsDir = path.join(packageRoot, "extensions");
    if (!hasUsableBundledPluginTree(extensionsDir)) {
      continue;
    }
    if (fs.existsSync(path.join(packageRoot, "node_modules", ".pnpm"))) {
      continue;
    }
    return {
      source: packageRoot,
      message:
        "OpenClaw source checkout detected without pnpm workspace dependencies; run `pnpm install` from the repo root so bundled plugins can load package-local dependencies.",
    };
  }
  return null;
}

function resolveTrustedExistingOverride(resolvedOverride: string): string | null {
  const realOverride = safeRealpathSync(resolvedOverride);
  if (!realOverride) {
    return null;
  }

  // 降级：__filename 替换 import.meta.url
  const modulePackageRoot = resolveOpenClawPackageRootSync({ moduleUrl: __filename });
  const packageRoots = modulePackageRoot ? [modulePackageRoot] : [];
  const trustedRoots = packageRoots
    .flatMap((packageRoot) => trustedBundledPluginRootsForPackageRoot(packageRoot))
    .map((trustedRoot) => safeRealpathSync(trustedRoot))
    .filter((entry): entry is string => Boolean(entry));
  if (!trustedRoots.some((trustedRoot) => pathContains(trustedRoot, realOverride))) {
    return null;
  }
  if (!hasUsableBundledPluginTree(realOverride)) {
    return null;
  }
  return realOverride;
}

function overrideResolvesUnderPackageBundledRoot(params: {
  resolvedOverride: string;
  packageRoot: string;
}): boolean {
  const realOverride = safeRealpathSync(params.resolvedOverride);
  if (!realOverride) {
    return false;
  }
  return trustedBundledPluginRootsForPackageRoot(params.packageRoot)
    .map((trustedRoot) => safeRealpathSync(trustedRoot))
    .filter((entry): entry is string => Boolean(entry))
    .some((trustedRoot) => pathContains(trustedRoot, realOverride));
}

function resolveBundledDirFromPackageRoot(packageRoot: string): string | undefined {
  const sourceExtensionsDir = path.join(packageRoot, "extensions");
  const builtExtensionsDir = path.join(packageRoot, "dist", "extensions");
  const sourceCheckout = isSourceCheckoutRoot(packageRoot);
  const hasUsableSourceTree = sourceCheckout && hasUsableBundledPluginTree(sourceExtensionsDir);
  // In pnpm source checkouts, prefer the built bundled plugin runtime when it
  // exists so dist gateway runs avoid loading TS plugin entrypoints through jiti.
  // Keep the source tree as the fallback for fresh checkouts before build.
  const runtimeExtensionsDir = path.join(packageRoot, "dist-runtime", "extensions");
  const hasUsableRuntimeTree = sourceCheckout
    ? hasUsableBundledPluginTree(runtimeExtensionsDir)
    : fs.existsSync(runtimeExtensionsDir);
  const hasUsableBuiltTree = sourceCheckout
    ? hasUsableBundledPluginTree(builtExtensionsDir)
    : fs.existsSync(builtExtensionsDir);
  if (sourceCheckout && hasUsableBuiltTree) {
    return builtExtensionsDir;
  }
  if (sourceCheckout && hasUsableRuntimeTree) {
    return runtimeExtensionsDir;
  }
  if (hasUsableRuntimeTree && hasUsableBuiltTree) {
    return runtimeExtensionsDir;
  }
  if (hasUsableBuiltTree) {
    return builtExtensionsDir;
  }
  if (hasUsableSourceTree) {
    return sourceExtensionsDir;
  }
  return undefined;
}

function createBundledPluginsDirCacheKey(env: NodeJS.ProcessEnv): string {
  return JSON.stringify({
    disabled: env.OPENCLAW_DISABLE_BUNDLED_PLUGINS ?? "",
    override: env.OPENCLAW_BUNDLED_PLUGINS_DIR ?? "",
    trustOverride: env[TEST_TRUST_BUNDLED_PLUGINS_DIR_ENV] ?? "",
    processTrustOverride: process.env[TEST_TRUST_BUNDLED_PLUGINS_DIR_ENV] ?? "",
    vitest: env.VITEST ?? "",
    processVitest: process.env.VITEST ?? "",
    nodeEnv: process.env.NODE_ENV ?? "",
    argv1: process.argv[1] ?? "",
    execPath: process.execPath,
    openClawHome: env.OPENCLAW_HOME ?? "",
    home: env.HOME ?? "",
    userProfile: env.USERPROFILE ?? "",
    testOverride: bundledPluginsDirOverrideForTest ?? "",
  });
}

function resolveBundledPluginsDirUncached(env: NodeJS.ProcessEnv): string | undefined {
  if (areBundledPluginsDisabled(env)) {
    return resolveDisabledBundledPluginsDir();
  }

  if (bundledPluginsDirOverrideForTest) {
    return bundledPluginsDirOverrideForTest;
  }

  const override = env.OPENCLAW_BUNDLED_PLUGINS_DIR?.trim();
  let rejectedExistingOverride: string | null = null;
  if (override) {
    const resolvedOverride = resolveUserPath(override, env);
    if (fs.existsSync(resolvedOverride)) {
      if (shouldTrustTestBundledPluginsDirOverride(env)) {
        return path.resolve(resolvedOverride);
      }
      const trustedOverride = resolveTrustedExistingOverride(resolvedOverride);
      if (trustedOverride) {
        return trustedOverride;
      }
      rejectedExistingOverride = resolvedOverride;
    }
  }

  try {
    const argvRoot = resolveOpenClawPackageRootSync({ argv1: process.argv[1] });
    const rejectedOverrideUsesArgvRoot = Boolean(
      argvRoot &&
      rejectedExistingOverride &&
      overrideResolvesUnderPackageBundledRoot({
        resolvedOverride: rejectedExistingOverride,
        packageRoot: argvRoot,
      }),
    );
    const safeArgvRoot = rejectedOverrideUsesArgvRoot ? null : argvRoot;
    // 降级：__filename 替换 import.meta.url
    const moduleRoot = resolveOpenClawPackageRootSync({ moduleUrl: __filename });
    const packageRoots = uniqueStrings(
      [safeArgvRoot, moduleRoot].filter((entry): entry is string => Boolean(entry)),
    );
    for (const packageRoot of packageRoots) {
      const bundledDir = resolveBundledDirFromPackageRoot(packageRoot);
      if (bundledDir) {
        return bundledDir;
      }
    }
  } catch {
    // ignore
  }

  // bun --compile: ship a sibling bundled plugin tree next to the executable.
  try {
    const execDir = path.dirname(process.execPath);
    const siblingBuilt = path.join(execDir, "dist", "extensions");
    if (fs.existsSync(siblingBuilt)) {
      return siblingBuilt;
    }
    const sibling = path.join(execDir, "extensions");
    if (fs.existsSync(sibling)) {
      return sibling;
    }
  } catch {
    // ignore
  }

  // npm/dev: walk up from this module to find the bundled plugin tree at the package root.
  try {
    // 降级：__filename 替换 import.meta.url
    let cursor = path.dirname(__filename);
    for (let i = 0; i < 6; i += 1) {
      const candidate = path.join(cursor, "extensions");
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        break;
      }
      cursor = parent;
    }
  } catch {
    // ignore
  }

  return undefined;
}

export function resolveBundledPluginsDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const cacheKey = createBundledPluginsDirCacheKey(env);
  if (bundledPluginsDirCache.has(cacheKey)) {
    return bundledPluginsDirCache.get(cacheKey);
  }
  const resolved = resolveBundledPluginsDirUncached(env);
  bundledPluginsDirCache.set(cacheKey, resolved);
  return resolved;
}

export function setBundledPluginsDirOverrideForTest(dir: string | undefined): void {
  if (process.env.VITEST !== "true" && process.env.NODE_ENV !== "test") {
    throw new Error("setBundledPluginsDirOverrideForTest is only available in tests");
  }
  bundledPluginsDirOverrideForTest = dir;
  bundledPluginsDirCache.clear();
}
