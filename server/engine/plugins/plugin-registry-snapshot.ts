/**
 * Builds stable snapshots of plugin registry contributions.
 * 移植自 openclaw/src/plugins/plugin-registry-snapshot.ts。
 * 降级策略：
 *  - 复用已移植的 installed-plugin-index.ts、installed-plugin-index-store.ts、
 *    installed-plugin-index-hash.ts、installed-plugin-index-manifest.ts、
 *    installed-plugin-index-policy.ts、installed-plugin-index-record-reader.ts。
 *  - bundled-dir.ts、bundled-load-path-aliases.ts、bundled-source-overlays.ts、
 *    config-state.ts、current-plugin-metadata-snapshot.ts、discovery.ts、plugin-scope.ts、
 *    roots.ts、version.ts 等未导出所需 API 的模块，相关调用降级为 no-op 或默认值。
 *  - import.meta.url 改用 __filename（不需要）。
 *  - LRU memo 缓存保留，键解析降级为常量字符串。
 *  - 所有 export 保持签名兼容；行为降级为返回空快照或调用底层已移植 API。
 */
import {
  loadInstalledPluginIndex,
  loadInstalledPluginIndexWithDiscovery,
  type InstalledPluginIndex,
  type InstalledPluginIndexRecord,
  type LoadInstalledPluginIndexParams,
  type RefreshInstalledPluginIndexParams,
} from "./installed-plugin-index.js";
import {
  inspectPersistedInstalledPluginIndex,
  readPersistedInstalledPluginIndexSync,
  refreshPersistedInstalledPluginIndex,
  type InstalledPluginIndexStoreInspection,
  type InstalledPluginIndexStoreOptions,
} from "./installed-plugin-index-store.js";
import {
  getInstalledPluginRecord,
  isInstalledPluginEnabled,
  listInstalledPluginRecords,
} from "./installed-plugin-index.js";
import { registerPluginMetadataProcessMemoLifecycleClear } from "./plugin-metadata-lifecycle.js";
import type { PluginRegistrySnapshotSource } from "./plugin-registry-snapshot.types.js";

export type PluginRegistrySnapshot = InstalledPluginIndex;
export type PluginRegistryRecord = InstalledPluginIndexRecord;
export type PluginRegistryInspection = InstalledPluginIndexStoreInspection;
export type { PluginRegistrySnapshotSource } from "./plugin-registry-snapshot.types.js";
export type PluginRegistrySnapshotDiagnosticCode =
  | "persisted-registry-disabled"
  | "persisted-registry-missing"
  | "persisted-registry-stale-policy"
  | "persisted-registry-stale-source";

export type PluginRegistrySnapshotDiagnostic = {
  level: "info" | "warn";
  code: PluginRegistrySnapshotDiagnosticCode;
  message: string;
};

export type PluginRegistrySnapshotResult = {
  snapshot: PluginRegistrySnapshot;
  source: PluginRegistrySnapshotSource;
  diagnostics: readonly PluginRegistrySnapshotDiagnostic[];
  discovery?: unknown;
};

export const DISABLE_PERSISTED_PLUGIN_REGISTRY_ENV = "OPENCLAW_DISABLE_PERSISTED_PLUGIN_REGISTRY";
const MAX_PLUGIN_REGISTRY_SNAPSHOT_MEMOS = 8;

type PluginRegistrySnapshotMemo = {
  key: string;
  result: PluginRegistrySnapshotResult;
};

let pluginRegistrySnapshotMemos: PluginRegistrySnapshotMemo[] = [];

function clearLoadPluginRegistrySnapshotMemo(): void {
  pluginRegistrySnapshotMemos = [];
}

registerPluginMetadataProcessMemoLifecycleClear(clearLoadPluginRegistrySnapshotMemo);

function hasEnvFlag(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = env[name]?.trim().toLowerCase();
  return Boolean(value && value !== "0" && value !== "false" && value !== "no");
}

export type LoadPluginRegistryParams = LoadInstalledPluginIndexParams &
  InstalledPluginIndexStoreOptions & {
    index?: PluginRegistrySnapshot;
    preferPersisted?: boolean;
  };

export type GetPluginRecordParams = LoadPluginRegistryParams & {
  pluginId: string;
};

function canMemoizePluginRegistrySnapshot(params: LoadPluginRegistryParams): boolean {
  return (
    params.index === undefined &&
    params.candidates === undefined &&
    params.diagnostics === undefined &&
    params.discovery === undefined &&
    params.installRecords === undefined &&
    params.now === undefined &&
    params.filePath === undefined &&
    params.pluginIndexFilePath === undefined
  );
}

function resolvePluginRegistrySnapshotMemoKey(
  params: LoadPluginRegistryParams,
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (!canMemoizePluginRegistrySnapshot(params)) {
    return undefined;
  }
  // 降级：使用简化的 memo key，包含 preferPersisted 与 env 标志
  return JSON.stringify({
    preferPersisted: params.preferPersisted ?? null,
    disabled: hasEnvFlag(env, DISABLE_PERSISTED_PLUGIN_REGISTRY_ENV),
    hasConfig: params.config !== undefined,
    hasWorkspaceDir: params.workspaceDir !== undefined,
    hasStateDir: params.stateDir !== undefined,
  });
}

function findPluginRegistrySnapshotMemo(
  key: string | undefined,
): PluginRegistrySnapshotResult | undefined {
  if (!key) {
    return undefined;
  }
  const index = pluginRegistrySnapshotMemos.findIndex((memo) => memo.key === key);
  if (index === -1) {
    return undefined;
  }
  const [memo] = pluginRegistrySnapshotMemos.splice(index, 1);
  if (!memo) {
    return undefined;
  }
  pluginRegistrySnapshotMemos.unshift(memo);
  return memo.result;
}

function rememberPluginRegistrySnapshotMemo(
  key: string | undefined,
  result: PluginRegistrySnapshotResult,
): PluginRegistrySnapshotResult {
  if (!key) {
    return result;
  }
  pluginRegistrySnapshotMemos = [
    { key, result },
    ...pluginRegistrySnapshotMemos.filter((memo) => memo.key !== key),
  ].slice(0, MAX_PLUGIN_REGISTRY_SNAPSHOT_MEMOS);
  return result;
}

export function loadPluginRegistrySnapshotWithMetadata(
  params: LoadPluginRegistryParams = {},
): PluginRegistrySnapshotResult {
  if (params.index) {
    return {
      snapshot: params.index,
      source: "provided",
      diagnostics: [],
    };
  }

  const env = params.env ?? process.env;
  const memoKey = resolvePluginRegistrySnapshotMemoKey(params, env);
  const memo = findPluginRegistrySnapshotMemo(memoKey);
  if (memo) {
    return memo;
  }
  const diagnostics: PluginRegistrySnapshotDiagnostic[] = [];
  const disabledByCaller = params.preferPersisted === false;
  const disabledByEnv = hasEnvFlag(env, DISABLE_PERSISTED_PLUGIN_REGISTRY_ENV);
  const persistedReadsEnabled = !disabledByCaller && !disabledByEnv;
  let persistedIndex: InstalledPluginIndex | null = null;
  if (persistedReadsEnabled) {
    persistedIndex = readPersistedInstalledPluginIndexSync(params);
    if (persistedIndex) {
      const persistedResult: PluginRegistrySnapshotResult = {
        snapshot: persistedIndex,
        source: "persisted",
        diagnostics,
      };
      return rememberPluginRegistrySnapshotMemo(memoKey, persistedResult);
    } else {
      diagnostics.push({
        level: "info",
        code: "persisted-registry-missing",
        message: "Persisted plugin registry is missing or invalid; using derived plugin index.",
      });
    }
  } else {
    diagnostics.push({
      level: "warn",
      code: "persisted-registry-disabled",
      message: disabledByEnv
        ? `${DISABLE_PERSISTED_PLUGIN_REGISTRY_ENV} is a deprecated break-glass compatibility switch; using legacy derived plugin index.`
        : "Persisted plugin registry reads are disabled by the caller; using derived plugin index.",
    });
  }

  const derived = loadInstalledPluginIndexWithDiscovery(params);
  return rememberPluginRegistrySnapshotMemo(memoKey, {
    snapshot: derived.index,
    source: "derived",
    diagnostics,
    discovery: derived.discovery,
  });
}

function resolveSnapshot(params: LoadPluginRegistryParams = {}): PluginRegistrySnapshot {
  return loadPluginRegistrySnapshotWithMetadata(params).snapshot;
}

export function loadPluginRegistrySnapshot(
  params: LoadPluginRegistryParams = {},
): PluginRegistrySnapshot {
  return resolveSnapshot(params);
}

export function listPluginRecords(
  params: LoadPluginRegistryParams = {},
): readonly PluginRegistryRecord[] {
  return listInstalledPluginRecords(resolveSnapshot(params));
}

export function getPluginRecord(params: GetPluginRecordParams): PluginRegistryRecord | undefined {
  return getInstalledPluginRecord(resolveSnapshot(params), params.pluginId);
}

export function isPluginEnabled(params: GetPluginRecordParams): boolean {
  return isInstalledPluginEnabled(resolveSnapshot(params), params.pluginId, params.config as never);
}

export function inspectPluginRegistry(
  params: LoadInstalledPluginIndexParams & InstalledPluginIndexStoreOptions = {},
): Promise<PluginRegistryInspection> {
  return inspectPersistedInstalledPluginIndex(params);
}

export function refreshPluginRegistry(
  params: RefreshInstalledPluginIndexParams & InstalledPluginIndexStoreOptions,
): Promise<PluginRegistrySnapshot> {
  return refreshPersistedInstalledPluginIndex(params);
}
