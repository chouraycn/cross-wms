/** Loads bundled channel plugin runtime entries and setup metadata. */
//
// 移植自 openclaw/src/plugins/bundled-channel-runtime.ts。
//
// 降级策略：
//  - 原文件依赖 ./bundled-plugin-metadata.js 的 resolveBundledPluginGeneratedPath。
//    cross-wms 已在本批移植中创建该模块，直接引用。
//  - 原文件依赖 ./manifest-registry.js 的 PluginManifestRecord。cross-wms 尚未
//    移植该模块。这里定义本地最小结构占位（仅保留 bundled-channel-runtime
//    实际访问的字段）。
//  - 原文件依赖 ./manifest.js 的 OpenClawPackageManifest。cross-wms 尚未移植
//    该模块。这里定义本地最小结构占位（与 bundled-plugin-metadata.ts 中占位一致）。
//  - 原文件依赖 ./plugin-registry.js 的 loadPluginManifestRegistryForPluginRegistry。
//    cross-wms 尚未移植该模块。这里降级为始终返回空 registry（{ plugins: [] }），
//    使 listBundledChannelPluginMetadata 返回空数组。
//  - 行为契约：当 cross-wms 未来移植 plugin-registry 与 manifest-registry 时，
//    可直接替换本地降级实现。

import fs from "node:fs";
import path from "node:path";
import { resolveBundledPluginGeneratedPath } from "./bundled-plugin-metadata.js";

// ============================================================================
// 内联降级类型占位
// ============================================================================

/**
 * 插件 manifest 记录的最小结构占位。
 *
 * 降级原因：cross-wms 的 manifest-registry.js 尚未移植。仅保留
 * bundled-channel-runtime 实际访问的字段
 * (id/origin/source/setupSource/channels/rootDir/packageManifest)。
 */
type PluginManifestRecord = {
  id: string;
  origin?: string;
  source?: string;
  setupSource?: string;
  channels?: readonly string[];
  rootDir: string;
  packageManifest?: OpenClawPackageManifest;
};

/**
 * OpenClaw 包 manifest 元数据的最小结构占位。
 *
 * 降级原因：cross-wms 的 manifest.js 尚未移植。与 bundled-plugin-metadata.ts
 * 中占位一致。
 */
type OpenClawPackageManifest = {
  extensions?: readonly string[];
  setupEntry?: string;
  [key: string]: unknown;
};

// ============================================================================
// 内联降级：./plugin-registry.js —— loadPluginManifestRegistryForPluginRegistry
// ============================================================================

type PluginManifestRegistrySnapshot = {
  plugins: readonly PluginManifestRecord[];
};

/**
 * 加载插件 manifest registry 快照（降级占位）。
 *
 * 降级说明：cross-wms 的 plugin-registry.js 尚未移植。openclaw 原版根据
 * env/includeDisabled 解析启用的插件 manifest 记录。这里降级为始终返回
 * 空 registry（{ plugins: [] }），使 listBundledChannelPluginMetadata 返回空数组。
 */
function loadPluginManifestRegistryForPluginRegistry(_params: {
  env?: NodeJS.ProcessEnv;
  includeDisabled?: boolean;
}): PluginManifestRegistrySnapshot {
  return { plugins: [] };
}

// ============================================================================
// bundled-channel-runtime 实现
// ============================================================================

type BundledChannelEntryPathPair = {
  source: string;
  built: string;
};

type BundledMetadataScope =
  | { kind: "default" }
  | { kind: "empty" }
  | { kind: "env"; env: NodeJS.ProcessEnv };

/** Bundled channel plugin metadata used by generators and runtime path resolvers. */
export type BundledChannelPluginMetadata = {
  dirName: string;
  source: BundledChannelEntryPathPair;
  setupSource?: BundledChannelEntryPathPair;
  manifest: {
    id: string;
    channels?: readonly string[];
  };
  packageManifest?: OpenClawPackageManifest;
  rootDir: string;
};

function resolveBundledMetadataScope(params?: {
  rootDir?: string;
  scanDir?: string;
}): BundledMetadataScope {
  const overrideDir = params?.scanDir
    ? path.resolve(params.scanDir)
    : params?.rootDir
      ? resolveBundledPluginsDirForRoot(params.rootDir)
      : undefined;
  if (!overrideDir) {
    return params?.rootDir ? { kind: "empty" } : { kind: "default" };
  }
  if (!fs.existsSync(overrideDir)) {
    return { kind: "empty" };
  }
  return {
    kind: "env",
    env: {
      ...process.env,
      OPENCLAW_BUNDLED_PLUGINS_DIR: overrideDir,
      OPENCLAW_TEST_TRUST_BUNDLED_PLUGINS_DIR: "1",
    },
  };
}

function resolveBundledPluginsDirForRoot(rootDir: string): string | undefined {
  const candidates = [
    path.join(rootDir, "extensions"),
    path.join(rootDir, "dist-runtime", "extensions"),
    path.join(rootDir, "dist", "extensions"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function toBundledChannelEntryPair(source: string | undefined): BundledChannelEntryPathPair | null {
  if (!source) {
    return null;
  }
  return { source, built: source };
}

function toBundledChannelPluginMetadata(
  record: PluginManifestRecord,
): BundledChannelPluginMetadata | null {
  if (record.origin !== "bundled") {
    return null;
  }
  const source = toBundledChannelEntryPair(record.source);
  if (!source) {
    return null;
  }
  const setupSource = toBundledChannelEntryPair(record.setupSource);
  return {
    dirName: path.basename(record.rootDir),
    source,
    ...(setupSource ? { setupSource } : {}),
    manifest: {
      id: record.id,
      channels: record.channels,
    },
    ...(record.packageManifest ? { packageManifest: record.packageManifest } : {}),
    rootDir: record.rootDir,
  };
}

/** Lists bundled channel plugin metadata from default or caller-provided scan roots. */
export function listBundledChannelPluginMetadata(params?: {
  rootDir?: string;
  scanDir?: string;
  includeChannelConfigs?: boolean;
  includeSyntheticChannelConfigs?: boolean;
}): readonly BundledChannelPluginMetadata[] {
  const scope = resolveBundledMetadataScope(params);
  if (scope.kind === "empty") {
    return [];
  }
  return loadPluginManifestRegistryForPluginRegistry({
    env: scope.kind === "env" ? scope.env : undefined,
    includeDisabled: true,
  }).plugins.flatMap((record) => toBundledChannelPluginMetadata(record) ?? []);
}

/** Resolves a generated runtime path for a bundled channel entry. */
export function resolveBundledChannelGeneratedPath(
  rootDir: string,
  entry: BundledChannelPluginMetadata["source"] | BundledChannelPluginMetadata["setupSource"],
  pluginDirName?: string,
  scanDir?: string,
): string | null {
  return resolveBundledPluginGeneratedPath(rootDir, entry, pluginDirName, scanDir);
}

/** Resolves the source workspace path for a bundled channel plugin id. */
export function resolveBundledChannelWorkspacePath(params: {
  rootDir: string;
  scanDir?: string;
  pluginId: string;
}): string | null {
  return (
    listBundledChannelPluginMetadata({
      rootDir: params.rootDir,
      ...(params.scanDir ? { scanDir: params.scanDir } : {}),
      includeChannelConfigs: false,
      includeSyntheticChannelConfigs: false,
    }).find((metadata) => metadata.manifest.id === params.pluginId)?.rootDir ?? null
  );
}
