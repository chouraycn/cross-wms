// Loads bundled plugin metadata without activating plugin runtime code.
//
// 移植自 openclaw/src/plugins/bundled-plugin-metadata.ts。
//
// 降级策略：
//  - 原文件依赖 @openclaw/normalization-core/string-normalization 的 uniqueStrings。
//    改用 cross-wms 的 ../infra/string-normalization.js，已提供同名导出。
//  - 原文件依赖 ../infra/json-files.js 的 tryReadJsonSync。改用 cross-wms 的
//    ../infra/_fs-safe-stubs.js 中同名导出，行为一致。
//  - 原文件依赖 ./bundled-channel-config-metadata.js 的 collectBundledChannelConfigs。
//    cross-wms 尚未移植该模块。这里降级为始终返回 undefined（不收集通道配置）。
//  - 原文件依赖 ./bundled-plugin-scan.js 的多个导出。cross-wms 已移植该模块，
//    直接引用。
//  - 原文件依赖 ./manifest.js 的 getPackageManifestMetadata、loadPluginManifest、
//    OpenClawPackageManifest、PackageManifest、PluginManifest。cross-wms 尚未
//    移植该模块。这里降级为：loadPluginManifest 始终返回 { ok: false }；
//    getPackageManifestMetadata 始终返回 undefined。
//  - 原文件依赖 ./sdk-alias.js 的 resolveLoaderPackageRoot。cross-wms 尚未移植
//    该模块。这里降级为始终返回 undefined（回退到 import.meta.url 的上级目录）。
//  - 原文件使用 import.meta.url 解析模块路径。这里改为使用 __filename，与
//    cross-wms CommonJS 编译目标兼容。
//  - 行为契约：当 cross-wms 未来移植 manifest 与 sdk-alias 时，可直接替换本地
//    降级实现。当前降级下 listBundledPluginMetadata 将返回空数组（因 manifest
//    加载始终失败）。

import fs from "node:fs";
import path from "node:path";
import { uniqueStrings } from "../infra/string-normalization.js";
import { tryReadJsonSync } from "../infra/_fs-safe-stubs.js";
import {
  collectBundledPluginPublicSurfaceArtifacts,
  collectBundledPluginRuntimeSidecarArtifacts,
  deriveBundledPluginIdHint,
  normalizeBundledPluginStringList,
  rewriteBundledPluginEntryToBuiltPath,
  resolveBundledPluginScanDir,
  trimBundledPluginString,
} from "./bundled-plugin-scan.js";

// ============================================================================
// 内联降级类型占位：./manifest.js
// ============================================================================

/**
 * 插件 manifest 的最小结构占位。
 *
 * 降级原因：cross-wms 的 manifest.js 尚未移植。仅保留 bundled-plugin-metadata
 * 实际访问的字段。
 */
type PluginManifest = {
  id: string;
  version?: string;
  name?: string;
  description?: string;
  channels?: readonly string[];
  channelConfigs?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * 包 manifest 的最小结构占位。
 *
 * 降级原因：cross-wms 的 manifest.js 尚未移植。仅保留 bundled-plugin-metadata
 * 实际访问的字段。
 */
type PackageManifest = {
  name?: string;
  version?: string;
  description?: string;
  [key: string]: unknown;
};

/**
 * OpenClaw 包 manifest 元数据的最小结构占位。
 *
 * 降级原因：cross-wms 的 manifest.js 尚未移植。仅保留 bundled-plugin-metadata
 * 实际访问的字段。
 */
type OpenClawPackageManifest = {
  extensions?: readonly string[];
  setupEntry?: string;
  channel?: {
    id?: string;
    label?: string;
    blurb?: string;
    preferOver?: readonly string[];
    commands?: readonly unknown[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type PluginManifestLoadResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false };

// ============================================================================
// 内联降级：./manifest.js —— loadPluginManifest / getPackageManifestMetadata
// ============================================================================

/**
 * 加载插件 manifest（降级占位）。
 *
 * 降级说明：cross-wms 的 manifest.js 尚未移植。openclaw 原版从 pluginDir 下
 * 读取 openclaw.plugin.json 并校验。这里降级为始终返回 { ok: false }，
 * 使 collectBundledPluginMetadata 跳过所有目录并返回空数组。
 */
function loadPluginManifest(_pluginDir: string, _strict: boolean): PluginManifestLoadResult {
  return { ok: false };
}

/**
 * 从 package.json 提取 OpenClaw 包元数据（降级占位）。
 *
 * 降级说明：cross-wms 的 manifest.js 尚未移植。openclaw 原版从 package.json
 * 读取 openclaw 字段并规范化。这里降级为始终返回 undefined。
 */
function getPackageManifestMetadata(_packageJson: PackageManifest | undefined): OpenClawPackageManifest | undefined {
  return undefined;
}

// ============================================================================
// 内联降级：./sdk-alias.js —— resolveLoaderPackageRoot
// ============================================================================

/**
 * 解析 loader 包根目录（降级占位）。
 *
 * 降级说明：cross-wms 的 sdk-alias.js 尚未移植。openclaw 原版根据 modulePath
 * 与 moduleUrl 解析 loader 包根目录。这里降级为始终返回 undefined（回退到
 * import.meta.url 的上级目录）。
 */
function resolveLoaderPackageRoot(_params: {
  modulePath: string;
  moduleUrl: string;
}): string | undefined {
  return undefined;
}

// ============================================================================
// 内联降级：./bundled-channel-config-metadata.js —— collectBundledChannelConfigs
// ============================================================================

/**
 * 收集 bundled 通道配置（降级占位）。
 *
 * 降级说明：cross-wms 的 bundled-channel-config-metadata.js 尚未移植。openclaw
 * 原版从 pluginDir 下的源文件加载通道配置 schema。这里降级为始终返回 undefined
 * （不收集通道配置），manifest 保留原 channelConfigs 字段。
 */
function collectBundledChannelConfigs(_params: {
  pluginDir: string;
  manifest: PluginManifest;
  packageManifest?: OpenClawPackageManifest;
}): Record<string, unknown> | undefined {
  return undefined;
}

// ============================================================================
// bundled-plugin-metadata 实现
// ============================================================================

const OPENCLAW_PACKAGE_ROOT =
  resolveLoaderPackageRoot({
    modulePath: __filename,
    moduleUrl: __filename,
  }) ?? path.resolve(__dirname, "..", "..");
const CURRENT_MODULE_PATH = __filename;
const RUNNING_FROM_BUILT_ARTIFACT =
  CURRENT_MODULE_PATH.includes(`${path.sep}dist${path.sep}`) ||
  CURRENT_MODULE_PATH.includes(`${path.sep}dist-runtime${path.sep}`);

type BundledPluginPathPair = {
  source: string;
  built: string;
};

/** Metadata collected from a bundled plugin package and manifest. */
export type BundledPluginMetadata = {
  dirName: string;
  idHint: string;
  source: BundledPluginPathPair;
  setupSource?: BundledPluginPathPair;
  publicSurfaceArtifacts?: readonly string[];
  runtimeSidecarArtifacts?: readonly string[];
  packageName?: string;
  packageVersion?: string;
  packageDescription?: string;
  packageManifest?: OpenClawPackageManifest;
  manifest: PluginManifest;
};

function readPackageManifest(pluginDir: string): PackageManifest | undefined {
  const packagePath = path.join(pluginDir, "package.json");
  return tryReadJsonSync<PackageManifest>(packagePath) ?? undefined;
}

function resolveBundledPluginMetadataScanDir(
  packageRoot: string,
  scanDir?: string,
): string | undefined {
  if (scanDir) {
    return path.resolve(scanDir);
  }
  return resolveBundledPluginScanDir({
    packageRoot,
    runningFromBuiltArtifact: RUNNING_FROM_BUILT_ARTIFACT,
  });
}

function resolveBundledPluginLookupParams(params: { rootDir: string; scanDir?: string }): {
  rootDir: string;
  scanDir?: string;
} {
  return params.scanDir ? params : { rootDir: params.rootDir };
}

function collectBundledPluginMetadata(
  resolvedScanDir: string | undefined,
  includeChannelConfigs: boolean,
  includeSyntheticChannelConfigs: boolean,
): readonly BundledPluginMetadata[] {
  if (!resolvedScanDir || !fs.existsSync(resolvedScanDir)) {
    return [];
  }

  const entries: BundledPluginMetadata[] = [];
  for (const dirName of fs
    .readdirSync(resolvedScanDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right))) {
    const pluginDir = path.join(resolvedScanDir, dirName);
    const manifestResult = loadPluginManifest(pluginDir, false);
    if (!manifestResult.ok) {
      continue;
    }

    const packageJson = readPackageManifest(pluginDir);
    const packageManifest = getPackageManifestMetadata(packageJson);
    const extensions = normalizeBundledPluginStringList(packageManifest?.extensions);
    if (extensions.length === 0) {
      continue;
    }
    const sourceEntry = trimBundledPluginString(extensions[0]);
    const builtEntry = rewriteBundledPluginEntryToBuiltPath(sourceEntry);
    if (!sourceEntry || !builtEntry) {
      continue;
    }

    const setupSourcePath = trimBundledPluginString(packageManifest?.setupEntry);
    const setupSource =
      setupSourcePath && rewriteBundledPluginEntryToBuiltPath(setupSourcePath)
        ? {
            source: setupSourcePath,
            built: rewriteBundledPluginEntryToBuiltPath(setupSourcePath)!,
          }
        : undefined;
    const publicSurfaceArtifacts = collectBundledPluginPublicSurfaceArtifacts({
      pluginDir,
      sourceEntry,
      ...(setupSourcePath ? { setupEntry: setupSourcePath } : {}),
    });
    const runtimeSidecarArtifacts =
      collectBundledPluginRuntimeSidecarArtifacts(publicSurfaceArtifacts);
    const channelConfigs =
      includeChannelConfigs && includeSyntheticChannelConfigs
        ? collectBundledChannelConfigs({
            pluginDir,
            manifest: manifestResult.manifest,
            packageManifest,
          })
        : manifestResult.manifest.channelConfigs;

    entries.push({
      dirName,
      idHint: deriveBundledPluginIdHint({
        entryPath: sourceEntry,
        manifestId: manifestResult.manifest.id,
        packageName: trimBundledPluginString(packageJson?.name),
        hasMultipleExtensions: extensions.length > 1,
      }),
      source: {
        source: sourceEntry,
        built: builtEntry,
      },
      ...(setupSource ? { setupSource } : {}),
      ...(publicSurfaceArtifacts ? { publicSurfaceArtifacts } : {}),
      ...(runtimeSidecarArtifacts ? { runtimeSidecarArtifacts } : {}),
      ...(trimBundledPluginString(packageJson?.name)
        ? { packageName: trimBundledPluginString(packageJson?.name) }
        : {}),
      ...(trimBundledPluginString(packageJson?.version)
        ? { packageVersion: trimBundledPluginString(packageJson?.version) }
        : {}),
      ...(trimBundledPluginString(packageJson?.description)
        ? { packageDescription: trimBundledPluginString(packageJson?.description) }
        : {}),
      ...(packageManifest ? { packageManifest } : {}),
      manifest: {
        ...manifestResult.manifest,
        ...(channelConfigs ? { channelConfigs } : {}),
      },
    });
  }

  return entries;
}

/** Lists bundled plugin metadata from source or built package layouts. */
export function listBundledPluginMetadata(params?: {
  rootDir?: string;
  scanDir?: string;
  includeChannelConfigs?: boolean;
  includeSyntheticChannelConfigs?: boolean;
}): readonly BundledPluginMetadata[] {
  const rootDir = path.resolve(params?.rootDir ?? OPENCLAW_PACKAGE_ROOT);
  const scanDir = params?.scanDir ? path.resolve(params.scanDir) : undefined;
  const resolvedScanDir = resolveBundledPluginMetadataScanDir(rootDir, scanDir);
  const includeChannelConfigs = params?.includeChannelConfigs ?? !RUNNING_FROM_BUILT_ARTIFACT;
  const includeSyntheticChannelConfigs =
    params?.includeSyntheticChannelConfigs ?? includeChannelConfigs;
  const metadata = Object.freeze(
    collectBundledPluginMetadata(
      resolvedScanDir,
      includeChannelConfigs,
      includeSyntheticChannelConfigs,
    ),
  );
  return metadata;
}

/** Finds bundled plugin metadata by manifest id. */
export function findBundledPluginMetadataById(
  pluginId: string,
  params?: {
    rootDir?: string;
    scanDir?: string;
    includeChannelConfigs?: boolean;
    includeSyntheticChannelConfigs?: boolean;
  },
): BundledPluginMetadata | undefined {
  return listBundledPluginMetadata(params).find((entry) => entry.manifest.id === pluginId);
}

/** Resolves the source directory for a bundled plugin in the current workspace. */
export function resolveBundledPluginWorkspaceSourcePath(params: {
  rootDir: string;
  scanDir?: string;
  pluginId: string;
}): string | null {
  const metadata = findBundledPluginMetadataById(params.pluginId, {
    ...resolveBundledPluginLookupParams({
      rootDir: params.rootDir,
      scanDir: params.scanDir,
    }),
    includeChannelConfigs: false,
    includeSyntheticChannelConfigs: false,
  });
  if (!metadata) {
    return null;
  }
  if (params.scanDir) {
    return path.resolve(params.scanDir, metadata.dirName);
  }
  return path.resolve(params.rootDir, "extensions", metadata.dirName);
}

function listBundledPluginEntryBaseDirs(params: {
  rootDir: string;
  pluginDirName?: string;
  scanDir?: string;
}): string[] {
  const scanPluginRoot = params.scanDir
    ? path.resolve(params.scanDir, params.pluginDirName ?? "")
    : undefined;
  const baseDirs = [
    ...(scanPluginRoot ? [path.resolve(scanPluginRoot, "dist")] : []),
    ...(scanPluginRoot ? [scanPluginRoot] : []),
    path.resolve(params.rootDir, "dist", "extensions", params.pluginDirName ?? ""),
    path.resolve(params.rootDir, "dist-runtime", "extensions", params.pluginDirName ?? ""),
    path.resolve(params.rootDir, "extensions", params.pluginDirName ?? "", "dist"),
    path.resolve(params.rootDir, "extensions", params.pluginDirName ?? ""),
  ];
  return uniqueStrings(baseDirs);
}

function isPathInsideRoot(rootDir: string, targetPath: string): boolean {
  const relative = path.relative(rootDir, targetPath);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function listBundledPluginEntryRoots(params: {
  rootDir: string;
  pluginDirName?: string;
  scanDir?: string;
}): string[] {
  const roots = [
    ...(params.scanDir ? [path.resolve(params.scanDir, params.pluginDirName ?? "")] : []),
    path.resolve(params.rootDir, "extensions", params.pluginDirName ?? ""),
    path.resolve(params.rootDir, "dist", "extensions", params.pluginDirName ?? ""),
    path.resolve(params.rootDir, "dist-runtime", "extensions", params.pluginDirName ?? ""),
  ];
  return uniqueStrings(roots);
}

function listBundledPluginEntrySearchPaths(
  entry: BundledPluginPathPair,
  params: {
    rootDir: string;
    pluginDirName?: string;
    scanDir?: string;
  },
): string[] {
  const paths: string[] = [];
  const roots = listBundledPluginEntryRoots(params);
  for (const rawEntry of [entry.built, entry.source]) {
    if (typeof rawEntry !== "string" || rawEntry.length === 0) {
      continue;
    }
    if (!path.isAbsolute(rawEntry)) {
      paths.push(rawEntry);
      continue;
    }
    const normalizedEntry = path.normalize(rawEntry);
    for (const root of roots) {
      if (!isPathInsideRoot(root, normalizedEntry)) {
        continue;
      }
      const relativeEntry = path.relative(root, normalizedEntry);
      const builtEntry = rewriteBundledPluginEntryToBuiltPath(relativeEntry);
      if (builtEntry) {
        paths.push(builtEntry);
      }
      paths.push(relativeEntry);
    }
  }
  return uniqueStrings(paths);
}

/** Resolves a generated runtime path for a bundled plugin entry. */
export function resolveBundledPluginGeneratedPath(
  rootDir: string,
  entry: BundledPluginPathPair | undefined,
  pluginDirName?: string,
  scanDir?: string,
): string | null {
  if (!entry) {
    return null;
  }
  const entryOrder = listBundledPluginEntrySearchPaths(entry, {
    rootDir,
    pluginDirName,
    ...(scanDir ? { scanDir } : {}),
  });
  const baseDirs = listBundledPluginEntryBaseDirs({
    rootDir,
    pluginDirName,
    ...(scanDir ? { scanDir } : {}),
  });
  for (const baseDir of baseDirs) {
    for (const entryPath of entryOrder) {
      const candidate = resolveBundledPluginEntryCandidate(baseDir, entryPath);
      if (!candidate) {
        continue;
      }
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function normalizeRelativePluginEntryPath(entryPath: string): string {
  return entryPath.replace(/^\.\//u, "");
}

function resolveBundledPluginEntryCandidate(baseDir: string, entryPath: string): string | null {
  const normalizedEntryPath = normalizeRelativePluginEntryPath(entryPath);
  const candidate = path.isAbsolute(normalizedEntryPath)
    ? path.normalize(normalizedEntryPath)
    : path.resolve(baseDir, normalizedEntryPath);
  const relative = path.relative(baseDir, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return candidate;
}

/** Resolves the repo entry path for a bundled plugin, preferring source unless requested. */
export function resolveBundledPluginRepoEntryPath(params: {
  rootDir: string;
  pluginId: string;
  preferBuilt?: boolean;
  scanDir?: string;
}): string | null {
  const metadata = findBundledPluginMetadataById(params.pluginId, {
    ...resolveBundledPluginLookupParams({
      rootDir: params.rootDir,
      scanDir: params.scanDir,
    }),
    includeChannelConfigs: false,
    includeSyntheticChannelConfigs: false,
  });
  if (!metadata) {
    return null;
  }

  const entryOrder = params.preferBuilt
    ? [metadata.source.built, metadata.source.source]
    : [metadata.source.source, metadata.source.built];
  const baseDirs = listBundledPluginEntryBaseDirs({
    rootDir: params.rootDir,
    pluginDirName: metadata.dirName,
    ...(params.scanDir ? { scanDir: params.scanDir } : {}),
  });

  for (const baseDir of baseDirs) {
    for (const entryPath of entryOrder) {
      const candidate = resolveBundledPluginEntryCandidate(baseDir, entryPath);
      if (!candidate) {
        continue;
      }
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}
