/**
 * 定义 gateway 与诊断使用的插件元数据快照类型。
 *
 * 降级说明：原实现依赖 ../config/types.openclaw.js 的 OpenClawConfig、
 * ./discovery.js 的 PluginDiscoveryResult、./installed-plugin-index-types.js
 * 的 InstalledPluginIndex、./manifest-registry.js 的 PluginManifestRecord 与
 * PluginManifestRegistry、./manifest-types.js 的 PluginDiagnostic、
 * ./plugin-registry-snapshot.types.js 的 PluginRegistrySnapshotSource，
 * cross-wms 暂未移植 discovery/installed-plugin-index/manifest-registry 等模块，
 * 这里以本地占位类型替代，仅保留类型形状供下游引用。
 */

import type { InstalledPluginIndex } from "./installed-plugin-index-types.js";
import type { PluginDiagnostic } from "./manifest-types.js";
import type { PluginManifestRecord, PluginManifestRegistry } from "./manifest-registry.js";
import type { PluginRegistrySnapshotSource } from "./plugin-registry-snapshot.types.js";

/** OpenClaw 配置（降级为 unknown 占位）。 */
export type OpenClawConfig = Record<string, unknown>;

/** 插件发现结果（降级为 unknown 占位）。 */
export type PluginDiscoveryResult = unknown;

export type PluginMetadataSnapshotPluginIdScope = {
  key: string;
  resolve: (params: { index: InstalledPluginIndex }) => readonly string[] | undefined;
};

export type PluginMetadataSnapshotOwnerMaps = {
  channels: ReadonlyMap<string, readonly string[]>;
  channelConfigs: ReadonlyMap<string, readonly string[]>;
  providers: ReadonlyMap<string, readonly string[]>;
  modelCatalogProviders: ReadonlyMap<string, readonly string[]>;
  cliBackends: ReadonlyMap<string, readonly string[]>;
  setupProviders: ReadonlyMap<string, readonly string[]>;
  commandAliases: ReadonlyMap<string, readonly string[]>;
  contracts: ReadonlyMap<string, readonly string[]>;
};

export type PluginMetadataSnapshotMetrics = {
  registrySnapshotMs: number;
  manifestRegistryMs: number;
  ownerMapsMs: number;
  totalMs: number;
  indexPluginCount: number;
  manifestPluginCount: number;
};

export type PluginMetadataSnapshotRegistryDiagnostic = {
  level: "info" | "warn";
  code:
    | "persisted-registry-disabled"
    | "persisted-registry-missing"
    | "persisted-registry-stale-policy"
    | "persisted-registry-stale-source";
  message: string;
};

export type PluginMetadataSnapshot = {
  policyHash: string;
  configFingerprint?: string;
  pluginIds?: readonly string[];
  registrySource?: PluginRegistrySnapshotSource;
  workspaceDir?: string;
  index: InstalledPluginIndex;
  registryDiagnostics: readonly PluginMetadataSnapshotRegistryDiagnostic[];
  manifestRegistry: PluginManifestRegistry;
  plugins: readonly PluginManifestRecord[];
  diagnostics: readonly PluginDiagnostic[];
  byPluginId: ReadonlyMap<string, PluginManifestRecord>;
  normalizePluginId: (pluginId: string) => string;
  owners: PluginMetadataSnapshotOwnerMaps;
  metrics: PluginMetadataSnapshotMetrics;
  discovery?: PluginDiscoveryResult;
};

export type PluginMetadataRegistryView = Pick<
  PluginMetadataSnapshot,
  "index" | "manifestRegistry"
>;

export type PluginMetadataManifestView = Pick<PluginMetadataSnapshot, "index" | "plugins">;

export type LoadPluginMetadataSnapshotParams = {
  config?: OpenClawConfig;
  workspaceDir?: string;
  stateDir?: string;
  env?: NodeJS.ProcessEnv;
  index?: InstalledPluginIndex;
  pluginIds?: readonly string[];
  pluginIdScope?: PluginMetadataSnapshotPluginIdScope;
  preferPersisted?: boolean;
};

export type ResolvePluginMetadataSnapshotParams = LoadPluginMetadataSnapshotParams & {
  allowCurrent?: boolean;
  allowWorkspaceScopedCurrent?: boolean;
};
