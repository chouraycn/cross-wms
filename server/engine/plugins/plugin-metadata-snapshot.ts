/**
 * Builds plugin metadata snapshots for gateway and diagnostics.
 * 移植自 openclaw/src/plugins/plugin-metadata-snapshot.ts。
 * 降级策略：
 *  - 复用已移植的 plugin-registry-snapshot.ts、plugin-registry-id-normalizer.ts、
 *    plugin-metadata-lifecycle.ts、plugin-control-plane-context.ts、
 *    plugin-snapshot-fingerprint.ts、plugin-scope.ts、install-paths.ts、
 *    installed-plugin-index-hash.ts、installed-plugin-index-policy.ts、
 *    installed-plugin-index-store.ts。
 *  - bundled-dir.ts、current-plugin-metadata-snapshot.ts、manifest-registry-installed.ts、
 *    diagnostics-timeline.ts、version.ts、config/paths.ts 等未导出所需 API 的模块，
 *    相关调用降级为 no-op 或默认值。
 *  - import.meta.url 不需要（源文件未使用）。
 *  - LRU memo 缓存保留，键解析降级为简化字符串。
 *  - 所有 export 保持签名兼容；行为降级为返回空快照或调用底层已移植 API。
 */
import { hashJson } from "./installed-plugin-index-hash.js";
import { resolveInstalledPluginIndexPolicyHash } from "./installed-plugin-index-policy.js";
import { readPersistedInstalledPluginIndexSync } from "./installed-plugin-index-store.js";
import type { InstalledPluginIndex } from "./installed-plugin-index-types.js";
import { loadPluginManifestRegistry, type PluginManifestRecord } from "./manifest-registry.js";
import { resolvePluginControlPlaneFingerprint } from "./plugin-control-plane-context.js";
import { registerPluginMetadataProcessMemoLifecycleClear } from "./plugin-metadata-lifecycle.js";
import type {
  LoadPluginMetadataSnapshotParams,
  PluginMetadataSnapshot,
  PluginMetadataSnapshotOwnerMaps,
  ResolvePluginMetadataSnapshotParams,
} from "./plugin-metadata-snapshot.types.js";
import { createPluginRegistryIdNormalizer } from "./plugin-registry-id-normalizer.js";
import {
  loadPluginRegistrySnapshotWithMetadata,
  type PluginRegistrySnapshotSource,
} from "./plugin-registry-snapshot.js";
import { normalizePluginIdScope, serializePluginIdScope } from "./plugin-scope.js";
import { fileFingerprint } from "./plugin-snapshot-fingerprint.js";

type PluginMetadataSnapshotMemo = {
  key: string;
  lookupContextHash: string;
  registryState?: PersistedRegistryMemoState;
  snapshot: PluginMetadataSnapshot;
};

type PersistedRegistryMemoState = {
  contextHash: string;
  fastHash: string;
  fingerprint: unknown;
};

const MAX_PLUGIN_METADATA_SNAPSHOT_MEMOS = 8;

let pluginMetadataSnapshotMemos: PluginMetadataSnapshotMemo[] = [];

export function clearLoadPluginMetadataSnapshotMemo(): void {
  pluginMetadataSnapshotMemos = [];
}

registerPluginMetadataProcessMemoLifecycleClear(clearLoadPluginMetadataSnapshotMemo);

const MEMO_RELEVANT_ENV_KEYS = [
  "APPDATA",
  "HOME",
  "OPENCLAW_BUNDLED_PLUGINS_DIR",
  "OPENCLAW_COMPATIBILITY_HOST_VERSION",
  "OPENCLAW_CONFIG_PATH",
  "OPENCLAW_DISABLE_BUNDLED_PLUGINS",
  "OPENCLAW_DISABLE_BUNDLED_SOURCE_OVERLAYS",
  "OPENCLAW_DISABLE_PERSISTED_PLUGIN_REGISTRY",
  "OPENCLAW_HOME",
  "OPENCLAW_NIX_MODE",
  "OPENCLAW_STATE_DIR",
  "USERPROFILE",
  "XDG_CONFIG_HOME",
] as const;
export type {
  LoadPluginMetadataSnapshotParams,
  PluginMetadataManifestView,
  PluginMetadataRegistryView,
  PluginMetadataSnapshot,
  PluginMetadataSnapshotMetrics,
  PluginMetadataSnapshotOwnerMaps,
  PluginMetadataSnapshotRegistryDiagnostic,
  ResolvePluginMetadataSnapshotParams,
} from "./plugin-metadata-snapshot.types.js";

function pickMemoRelevantEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    MEMO_RELEVANT_ENV_KEYS.flatMap((key) => {
      const value = env[key];
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

export function resolvePluginMetadataSnapshotMemoEnvFingerprint(env: NodeJS.ProcessEnv): string {
  return hashJson(pickMemoRelevantEnv(env));
}

/** 占位：获取活动诊断时间线 span（diagnostics-timeline.ts 未移植）。 */
function getActiveDiagnosticsTimelineSpan(): { phase?: string } | undefined {
  return undefined;
}

/** 占位：测量诊断时间线 span（diagnostics-timeline.ts 未移植）。 */
function measureDiagnosticsTimelineSpanSync<T>(label: string, fn: () => T, _options?: unknown): T {
  void label;
  return fn();
}

/** 占位：解析默认插件 npm 目录（install-paths.ts 未导出该 API）。 */
function resolveDefaultPluginNpmDir(_env: NodeJS.ProcessEnv): string {
  return "";
}

/** 占位：解析插件 npm 项目目录（install-paths.ts 未导出该 API）。 */
function resolvePluginNpmProjectsDir(_npmRoot: string): string {
  return "";
}

/** 占位：解析 nix 模式（config/paths.ts 未移植）。 */
function resolveIsNixMode(_env: NodeJS.ProcessEnv): boolean {
  return false;
}

/** 占位：解析兼容性宿主版本（version.ts 未移植）。 */
function resolveCompatibilityHostVersion(_env: NodeJS.ProcessEnv): string {
  return "unknown";
}

/** 占位：解析用户路径（utils.ts 未移植）。 */
function resolveUserPath(value: string, _env: NodeJS.ProcessEnv): string {
  return value;
}

/** 占位：解析已安装 manifest 注册表索引指纹（manifest-registry-installed.ts 未移植）。 */
function resolveInstalledManifestRegistryIndexFingerprint(_index: unknown): string {
  return "";
}

/** 占位：为已安装索引加载 manifest 注册表（manifest-registry-installed.ts 未移植）。 */
function loadPluginManifestRegistryForInstalledIndex(_params: {
  index: unknown;
  config?: unknown;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  pluginIds?: readonly string[];
  includeDisabled?: boolean;
}): { plugins: PluginManifestRecord[]; diagnostics: never[] } {
  return { plugins: [], diagnostics: [] };
}

/** 占位：获取当前插件元数据快照（current-plugin-metadata-snapshot.ts 未移植）。 */
function getCurrentPluginMetadataSnapshot(_params: {
  config?: unknown;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
  pluginIds?: readonly string[];
  pluginIdScope?: unknown;
  allowWorkspaceScopedSnapshot?: boolean;
  requireDefaultDiscoveryContext?: boolean;
}): PluginMetadataSnapshot | undefined {
  return undefined;
}

function throwReadonlyPluginMetadataMutation(): never {
  throw new TypeError("Plugin metadata snapshots are immutable");
}

function freezeSnapshotValue<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);
  if (value instanceof Map) {
    for (const [key, entry] of value) {
      freezeSnapshotValue(key, seen);
      freezeSnapshotValue(entry, seen);
    }
    Object.defineProperties(value, {
      clear: { value: throwReadonlyPluginMetadataMutation },
      delete: { value: throwReadonlyPluginMetadataMutation },
      set: { value: throwReadonlyPluginMetadataMutation },
    });
    return Object.freeze(value);
  }
  if (value instanceof Set) {
    for (const entry of value) {
      freezeSnapshotValue(entry, seen);
    }
    Object.defineProperties(value, {
      add: { value: throwReadonlyPluginMetadataMutation },
      clear: { value: throwReadonlyPluginMetadataMutation },
      delete: { value: throwReadonlyPluginMetadataMutation },
    });
    return Object.freeze(value);
  }
  for (const entry of Object.values(value)) {
    freezeSnapshotValue(entry, seen);
  }
  return Object.freeze(value);
}

function freezePluginMetadataSnapshot(snapshot: PluginMetadataSnapshot): PluginMetadataSnapshot {
  return freezeSnapshotValue(snapshot);
}

function resolvePersistedRegistryFastMemoFingerprint(params: {
  env: NodeJS.ProcessEnv;
  preferPersisted?: boolean;
  stateDir?: string;
}): Record<string, unknown> {
  const disabledByEnv = params.env.OPENCLAW_DISABLE_PERSISTED_PLUGIN_REGISTRY?.trim().toLowerCase();
  const disabled =
    params.preferPersisted === false ||
    (Boolean(disabledByEnv) &&
      disabledByEnv !== "0" &&
      disabledByEnv !== "false" &&
      disabledByEnv !== "no");
  if (disabled) {
    return { disabled: true };
  }
  const npmRoot = params.stateDir
    ? `${params.stateDir}/npm`
    : resolveDefaultPluginNpmDir(params.env);
  return {
    index: hashJson(readPersistedInstalledPluginIndexSync(params)),
    npmPackageJson: fileFingerprint(`${npmRoot}/package.json`),
  };
}

function resolvePersistedRegistryMemoContextHash(params: {
  env: NodeJS.ProcessEnv;
  fastFingerprint: unknown;
  preferPersisted?: boolean;
  stateDir?: string;
}): string {
  return hashJson({
    env: pickMemoRelevantEnv(params.env),
    fastFingerprint: params.fastFingerprint,
    preferPersisted: params.preferPersisted ?? null,
    stateDir: params.stateDir ?? null,
  });
}

function resolvePersistedRegistryMemoLookupContextHash(params: {
  env: NodeJS.ProcessEnv;
  preferPersisted?: boolean;
  stateDir?: string;
}): string {
  return hashJson({
    env: pickMemoRelevantEnv(params.env),
    preferPersisted: params.preferPersisted ?? null,
    stateDir: params.stateDir ?? null,
  });
}

function resolvePersistedRegistryMemoState(params: {
  env: NodeJS.ProcessEnv;
  preferPersisted?: boolean;
  stateDir?: string;
}): PersistedRegistryMemoState {
  const fastFingerprint = resolvePersistedRegistryFastMemoFingerprint(params);
  const fastHash = hashJson(fastFingerprint);
  const contextHash = resolvePersistedRegistryMemoContextHash({
    ...params,
    fastFingerprint,
  });
  if (
    fastFingerprint &&
    typeof fastFingerprint === "object" &&
    "disabled" in fastFingerprint &&
    fastFingerprint.disabled === true
  ) {
    return {
      contextHash,
      fastHash,
      fingerprint: fastFingerprint,
    };
  }
  const index = readPersistedInstalledPluginIndexSync(params);
  return {
    contextHash,
    fastHash,
    fingerprint: {
      ...fastFingerprint,
      indexHash: hashJson(index),
    },
  };
}

function resolvePersistedRegistryMemoStateForLookup(
  params: {
    env: NodeJS.ProcessEnv;
    preferPersisted?: boolean;
    stateDir?: string;
  },
  memos: readonly PluginMetadataSnapshotMemo[],
): PersistedRegistryMemoState {
  const lookupContextHash = resolvePersistedRegistryMemoLookupContextHash(params);
  for (const memo of memos) {
    if (memo.lookupContextHash === lookupContextHash && memo.registryState) {
      return memo.registryState;
    }
  }
  const fastFingerprint = resolvePersistedRegistryFastMemoFingerprint(params);
  const fastHash = hashJson(fastFingerprint);
  const contextHash = resolvePersistedRegistryMemoContextHash({
    ...params,
    fastFingerprint,
  });
  for (const memo of memos) {
    const registryState = memo.registryState;
    if (
      registryState &&
      registryState.contextHash === contextHash &&
      registryState.fastHash === fastHash
    ) {
      return registryState;
    }
  }
  return resolvePersistedRegistryMemoState(params);
}

function resolveProvidedIndexMemoState(index: unknown): PersistedRegistryMemoState {
  const fingerprint = {
    providedIndex: resolveInstalledManifestRegistryIndexFingerprint(index),
  };
  const fingerprintHash = hashJson(fingerprint);
  return {
    contextHash: fingerprintHash,
    fastHash: fingerprintHash,
    fingerprint,
  };
}

function findPluginMetadataSnapshotMemo(key: string): PluginMetadataSnapshotMemo | undefined {
  const index = pluginMetadataSnapshotMemos.findIndex((memo) => memo.key === key);
  if (index === -1) {
    return undefined;
  }
  const [memo] = pluginMetadataSnapshotMemos.splice(index, 1);
  if (!memo) {
    return undefined;
  }
  pluginMetadataSnapshotMemos.unshift(memo);
  return memo;
}

function rememberPluginMetadataSnapshotMemo(memo: PluginMetadataSnapshotMemo): void {
  pluginMetadataSnapshotMemos = [
    memo,
    ...pluginMetadataSnapshotMemos.filter((existing) => existing.key !== memo.key),
  ].slice(0, MAX_PLUGIN_METADATA_SNAPSHOT_MEMOS);
}

function computePluginMetadataSnapshotMemoKey(params: {
  params: LoadPluginMetadataSnapshotParams;
  registryState: PersistedRegistryMemoState;
}): string {
  const { params: snapshotParams, registryState } = params;
  const env = snapshotParams.env ?? process.env;
  const indexFingerprint = snapshotParams.index
    ? resolveInstalledManifestRegistryIndexFingerprint(snapshotParams.index)
    : undefined;
  return hashJson({
    controlPlane: resolvePluginControlPlaneFingerprint({
      config: snapshotParams.config as never,
      env,
      workspaceDir: snapshotParams.workspaceDir,
      policyHash: resolveInstalledPluginIndexPolicyHash(snapshotParams.config as never),
      ...(indexFingerprint ? { inventoryFingerprint: indexFingerprint } : {}),
    }),
    cwd: process.cwd(),
    env: pickMemoRelevantEnv(env),
    index: indexFingerprint ?? null,
    pathPolicy: {
      compatibilityHostVersion: resolveCompatibilityHostVersion(env),
      nixMode: resolveIsNixMode(env),
    },
    pluginIds: serializePluginIdScope(normalizePluginIdScope(snapshotParams.pluginIds)),
    pluginIdScopeKey: snapshotParams.pluginIdScope?.key ?? null,
    preferPersisted: snapshotParams.preferPersisted ?? null,
    registry: registryState.fingerprint,
    stateDir: snapshotParams.stateDir ? resolveUserPath(snapshotParams.stateDir, env) : null,
    workspaceDir: snapshotParams.workspaceDir ?? null,
  });
}

function indexesMatch(
  left: InstalledPluginIndex | undefined,
  right: InstalledPluginIndex | undefined,
): boolean {
  if (!left || !right) {
    return true;
  }
  return (
    resolveInstalledManifestRegistryIndexFingerprint(left) ===
    resolveInstalledManifestRegistryIndexFingerprint(right)
  );
}

function cloneSnapshotInput<T>(value: T): T {
  return value && typeof value === "object" ? structuredClone(value) : value;
}

function normalizeInstalledPluginIndex(index: InstalledPluginIndex): InstalledPluginIndex {
  const idx = index as Record<string, unknown>;
  return {
    version: (idx.version as number) ?? 1,
    hostContractVersion: (idx.hostContractVersion as string) ?? "",
    compatRegistryVersion: (idx.compatRegistryVersion as string) ?? "",
    migrationVersion: (idx.migrationVersion as number) ?? 1,
    policyHash: (idx.policyHash as string) ?? "",
    generatedAtMs: (idx.generatedAtMs as number) ?? 0,
    installRecords: cloneSnapshotInput((idx.installRecords as object) ?? {}),
    plugins: ((idx.plugins as unknown[]) ?? []).map(cloneSnapshotInput),
    diagnostics: ((idx.diagnostics as unknown[]) ?? []).map(cloneSnapshotInput),
    ...(idx.warning ? { warning: idx.warning } : {}),
    ...(idx.refreshReason ? { refreshReason: idx.refreshReason } : {}),
  } as unknown as InstalledPluginIndex;
}

function resolvePluginMetadataSnapshotPluginIds(params: {
  index: InstalledPluginIndex;
  params: LoadPluginMetadataSnapshotParams;
}): string[] | undefined {
  const direct = normalizePluginIdScope(params.params.pluginIds);
  if (direct !== undefined) {
    return direct;
  }
  const scope = params.params.pluginIdScope as
    | { resolve?: (p: { index: InstalledPluginIndex }) => readonly string[] | undefined }
    | undefined;
  return normalizePluginIdScope(scope?.resolve?.({ index: params.index }));
}

export function isPluginMetadataSnapshotCompatible(params: {
  snapshot: Pick<
    PluginMetadataSnapshot,
    "configFingerprint" | "index" | "pluginIds" | "policyHash" | "workspaceDir"
  >;
  config?: unknown;
  env?: NodeJS.ProcessEnv;
  allowScopedSnapshot?: boolean;
  pluginIds?: readonly string[];
  workspaceDir?: string;
  index?: InstalledPluginIndex;
}): boolean {
  const env = params.env ?? process.env;
  const requestedPluginIds = normalizePluginIdScope(params.pluginIds);
  const snapshotPluginIds = normalizePluginIdScope(params.snapshot.pluginIds);
  const scopeMatches =
    snapshotPluginIds === undefined ||
    params.allowScopedSnapshot === true ||
    (requestedPluginIds !== undefined &&
      serializePluginIdScope(snapshotPluginIds) === serializePluginIdScope(requestedPluginIds));
  return (
    scopeMatches &&
    params.snapshot.policyHash === resolveInstalledPluginIndexPolicyHash(params.config as never) &&
    (!params.snapshot.configFingerprint ||
      params.snapshot.configFingerprint ===
        resolvePluginControlPlaneFingerprint({
          config: params.config as never,
          env,
          index: (params.index ?? params.snapshot.index) as InstalledPluginIndex | undefined,
          policyHash: params.snapshot.policyHash,
          workspaceDir: params.workspaceDir,
        })) &&
    (params.snapshot.workspaceDir ?? "") === (params.workspaceDir ?? "") &&
    indexesMatch(params.snapshot.index as InstalledPluginIndex | undefined, params.index as InstalledPluginIndex | undefined)
  );
}

function appendOwner(owners: Map<string, string[]>, ownedId: string, pluginId: string): void {
  const existing = owners.get(ownedId);
  if (existing) {
    if (existing.includes(pluginId)) {
      return;
    }
    existing.push(pluginId);
    return;
  }
  owners.set(ownedId, [pluginId]);
}

function freezeOwnerMap(owners: Map<string, string[]>): ReadonlyMap<string, readonly string[]> {
  return new Map(
    [...owners.entries()].map(([ownedId, pluginIds]) => [ownedId, Object.freeze([...pluginIds])]),
  );
}

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase();
}

function buildPluginMetadataOwnerMaps(
  plugins: readonly PluginManifestRecord[],
): PluginMetadataSnapshotOwnerMaps {
  const channels = new Map<string, string[]>();
  const channelConfigs = new Map<string, string[]>();
  const providers = new Map<string, string[]>();
  const modelCatalogProviders = new Map<string, string[]>();
  const cliBackends = new Map<string, string[]>();
  const setupProviders = new Map<string, string[]>();
  const commandAliases = new Map<string, string[]>();
  const contracts = new Map<string, string[]>();

  for (const plugin of plugins) {
    for (const channelId of plugin.channels ?? []) {
      appendOwner(channels, channelId, plugin.id);
    }
    for (const channelId of Object.keys(plugin.channelConfigs ?? {})) {
      appendOwner(channelConfigs, channelId, plugin.id);
    }
    for (const providerId of plugin.providers ?? []) {
      appendOwner(providers, providerId, plugin.id);
    }
    for (const [rawAlias, target] of Object.entries(plugin.providerAuthAliases ?? {})) {
      const alias = normalizeProviderId(rawAlias);
      const targetProvider = normalizeProviderId(target);
      if (
        alias &&
        targetProvider &&
        (plugin.providers ?? []).some(
          (providerId) => normalizeProviderId(providerId) === targetProvider,
        )
      ) {
        appendOwner(providers, alias, plugin.id);
      }
    }
    for (const providerId of Object.keys((plugin.modelCatalog as { providers?: Record<string, unknown> } | undefined)?.providers ?? {})) {
      appendOwner(modelCatalogProviders, providerId, plugin.id);
    }
    for (const providerId of Object.keys((plugin.modelCatalog as { aliases?: Record<string, unknown> } | undefined)?.aliases ?? {})) {
      appendOwner(modelCatalogProviders, providerId, plugin.id);
    }
    for (const cliBackendId of plugin.cliBackends ?? []) {
      appendOwner(cliBackends, cliBackendId, plugin.id);
    }
    for (const cliBackendId of plugin.setup?.cliBackends ?? []) {
      appendOwner(cliBackends, cliBackendId, plugin.id);
    }
    for (const setupProvider of plugin.setup?.providers ?? []) {
      appendOwner(setupProviders, setupProvider.id, plugin.id);
    }
    for (const commandAlias of plugin.commandAliases ?? []) {
      appendOwner(commandAliases, commandAlias.name, plugin.id);
    }
    for (const [contract, values] of Object.entries(plugin.contracts ?? {})) {
      if (Array.isArray(values) && values.length > 0) {
        appendOwner(contracts, contract, plugin.id);
      }
    }
  }

  return {
    channels: freezeOwnerMap(channels),
    channelConfigs: freezeOwnerMap(channelConfigs),
    providers: freezeOwnerMap(providers),
    modelCatalogProviders: freezeOwnerMap(modelCatalogProviders),
    cliBackends: freezeOwnerMap(cliBackends),
    setupProviders: freezeOwnerMap(setupProviders),
    commandAliases: freezeOwnerMap(commandAliases),
    contracts: freezeOwnerMap(contracts),
  };
}

export function listPluginOriginsFromMetadataSnapshot(
  snapshot: Pick<PluginMetadataSnapshot, "plugins">,
): ReadonlyMap<string, PluginManifestRecord["origin"]> {
  return new Map(
    snapshot.plugins.map((record) => [
      String((record as { id?: string }).id ?? (record as { pluginId?: string }).pluginId ?? ""),
      (record as { origin?: PluginManifestRecord["origin"] }).origin ?? "bundled",
    ]),
  ) as ReadonlyMap<string, PluginManifestRecord["origin"]>;
}

export function loadPluginMetadataSnapshot(
  params: LoadPluginMetadataSnapshotParams,
): PluginMetadataSnapshot {
  const activeTimelineSpan = getActiveDiagnosticsTimelineSpan();
  const env = params.env ?? process.env;
  const registryState = params.index
    ? resolveProvidedIndexMemoState(params.index)
    : resolvePersistedRegistryMemoStateForLookup(
        {
          env,
          ...(params.stateDir ? { stateDir: resolveUserPath(params.stateDir, env) } : {}),
          ...(params.preferPersisted !== undefined
            ? { preferPersisted: params.preferPersisted }
            : {}),
        },
        pluginMetadataSnapshotMemos,
      );
  const memoKey = computePluginMetadataSnapshotMemoKey({ params, registryState });
  const memo = findPluginMetadataSnapshotMemo(memoKey);
  if (memo?.key === memoKey) {
    return measureDiagnosticsTimelineSpanSync(
      "plugins.metadata.scan",
      () => memo.snapshot,
      {
        phase: activeTimelineSpan?.phase ?? "startup",
        config: params.config as never,
        env: params.env,
        attributes: {
          cacheHit: true,
          hasWorkspaceDir: params.workspaceDir !== undefined,
          hasInstalledIndex: params.index !== undefined,
        },
      },
    );
  }

  const result = measureDiagnosticsTimelineSpanSync(
    "plugins.metadata.scan",
    () => loadPluginMetadataSnapshotImpl(params),
    {
      phase: activeTimelineSpan?.phase ?? "startup",
      config: params.config as never,
      env: params.env,
      attributes: {
        hasWorkspaceDir: params.workspaceDir !== undefined,
        hasInstalledIndex: params.index !== undefined,
      },
    },
  );
  const snapshot = freezePluginMetadataSnapshot(result.snapshot);
  if (canMemoizePluginMetadataSnapshotResult(result)) {
    rememberPluginMetadataSnapshotMemo({
      key: memoKey,
      lookupContextHash: resolvePersistedRegistryMemoLookupContextHash({
        env,
        ...(params.stateDir ? { stateDir: resolveUserPath(params.stateDir, env) } : {}),
        ...(params.preferPersisted !== undefined
          ? { preferPersisted: params.preferPersisted }
          : {}),
      }),
      registryState,
      snapshot,
    });
  }
  return snapshot;
}

function canMemoizePluginMetadataSnapshotResult(result: {
  registrySource: PluginRegistrySnapshotSource;
  snapshot: PluginMetadataSnapshot;
}): boolean {
  const snapshot = result.snapshot;
  const hasCompleteSnapshotShape =
    Array.isArray(snapshot.plugins) &&
    Array.isArray(snapshot.diagnostics) &&
    Array.isArray(snapshot.registryDiagnostics) &&
    Array.isArray((snapshot.manifestRegistry as { plugins?: unknown[] })?.plugins ?? []) &&
    Array.isArray((snapshot.manifestRegistry as { diagnostics?: unknown[] })?.diagnostics ?? []) &&
    Array.isArray((snapshot.index as { plugins?: unknown[] })?.plugins ?? []) &&
    Array.isArray((snapshot.index as { diagnostics?: unknown[] })?.diagnostics ?? []);
  const hasPluginMetadata = snapshot.plugins.length > 0 || (snapshot.index as { plugins?: unknown[] }).plugins!.length > 0;
  return hasCompleteSnapshotShape && hasPluginMetadata;
}

export function resolvePluginMetadataSnapshot(
  params: ResolvePluginMetadataSnapshotParams,
): PluginMetadataSnapshot {
  const canUseCurrentSnapshot =
    params.allowCurrent !== false &&
    params.stateDir === undefined &&
    params.preferPersisted !== false;
  if (canUseCurrentSnapshot) {
    const current = getCurrentPluginMetadataSnapshot({
      config: params.config,
      env: params.env,
      ...(params.pluginIds !== undefined ? { pluginIds: params.pluginIds } : {}),
      ...(params.pluginIdScope !== undefined ? { pluginIdScope: params.pluginIdScope } : {}),
      ...(params.workspaceDir !== undefined ? { workspaceDir: params.workspaceDir } : {}),
      ...(params.allowWorkspaceScopedCurrent === true
        ? { allowWorkspaceScopedSnapshot: true }
        : {}),
    });
    if (!current) {
      return loadPluginMetadataSnapshot(params);
    }
    if (!params.index) {
      return current;
    }
    if (
      isPluginMetadataSnapshotCompatible({
        snapshot: current,
        config: params.config as never,
        env: params.env,
        allowScopedSnapshot: params.pluginIds !== undefined || params.pluginIdScope !== undefined,
        workspaceDir:
          params.workspaceDir ??
          (params.allowWorkspaceScopedCurrent === true ? current.workspaceDir : undefined),
        index: params.index as InstalledPluginIndex | undefined,
      })
    ) {
      return current;
    }
  }
  return loadPluginMetadataSnapshot(params);
}

function loadPluginMetadataSnapshotImpl(params: LoadPluginMetadataSnapshotParams): {
  snapshot: PluginMetadataSnapshot;
  registrySource: PluginRegistrySnapshotSource;
} {
  const totalStartedAt = performance.now();
  const registryStartedAt = performance.now();
  const registryResult = loadPluginRegistrySnapshotWithMetadata({
    config: params.config as never,
    workspaceDir: params.workspaceDir,
    ...(params.stateDir ? { stateDir: params.stateDir } : {}),
    env: params.env,
    ...(params.preferPersisted !== undefined ? { preferPersisted: params.preferPersisted } : {}),
    ...(params.index ? { index: params.index as InstalledPluginIndex } : {}),
  });
  const registrySnapshotMs = performance.now() - registryStartedAt;
  const index = normalizeInstalledPluginIndex(registryResult.snapshot);
  const pluginIds = resolvePluginMetadataSnapshotPluginIds({ params, index });
  const manifestStartedAt = performance.now();
  const indexPlugins = (index as unknown as { plugins?: unknown[] }).plugins ?? [];
  const manifestRegistry =
    indexPlugins.length === 0
      ? loadPluginManifestRegistry({
          config: params.config,
          workspaceDir: params.workspaceDir,
          env: params.env,
        })
      : loadPluginManifestRegistryForInstalledIndex({
          index,
          config: params.config,
          workspaceDir: params.workspaceDir,
          env: params.env,
          ...(pluginIds !== undefined ? { pluginIds } : {}),
          includeDisabled: true,
        });
  const manifestRegistryMs = performance.now() - manifestStartedAt;
  const normalizePluginId = createPluginRegistryIdNormalizer(index, { manifestRegistry: manifestRegistry as never });
  const byPluginId = new Map(manifestRegistry.plugins.map((plugin) => [plugin.id, plugin]));
  const ownerMapsStartedAt = performance.now();
  const owners = buildPluginMetadataOwnerMaps(manifestRegistry.plugins);
  const ownerMapsMs = performance.now() - ownerMapsStartedAt;
  const totalMs = performance.now() - totalStartedAt;

  return {
    registrySource: registryResult.source,
    snapshot: {
      policyHash: index.policyHash,
      registrySource: registryResult.source,
      configFingerprint: resolvePluginControlPlaneFingerprint({
        config: params.config as never,
        env: params.env,
        index,
        policyHash: index.policyHash,
        workspaceDir: params.workspaceDir,
      }),
      ...(pluginIds !== undefined ? { pluginIds } : {}),
      ...(params.workspaceDir ? { workspaceDir: params.workspaceDir } : {}),
      index,
      registryDiagnostics: registryResult.diagnostics as never,
      manifestRegistry: manifestRegistry as never,
      plugins: manifestRegistry.plugins,
      diagnostics: manifestRegistry.diagnostics as never,
      byPluginId,
      normalizePluginId,
      owners,
      metrics: {
        registrySnapshotMs,
        manifestRegistryMs,
        ownerMapsMs,
        totalMs,
        indexPluginCount: indexPlugins.length,
        manifestPluginCount: manifestRegistry.plugins.length,
      },
      discovery: registryResult.discovery,
    } as unknown as PluginMetadataSnapshot,
  };
}
