/** Builds installed-index records from normalized plugin manifest registry entries. */
//
// 移植自 openclaw/src/plugins/installed-plugin-index-record-builder.ts。
//
// 降级策略：
//  - 原文件依赖 @openclaw/normalization-core/string-normalization 的
//    normalizeSortedUniqueStringEntries。改用 cross-wms 的
//    ../infra/string-normalization.js，已提供同名导出。
//  - 原文件依赖 ../config/types.js 的 OpenClawConfig。cross-wms 尚未移植完整配置
//    类型层级。这里定义本地宽松结构占位，与 installed-plugin-index-policy.ts 中
//    占位一致。
//  - 原文件依赖 ./compat/registry.js 的 PluginCompatCode。cross-wms 尚未移植该
//    模块。这里降级为 string 别名占位（与 installed-plugin-index-types.ts 一致）。
//  - 原文件依赖 ./config-state.js 的 normalizePluginsConfig 与 resolveEffectiveEnableState。
//    cross-wms 尚未移植该模块。这里内联降级实现：normalizePluginsConfig 返回空
//    规范化结构（enabled=true, entries/allow/deny/loadPaths 均为空），使所有插件
//    默认通过 base policy；resolveEffectiveEnableState 返回 {enabled: true}，使
//    buildInstalledPluginIndexRecords 默认标记所有插件为启用。
//  - 原文件依赖 ./discovery.js 的 PluginCandidate。cross-wms 尚未移植该模块。
//    这里降级为 unknown 占位（与 installed-plugin-index-types.ts 一致）。
//  - 原文件依赖 ./manifest-registry.js 的 PluginManifestRecord 与
//    PluginManifestRegistry。cross-wms 尚未移植该模块。这里定义本地最小结构占位
//    （仅含 buildInstalledPluginIndexRecords 实际访问的字段），与
//    installed-plugin-index-types.ts 中的占位一致。PluginManifestRegistry 降级为
//    { plugins: readonly PluginManifestRecord[]; diagnostics?: readonly PluginDiagnostic[] }。
//  - 原文件依赖 ./manifest.js 的 PluginPackageChannel。cross-wms 尚未移植该模块。
//    这里定义本地最小结构占位（与 installed-plugin-index-types.ts 一致）。
//  - 原文件依赖 ./slots.js 的 hasKind。cross-wms 尚未移植该模块。这里降级为
//    始终返回 false，使 startup.memory 字段始终为 false（无 memory kind 插件）。
//  - ./install-source-info.js、./installed-plugin-index-hash.js、
//    ./installed-plugin-index-manifest.js、./installed-plugin-index-types.js、
//    ./manifest-types.js、./path-safety.js 在 cross-wms 中已存在，直接引用。
//  - 行为契约保持一致：当 cross-wms 未来移植 config-state.js 与 manifest-registry.js
//    时，可直接替换本地降级实现。

import fs from "node:fs";
import path from "node:path";
import { normalizeSortedUniqueStringEntries } from "../infra/string-normalization.js";
import type { PluginInstallSourceInfo } from "./install-source-info.js";
import { describePluginInstallSource } from "./install-source-info.js";
import {
  hashJson,
  safeFileSignature,
  safeHashFile,
} from "./installed-plugin-index-hash.js";
import { hasOptionalMissingPluginManifestFile } from "./installed-plugin-index-manifest.js";
import type {
  InstalledPluginContributionInfo,
  InstalledPluginIndexRecord,
  InstalledPluginInstallRecordInfo,
  InstalledPluginPackageChannelInfo,
  InstalledPluginStartupInfo,
} from "./installed-plugin-index-types.js";
import type { PluginDiagnostic } from "./manifest-types.js";
import { isPathInside } from "./path-safety.js";

// ============================================================================
// 内联降级：./path-safety.js —— safeRealpathSync（带缓存版本）
// ============================================================================

/**
 * 安全 realpathSync（带缓存）。
 *
 * 降级说明：cross-wms 的 path-safety.js 中 safeRealpathSync 仅接受 1 个参数。
 * openclaw 原版接受 (targetPath, realpathCache) 2 个参数，使用缓存避免重复 realpath。
 * 这里内联实现与 openclaw 原版行为一致的缓存版本。
 */
function safeRealpathSync(
  targetPath: string,
  realpathCache?: Map<string, string>,
): string | null {
  if (realpathCache?.has(targetPath)) {
    return realpathCache.get(targetPath) ?? null;
  }
  try {
    const resolved = fs.realpathSync(targetPath);
    realpathCache?.set(targetPath, resolved);
    return resolved;
  } catch {
    return null;
  }
}

// ============================================================================
// 内联降级类型占位
// ============================================================================

/**
 * OpenClaw 配置的宽松类型占位。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的完整配置类型层级。
 * 这里定义结构化子集以满足 installed-plugin-index-record-builder 对 config 字段的访问。
 */
type OpenClawConfig = {
  plugins?: {
    entries?: Record<string, { enabled?: boolean }>;
    [key: string]: unknown;
  };
  channels?: Record<string, unknown>;
  [key: string]: unknown;
};

/** 插件兼容性代码（降级 string 别名占位）。 */
type PluginCompatCode = string;

/** 插件候选项（降级 unknown 占位）。 */
type PluginCandidate = unknown;

/**
 * 插件清单记录的最小结构占位。
 *
 * 降级原因：cross-wms 的 manifest-registry.js 尚未移植。这里定义与
 * openclaw PluginManifestRecord 结构兼容的最小类型，仅含
 * buildInstalledPluginIndexRecords 实际访问的字段。
 */
type PluginManifestRecord = {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  format?: string;
  bundleFormat?: string;
  bundleCapabilities?: readonly unknown[];
  skills?: readonly unknown[];
  settingsFiles?: readonly unknown[];
  hooks?: readonly unknown[];
  source?: string;
  rootDir: string;
  manifestPath: string;
  origin: string;
  enabledByDefault?: boolean;
  enabledByDefaultOnPlatforms?: readonly string[];
  syntheticAuthRefs?: readonly string[];
  setupSource?: string;
  setup?: {
    providers?: ReadonlyArray<{ id: string; envVars?: readonly string[] }>;
  };
  providerAuthEnvVars?: Record<string, readonly string[]>;
  channelEnvVars?: Record<string, readonly unknown[]>;
  activation?: {
    onStartup?: boolean;
    onAgentHarnesses?: readonly string[];
    onConfigPaths?: readonly string[];
    onProviders?: readonly string[];
    onChannels?: readonly string[];
    onCommands?: readonly string[];
    onRoutes?: readonly string[];
    onCapabilities?: readonly string[];
  };
  cliBackends?: readonly string[];
  startupDeferConfiguredChannelFullLoadUntilAfterListen?: boolean;
  kind?: unknown;
  channels?: readonly string[];
  channelConfigs?: Record<string, unknown>;
  providers?: readonly string[];
  modelCatalog?: {
    providers?: Record<string, unknown>;
    aliases?: Record<string, unknown>;
    suppressions?: ReadonlyArray<{ provider: string }>;
  };
  modelSupport?: {
    modelPrefixes?: readonly string[];
    modelPatterns?: readonly string[];
  };
  autoEnableWhenConfiguredProviders?: readonly string[];
  commandAliases?: ReadonlyArray<{ name: string }>;
  contracts?: Record<string, readonly string[]>;
  packageChannel?: PluginPackageChannel;
};

/**
 * 插件清单注册表（降级占位）。
 *
 * 降级原因：cross-wms 的 manifest-registry.js 尚未移植。这里定义与
 * openclaw PluginManifestRegistry 结构兼容的最小类型，仅含
 * buildInstalledPluginIndexRecords 实际访问的 plugins 与 diagnostics 字段。
 */
type PluginManifestRegistry = {
  plugins: readonly PluginManifestRecord[];
  diagnostics?: readonly PluginDiagnostic[];
};

/**
 * 插件包通道元数据的最小结构占位（与 installed-plugin-index-types.ts 一致）。
 */
type PluginPackageChannel = {
  id?: string;
  label?: string;
  [key: string]: unknown;
};

/** 候选项的最小结构占位（用于访问 packageDir/rootDir/packageName/packageVersion/packageManifest）。 */
type PluginCandidateRecord = {
  packageDir?: string;
  rootDir?: string;
  packageName?: string;
  packageVersion?: string;
  packageManifest?: {
    channel?: PluginPackageChannel;
    install?: Parameters<typeof describePluginInstallSource>[0];
  };
};

// ============================================================================
// 内联降级：./config-state.js —— normalizePluginsConfig 与 resolveEffectiveEnableState
// ============================================================================

type NormalizedPluginsConfig = {
  enabled: boolean;
  entries: Record<string, { enabled?: boolean }>;
  allow: readonly string[];
  deny: readonly string[];
  loadPaths: readonly string[];
};

/**
 * 规范化插件配置（降级占位）。
 *
 * 降级说明：cross-wms 的 config-state.js 尚未移植。openclaw 原版从 config.plugins
 * 解析 entries/allow/deny/loadPaths。这里降级为始终返回空规范化结构，使所有插件
 * 默认通过 base policy（enabled=true, 无 deny, 无 allowlist 限制）。
 */
function normalizePluginsConfig(_plugins: unknown): NormalizedPluginsConfig {
  return {
    enabled: true,
    entries: {},
    allow: [],
    deny: [],
    loadPaths: [],
  };
}

type EffectiveEnableState = {
  enabled: boolean;
  explicitlyEnabled?: boolean;
};

/**
 * 解析插件有效启用状态（降级占位）。
 *
 * 降级说明：cross-wms 的 config-state.js 尚未移植。openclaw 原版结合 config 与
 * default enablement 决定插件是否启用。这里降级为始终返回 {enabled: true}，
 * 使 buildInstalledPluginIndexRecords 默认标记所有插件为启用。
 */
function resolveEffectiveEnableState(_params: {
  id: string;
  origin: string;
  config: NormalizedPluginsConfig;
  rootConfig?: OpenClawConfig;
  enabledByDefault?: boolean;
}): EffectiveEnableState {
  return { enabled: true };
}

// ============================================================================
// 内联降级：./slots.js —— hasKind
// ============================================================================

/**
 * 判断插件 kind 是否包含指定能力（降级占位）。
 *
 * 降级说明：cross-wms 的 slots.js 尚未移植。openclaw 原版从 plugin.kind 字段
 * 解析能力集合。这里降级为始终返回 false，使 startup.memory 字段始终为 false。
 */
function hasKind(_kind: unknown, _capability: string): boolean {
  return false;
}

// ============================================================================
// installed-plugin-index-record-builder 实现
// ============================================================================

function buildStartupInfo(record: PluginManifestRecord): InstalledPluginStartupInfo {
  return {
    sidecar: record.activation?.onStartup === true,
    memory: hasKind(record.kind, "memory"),
    deferConfiguredChannelFullLoadUntilAfterListen:
      record.startupDeferConfiguredChannelFullLoadUntilAfterListen === true,
    agentHarnesses: normalizeSortedUniqueStringEntries([
      ...(record.activation?.onAgentHarnesses ?? []),
      ...(record.cliBackends ?? []),
    ]),
    configPaths: normalizeSortedUniqueStringEntries(record.activation?.onConfigPaths),
  };
}

function buildContributionInfo(record: PluginManifestRecord): InstalledPluginContributionInfo {
  const contracts = Object.fromEntries(
    Object.entries(record.contracts ?? {}).map(([key, values]) => [
      key,
      normalizeSortedUniqueStringEntries(values),
    ]),
  );
  return {
    channels: normalizeSortedUniqueStringEntries(record.channels),
    channelConfigs: normalizeSortedUniqueStringEntries(Object.keys(record.channelConfigs ?? {})),
    providers: normalizeSortedUniqueStringEntries(record.providers),
    modelCatalogProviders: normalizeSortedUniqueStringEntries([
      ...Object.keys(record.modelCatalog?.providers ?? {}),
      ...Object.keys(record.modelCatalog?.aliases ?? {}),
      ...(record.modelCatalog?.suppressions ?? []).map((entry) => entry.provider),
    ]),
    modelSupportPrefixes: normalizeSortedUniqueStringEntries(record.modelSupport?.modelPrefixes),
    modelSupportPatterns: normalizeSortedUniqueStringEntries(record.modelSupport?.modelPatterns),
    autoEnableProviderIds: normalizeSortedUniqueStringEntries(
      record.autoEnableWhenConfiguredProviders,
    ),
    commandAliases: normalizeSortedUniqueStringEntries(
      record.commandAliases?.map((alias) => alias.name),
    ),
    contracts,
  };
}

/** Collects compatibility codes implied by a manifest's legacy or activation surfaces. */
export function collectPluginManifestCompatCodes(
  record: PluginManifestRecord,
): readonly PluginCompatCode[] {
  const codes: PluginCompatCode[] = [];
  if (record.providerAuthEnvVars && Object.keys(record.providerAuthEnvVars).length > 0) {
    codes.push("provider-auth-env-vars");
  }
  if (record.channelEnvVars && Object.keys(record.channelEnvVars).length > 0) {
    codes.push("channel-env-vars");
  }
  if (record.activation?.onProviders?.length) {
    codes.push("activation-provider-hint");
  }
  if (record.activation?.onAgentHarnesses?.length) {
    codes.push("activation-agent-harness-hint");
  }
  if (record.activation?.onChannels?.length) {
    codes.push("activation-channel-hint");
  }
  if (record.activation?.onCommands?.length) {
    codes.push("activation-command-hint");
  }
  if (record.activation?.onRoutes?.length) {
    codes.push("activation-route-hint");
  }
  if (record.activation?.onConfigPaths?.length) {
    codes.push("activation-config-path-hint");
  }
  if (record.activation?.onCapabilities?.length) {
    codes.push("activation-capability-hint");
  }
  return normalizeSortedUniqueStringEntries(codes) as readonly PluginCompatCode[];
}

function resolvePackageJsonPath(
  candidate: PluginCandidateRecord | undefined,
  realpathCache: Map<string, string>,
): string | undefined {
  if (!candidate?.packageDir) {
    return undefined;
  }
  const packageDir =
    safeRealpathSync(candidate.packageDir, realpathCache) ?? path.resolve(candidate.packageDir);
  const packageJsonPath = path.join(packageDir, "package.json");
  const rootDir =
    candidate.rootDir === candidate.packageDir
      ? packageDir
      : (safeRealpathSync(candidate.rootDir ?? "", realpathCache) ??
        path.resolve(candidate.rootDir ?? ""));
  const packageJsonRealPath = safeRealpathSync(packageJsonPath, realpathCache);
  return packageJsonRealPath && isPathInside(rootDir, packageJsonRealPath)
    ? packageJsonPath
    : undefined;
}

function resolvePackageJsonRelativePath(
  rootDir: string,
  packageJsonPath: string,
  realpathCache: Map<string, string>,
): string {
  const resolvedRootDir =
    rootDir === path.dirname(packageJsonPath)
      ? path.dirname(packageJsonPath)
      : (safeRealpathSync(rootDir, realpathCache) ?? path.resolve(rootDir));
  const relativePath = path.relative(resolvedRootDir, packageJsonPath) || "package.json";
  return relativePath.split(path.sep).join("/");
}

function resolvePackageJsonRecord(params: {
  candidate: PluginCandidateRecord | undefined;
  packageJsonPath: string | undefined;
  diagnostics: PluginDiagnostic[];
  pluginId: string;
  realpathCache: Map<string, string>;
}): InstalledPluginIndexRecord["packageJson"] | undefined {
  if (!params.candidate?.packageDir || !params.packageJsonPath) {
    return undefined;
  }
  const hash = safeHashFile({
    filePath: params.packageJsonPath,
    pluginId: params.pluginId,
    diagnostics: params.diagnostics,
    required: false,
  });
  if (!hash) {
    return undefined;
  }
  const fileSignature = safeFileSignature(params.packageJsonPath);
  return {
    path: resolvePackageJsonRelativePath(
      params.candidate.rootDir ?? "",
      params.packageJsonPath,
      params.realpathCache,
    ),
    hash,
    ...(fileSignature ? { fileSignature } : {}),
  };
}

function describePackageInstallSource(
  candidate: PluginCandidateRecord | undefined,
): PluginInstallSourceInfo | undefined {
  const install = candidate?.packageManifest?.install;
  if (!install) {
    return undefined;
  }
  return describePluginInstallSource(install, {
    expectedPackageName: candidate?.packageName,
  });
}

function normalizeStringField(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizePackageChannel(
  channel: PluginPackageChannel | undefined,
): InstalledPluginPackageChannelInfo | undefined {
  const id = normalizeStringField(channel?.id);
  if (!id) {
    return undefined;
  }
  return {
    ...structuredClone(channel ?? {}),
    id,
  };
}

function hashManifestlessBundleRecord(record: PluginManifestRecord): string {
  return hashJson({
    id: record.id,
    name: record.name,
    description: record.description,
    version: record.version,
    format: record.format,
    bundleFormat: record.bundleFormat,
    bundleCapabilities: record.bundleCapabilities ?? [],
    skills: record.skills ?? [],
    settingsFiles: record.settingsFiles ?? [],
    hooks: record.hooks ?? [],
  });
}

function resolveManifestHash(params: {
  record: PluginManifestRecord;
  diagnostics: PluginDiagnostic[];
}): string {
  if (hasOptionalMissingPluginManifestFile(params.record as never)) {
    return hashManifestlessBundleRecord(params.record);
  }
  const hash = safeHashFile({
    filePath: params.record.manifestPath,
    pluginId: params.record.id,
    diagnostics: params.diagnostics,
    required: true,
  });
  if (hash) {
    return hash;
  }
  return "";
}

function buildCandidateLookup(
  candidates: readonly PluginCandidate[],
): Map<string, PluginCandidateRecord> {
  const byRootDir = new Map<string, PluginCandidateRecord>();
  for (const candidate of candidates) {
    const record = candidate as PluginCandidateRecord;
    if (record?.rootDir) {
      byRootDir.set(record.rootDir, record);
    }
  }
  return byRootDir;
}

/** Builds installed plugin index records from manifest registry entries. */
export function buildInstalledPluginIndexRecords(params: {
  candidates: readonly PluginCandidate[];
  registry: PluginManifestRegistry;
  config?: OpenClawConfig;
  diagnostics: PluginDiagnostic[];
  installRecords: Record<string, InstalledPluginInstallRecordInfo>;
}): InstalledPluginIndexRecord[] {
  const candidateByRootDir = buildCandidateLookup(params.candidates);
  const normalizedConfig = normalizePluginsConfig(params.config?.plugins);
  const realpathCache = new Map<string, string>();
  return params.registry.plugins.map((record): InstalledPluginIndexRecord => {
    const candidate = candidateByRootDir.get(record.rootDir);
    const packageJsonPath = resolvePackageJsonPath(candidate, realpathCache);
    const installRecord = params.installRecords[record.id];
    const packageInstall = describePackageInstallSource(candidate);
    const packageChannel = normalizePackageChannel(
      record.packageChannel ?? candidate?.packageManifest?.channel,
    );
    const manifestHash = resolveManifestHash({ record, diagnostics: params.diagnostics });
    const manifestFile = hasOptionalMissingPluginManifestFile(record as never)
      ? undefined
      : safeFileSignature(record.manifestPath);
    const packageJson = resolvePackageJsonRecord({
      candidate,
      packageJsonPath,
      diagnostics: params.diagnostics,
      pluginId: record.id,
      realpathCache,
    });
    const enabled = resolveEffectiveEnableState({
      id: record.id,
      origin: record.origin,
      config: normalizedConfig,
      rootConfig: params.config,
      enabledByDefault: false,
    }).enabled;
    const indexRecord: InstalledPluginIndexRecord = {
      pluginId: record.id,
      manifestPath: record.manifestPath,
      manifestHash,
      ...(manifestFile ? { manifestFile } : {}),
      source: record.source,
      rootDir: record.rootDir,
      origin: record.origin as any,
      enabled,
      startup: buildStartupInfo(record),
      contributions: buildContributionInfo(record),
      compat: collectPluginManifestCompatCodes(record),
    };
    if (record.format && record.format !== "openclaw") {
      indexRecord.format = record.format;
    }
    if (record.bundleFormat) {
      indexRecord.bundleFormat = record.bundleFormat;
    }
    if (record.enabledByDefault === true) {
      indexRecord.enabledByDefault = true;
    }
    if (record.enabledByDefaultOnPlatforms?.length) {
      indexRecord.enabledByDefaultOnPlatforms = [...record.enabledByDefaultOnPlatforms];
    }
    if (record.syntheticAuthRefs?.length) {
      indexRecord.syntheticAuthRefs = [...record.syntheticAuthRefs];
    }
    if (record.setupSource) {
      indexRecord.setupSource = record.setupSource;
    }
    if (candidate?.packageName) {
      indexRecord.packageName = candidate.packageName;
    }
    if (candidate?.packageVersion) {
      indexRecord.packageVersion = candidate.packageVersion;
    }
    if (installRecord) {
      indexRecord.installRecordHash = hashJson(installRecord);
    }
    if (packageInstall) {
      indexRecord.packageInstall = packageInstall;
    }
    if (packageChannel) {
      indexRecord.packageChannel = packageChannel;
    }
    if (packageJson) {
      indexRecord.packageJson = packageJson;
    }
    return indexRecord;
  });
}
