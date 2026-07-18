/**
 * Builds plugin lookup tables keyed by manifest ids, channels, providers, and commands.
 * 移植自 openclaw/src/plugins/plugin-lookup-table.ts。
 * 降级策略：
 *  - channel-plugin-ids.ts 未移植，createGatewayStartupMetadataPluginIdScope、
 *    isMetadataSnapshotScopedForGatewayStartup、resolveGatewayStartupPluginPlanFromRegistry
 *    降级为返回最小占位结构。
 *  - GatewayStartupPluginPlan 类型降级为本地占位。
 *  - 复用已移植的 plugin-metadata-snapshot.ts。
 *  - WeakMap memo 缓存保留。
 */
import {
  isPluginMetadataSnapshotCompatible,
  resolvePluginMetadataSnapshot,
  type PluginMetadataSnapshot,
} from "./plugin-metadata-snapshot.js";
import type { PluginRegistrySnapshot } from "./plugin-registry-snapshot.js";

/** 占位：gateway 启动插件计划。 */
export type GatewayStartupPluginPlan = {
  pluginIds: readonly string[];
  configuredDeferredChannelPluginIds: readonly string[];
};

/** 占位：gateway 启动插件 id scope。 */
type GatewayStartupMetadataPluginIdScope = {
  key: string;
};

export type PluginLookUpTableMetrics = PluginMetadataSnapshot["metrics"] & {
  startupPlanMs: number;
  startupPluginCount: number;
  deferredChannelPluginCount: number;
};

export type PluginLookUpTable = PluginMetadataSnapshot & {
  startup: GatewayStartupPluginPlan;
  metrics: PluginLookUpTableMetrics;
};

export type LoadPluginLookUpTableParams = {
  config: unknown;
  activationSourceConfig?: unknown;
  workspaceDir?: string;
  env: NodeJS.ProcessEnv;
  index?: PluginRegistrySnapshot;
  metadataSnapshot?: PluginMetadataSnapshot;
};

let lookupTableMemoBySnapshot = new WeakMap<
  PluginMetadataSnapshot,
  Map<string, PluginLookUpTable>
>();

export function clearPluginLookUpTableMemoForTest(): void {
  lookupTableMemoBySnapshot = new WeakMap<PluginMetadataSnapshot, Map<string, PluginLookUpTable>>();
}

/** 占位：创建 gateway 启动元数据插件 id scope。 */
function createGatewayStartupMetadataPluginIdScope(_params: {
  config: unknown;
  activationSourceConfig?: unknown;
  env: NodeJS.ProcessEnv;
}): GatewayStartupMetadataPluginIdScope {
  return { key: "default" };
}

/** 占位：检查元数据快照是否针对 gateway 启动 scope（channel-plugin-ids.ts 未移植）。 */
function isMetadataSnapshotScopedForGatewayStartup(_params: {
  metadataSnapshot: PluginMetadataSnapshot;
  pluginIdScope: GatewayStartupMetadataPluginIdScope;
}): boolean {
  return true;
}

/** 占位：从注册表解析 gateway 启动插件计划。 */
function resolveGatewayStartupPluginPlanFromRegistry(_params: {
  config: unknown;
  activationSourceConfig?: unknown;
  env: NodeJS.ProcessEnv;
  index: unknown;
  manifestRegistry: unknown;
}): GatewayStartupPluginPlan {
  return {
    pluginIds: [],
    configuredDeferredChannelPluginIds: [],
  };
}

export function loadPluginLookUpTable(params: LoadPluginLookUpTableParams): PluginLookUpTable {
  const requestedSnapshotConfig = params.activationSourceConfig ?? params.config;
  const pluginIdScope = createGatewayStartupMetadataPluginIdScope({
    config: params.config,
    ...(params.activationSourceConfig !== undefined
      ? { activationSourceConfig: params.activationSourceConfig }
      : {}),
    env: params.env,
  });
  const metadataSnapshot =
    params.metadataSnapshot &&
    isPluginMetadataSnapshotCompatible({
      snapshot: params.metadataSnapshot,
      config: requestedSnapshotConfig as never,
      env: params.env,
      allowScopedSnapshot: true,
      workspaceDir: params.workspaceDir,
      index: params.index as never,
    }) &&
    isMetadataSnapshotScopedForGatewayStartup({
      metadataSnapshot: params.metadataSnapshot,
      pluginIdScope,
    })
      ? params.metadataSnapshot
      : resolvePluginMetadataSnapshot({
          config: requestedSnapshotConfig as never,
          workspaceDir: params.workspaceDir,
          env: params.env,
          allowWorkspaceScopedCurrent: params.workspaceDir === undefined,
          ...(params.index ? { index: params.index as never } : {}),
          pluginIdScope: pluginIdScope as never,
        });
  const memoKey = pluginIdScope.key;
  const memo = lookupTableMemoBySnapshot.get(metadataSnapshot)?.get(memoKey);
  if (memo) {
    return memo;
  }
  const { index, manifestRegistry } = metadataSnapshot;
  const startupPlanStartedAt = performance.now();
  const startup = resolveGatewayStartupPluginPlanFromRegistry({
    config: params.config,
    ...(params.activationSourceConfig !== undefined
      ? { activationSourceConfig: params.activationSourceConfig }
      : {}),
    env: params.env,
    index,
    manifestRegistry,
  });
  const startupPlanMs = performance.now() - startupPlanStartedAt;

  const table: PluginLookUpTable = {
    ...metadataSnapshot,
    startup,
    metrics: {
      ...metadataSnapshot.metrics,
      startupPlanMs,
      totalMs: metadataSnapshot.metrics.totalMs + startupPlanMs,
      startupPluginCount: startup.pluginIds.length,
      deferredChannelPluginCount: startup.configuredDeferredChannelPluginIds.length,
    },
  };
  let memoByKey = lookupTableMemoBySnapshot.get(metadataSnapshot);
  if (!memoByKey) {
    memoByKey = new Map();
    lookupTableMemoBySnapshot.set(metadataSnapshot, memoByKey);
  }
  memoByKey.set(memoKey, table);
  return table;
}
