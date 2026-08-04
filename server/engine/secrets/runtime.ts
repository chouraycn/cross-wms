/** Prepares secrets runtime snapshots from config, auth stores, plugins, and env. */
import { isDeepStrictEqual } from "node:util";
import { uniqueStrings } from "@cdf-know/normalization-core/string-normalization";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope-config.js";
import {
  clearRuntimeAuthProfileStoreSnapshots,
  loadAuthProfileStoreForSecretsRuntime,
  loadAuthProfileStoreWithoutExternalProfiles,
} from "../agents/auth-profiles.js";
import type { AuthProfileStore } from "../agents/auth-profiles/types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { PluginManifestRegistry } from "../plugins/manifest-registry.js";
import type { PluginMetadataSnapshot } from "../plugins/plugin-metadata-snapshot.js";
import type { PluginOrigin } from "../plugins/plugin-origin.types.js";
import { resolveUserPath } from "../utils.js";
import {
  canUseSecretsRuntimeFastPath,
  collectCandidateAgentDirs,
  createEmptyRuntimeWebToolsMetadata,
  mergeSecretsRuntimeEnv,
  resolveRefreshAgentDirs,
} from "./runtime-fast-path.js";
import {
  activateSecretsRuntimeSnapshotState,
  clearSecretsRuntimeSnapshot as clearSecretsRuntimeSnapshotState,
  getActiveSecretsRuntimeEnv as getActiveSecretsRuntimeEnvState,
  getActiveSecretsRuntimeRefreshContext,
  getActiveSecretsRuntimeSnapshot as getActiveSecretsRuntimeSnapshotState,
  getLiveSecretsRuntimeAuthStores,
  getPreparedSecretsRuntimeSnapshotRefreshContext,
  registerSecretsRuntimeStateClearHook,
  setPreparedSecretsRuntimeSnapshotRefreshContext,
  type PreparedSecretsRuntimeSnapshot,
  type SecretsRuntimeRefreshContext,
} from "./runtime-state.js";
import { getActiveRuntimeWebToolsMetadata as getActiveRuntimeWebToolsMetadataFromState } from "./runtime-web-tools-state.js";
import type { RuntimeWebToolsMetadata } from "./runtime-web-tools.types.js";

export type { SecretResolverWarning } from "./runtime-shared.js";
export type { PreparedSecretsRuntimeSnapshot } from "./runtime-state.js";

// ============== cross-wms SecretsRuntime (storage-level runtime) ==============
import { logger } from "../../logger.js";
import { onCacheInvalidate } from "./store.js";
import {
  resolveSecretRef,
  resolveSecretRefAsync,
  resolveTemplate as resolveTemplateBase,
  resolveWithFallback,
} from "./resolver.js";
import type { ProviderRegistry } from "./provider.js";
import type {
  SecretRef,
  SecretCacheEntry,
  SecretsRuntimeConfig,
  SecretsStats,
  ResolvedSecret,
  SecretProvider,
} from "./types.js";

registerSecretsRuntimeStateClearHook(clearRuntimeAuthProfileStoreSnapshots);

let runtimeManifestPromise: Promise<typeof import("./runtime-manifest.runtime.js")> | null = null;
let runtimePreparePromise: Promise<typeof import("./runtime-prepare.runtime.js")> | null = null;

function loadRuntimeManifestHelpers() {
  runtimeManifestPromise ??= import("./runtime-manifest.runtime.js");
  return runtimeManifestPromise;
}

function loadRuntimePrepareHelpers() {
  runtimePreparePromise ??= import("./runtime-prepare.runtime.js");
  return runtimePreparePromise;
}

async function resolveLoadablePluginOrigins(params: {
  config: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  pluginMetadataSnapshot?: Pick<PluginMetadataSnapshot, "plugins">;
}): Promise<ReadonlyMap<string, PluginOrigin>> {
  const workspaceDir = resolveAgentWorkspaceDir(
    params.config,
    resolveDefaultAgentId(params.config),
  );
  const { listPluginOriginsFromMetadataSnapshot, loadPluginMetadataSnapshot } =
    await loadRuntimeManifestHelpers();
  const snapshot =
    params.pluginMetadataSnapshot ??
    loadPluginMetadataSnapshot({
      config: params.config,
      workspaceDir,
      env: params.env,
    });
  return listPluginOriginsFromMetadataSnapshot(snapshot);
}

function hasConfiguredPluginEntries(config: OpenClawConfig): boolean {
  const entries = config.plugins?.entries;
  return (
    Boolean(entries) &&
    typeof entries === "object" &&
    !Array.isArray(entries) &&
    Object.keys(entries).length > 0
  );
}

function hasConfiguredChannelEntries(config: OpenClawConfig): boolean {
  const channels = config.channels;
  return (
    Boolean(channels) &&
    typeof channels === "object" &&
    !Array.isArray(channels) &&
    Object.keys(channels).some((channelId) => channelId !== "defaults")
  );
}

function hasConfiguredPluginIntegrationSecretProviders(config: OpenClawConfig): boolean {
  const providers = config.secrets?.providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    return false;
  }
  return Object.values(providers).some(
    (provider) =>
      provider?.source === "exec" &&
      "pluginIntegration" in provider &&
      provider.pluginIntegration !== undefined,
  );
}

function shouldLoadPluginMetadataForSecrets(config: OpenClawConfig): boolean {
  return (
    hasConfiguredPluginEntries(config) ||
    hasConfiguredChannelEntries(config) ||
    hasConfiguredPluginIntegrationSecretProviders(config)
  );
}

/** Prepares a secrets runtime snapshot and records refresh context for later activation. */
export async function prepareSecretsRuntimeSnapshot(params: {
  config: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  agentDirs?: string[];
  includeAuthStoreRefs?: boolean;
  loadAuthStore?: (agentDir?: string) => AuthProfileStore;
  manifestRegistry?: Pick<PluginManifestRegistry, "plugins">;
  pluginMetadataSnapshot?: Pick<PluginMetadataSnapshot, "plugins" | "manifestRegistry">;
  /** Test override for discovered loadable plugins and their origins. */
  loadablePluginOrigins?: ReadonlyMap<string, PluginOrigin>;
}): Promise<PreparedSecretsRuntimeSnapshot> {
  const runtimeEnv = mergeSecretsRuntimeEnv(params.env);
  const sourceConfig = structuredClone(params.config);
  const resolvedConfig = structuredClone(params.config);
  const includeAuthStoreRefs = params.includeAuthStoreRefs ?? true;
  let authStores: Array<{ agentDir: string; store: AuthProfileStore }> = [];
  const fastPathLoadAuthStore = params.loadAuthStore ?? loadAuthProfileStoreWithoutExternalProfiles;
  const candidateDirs = params.agentDirs?.length
    ? uniqueStrings(params.agentDirs.map((entry) => resolveUserPath(entry, runtimeEnv)))
    : collectCandidateAgentDirs(resolvedConfig, runtimeEnv);
  if (includeAuthStoreRefs) {
    for (const agentDir of candidateDirs) {
      authStores.push({
        agentDir,
        store: structuredClone(fastPathLoadAuthStore(agentDir)),
      });
    }
  }
  if (canUseSecretsRuntimeFastPath({ sourceConfig, authStores })) {
    const manifestRegistry =
      params.manifestRegistry ?? params.pluginMetadataSnapshot?.manifestRegistry;
    const snapshot = {
      sourceConfig,
      config: resolvedConfig,
      authStores,
      warnings: [],
      webTools: createEmptyRuntimeWebToolsMetadata(),
    };
    setPreparedSecretsRuntimeSnapshotRefreshContext(snapshot, {
      env: runtimeEnv,
      explicitAgentDirs: params.agentDirs?.length ? [...candidateDirs] : null,
      includeAuthStoreRefs,
      loadAuthStore: fastPathLoadAuthStore,
      loadablePluginOrigins: params.loadablePluginOrigins ?? new Map<string, PluginOrigin>(),
      ...(manifestRegistry ? { manifestRegistry } : {}),
    });
    return snapshot;
  }

  const {
    applyResolvedAssignments,
    collectAuthStoreAssignments,
    collectConfigAssignments,
    createResolverContext,
    resolveRuntimeWebTools,
    resolveSecretRefValues,
  } = await loadRuntimePrepareHelpers();
  const manifestRegistry =
    params.manifestRegistry ?? params.pluginMetadataSnapshot?.manifestRegistry;
  const loadablePluginOrigins =
    params.loadablePluginOrigins ??
    (shouldLoadPluginMetadataForSecrets(sourceConfig)
      ? await resolveLoadablePluginOrigins({
          config: sourceConfig,
          env: runtimeEnv,
          pluginMetadataSnapshot:
            params.pluginMetadataSnapshot ??
            (manifestRegistry ? { plugins: manifestRegistry.plugins } : undefined),
        })
      : new Map<string, PluginOrigin>());
  const context = createResolverContext({
    sourceConfig,
    env: runtimeEnv,
    ...(manifestRegistry ? { manifestRegistry } : {}),
  });

  collectConfigAssignments({
    config: resolvedConfig,
    context,
    loadablePluginOrigins,
  });

  if (includeAuthStoreRefs) {
    const loadAuthStore = params.loadAuthStore ?? loadAuthProfileStoreForSecretsRuntime;
    if (!params.loadAuthStore) {
      authStores = candidateDirs.map((agentDir) => ({
        agentDir,
        store: structuredClone(loadAuthStore(agentDir)),
      }));
    }
    for (const entry of authStores) {
      collectAuthStoreAssignments({
        store: entry.store,
        context,
        agentDir: entry.agentDir,
      });
    }
  }

  if (context.assignments.length > 0) {
    const refs = context.assignments.map((assignment) => assignment.ref);
    const resolved = await resolveSecretRefValues(refs, {
      config: sourceConfig,
      env: context.env,
      cache: context.cache,
      manifestRegistry: context.manifestRegistry,
    });
    applyResolvedAssignments({
      assignments: context.assignments,
      resolved,
    });
  }

  const snapshot = {
    sourceConfig,
    config: resolvedConfig,
    authStores,
    warnings: context.warnings,
    webTools: await resolveRuntimeWebTools({
      sourceConfig,
      resolvedConfig,
      context,
    }),
  };
  setPreparedSecretsRuntimeSnapshotRefreshContext(snapshot, {
    env: runtimeEnv,
    explicitAgentDirs: params.agentDirs?.length ? [...candidateDirs] : null,
    includeAuthStoreRefs,
    loadAuthStore: params.loadAuthStore ?? loadAuthProfileStoreForSecretsRuntime,
    loadablePluginOrigins,
    ...(manifestRegistry ? { manifestRegistry } : {}),
  });
  return snapshot;
}

/** Activates a prepared secrets runtime snapshot for fast runtime lookup. */
export function activateSecretsRuntimeSnapshot(snapshot: PreparedSecretsRuntimeSnapshot): void {
  const refreshContext =
    getPreparedSecretsRuntimeSnapshotRefreshContext(snapshot) ??
    getActiveSecretsRuntimeRefreshContext() ??
    ({
      env: { ...process.env } as Record<string, string | undefined>,
      explicitAgentDirs: null,
      includeAuthStoreRefs: snapshot.authStores.length > 0,
      loadAuthStore: loadAuthProfileStoreForSecretsRuntime,
      loadablePluginOrigins: new Map<string, PluginOrigin>(),
    } satisfies SecretsRuntimeRefreshContext);
  const coercePreflightSnapshot = (
    value: unknown,
    sourceConfig: OpenClawConfig,
  ): PreparedSecretsRuntimeSnapshot | null => {
    if (!value || typeof value !== "object") {
      return null;
    }
    const candidate = value as PreparedSecretsRuntimeSnapshot;
    return isDeepStrictEqual(candidate.sourceConfig, sourceConfig) ? candidate : null;
  };
  activateSecretsRuntimeSnapshotState({
    snapshot,
    refreshContext,
    refreshHandler: {
      preflight: async ({ sourceConfig, includeAuthStoreRefs }) => {
        const activeRefreshContext = getActiveSecretsRuntimeRefreshContext();
        const activeSnapshot = getActiveSecretsRuntimeSnapshotState();
        if (!activeSnapshot || !activeRefreshContext) {
          return false;
        }
        return await prepareSecretsRuntimeSnapshot({
          config: sourceConfig,
          env: activeRefreshContext.env,
          agentDirs: resolveRefreshAgentDirs(sourceConfig, activeRefreshContext),
          includeAuthStoreRefs: includeAuthStoreRefs ?? activeRefreshContext.includeAuthStoreRefs,
          loadablePluginOrigins: activeRefreshContext.loadablePluginOrigins,
          ...(activeRefreshContext.manifestRegistry
            ? { manifestRegistry: activeRefreshContext.manifestRegistry }
            : {}),
          ...(activeRefreshContext.loadAuthStore
            ? { loadAuthStore: activeRefreshContext.loadAuthStore }
            : {}),
        });
      },
      refresh: async ({ sourceConfig, includeAuthStoreRefs, preflightResult }) => {
        const activeRefreshContext = getActiveSecretsRuntimeRefreshContext();
        const activeSnapshot = getActiveSecretsRuntimeSnapshotState();
        if (!activeSnapshot || !activeRefreshContext) {
          return false;
        }
        const oneShotSkipAuthStoreRefs =
          includeAuthStoreRefs === false && activeRefreshContext.includeAuthStoreRefs;
        const refreshed =
          coercePreflightSnapshot(preflightResult, sourceConfig) ??
          (await prepareSecretsRuntimeSnapshot({
            config: sourceConfig,
            env: activeRefreshContext.env,
            agentDirs: resolveRefreshAgentDirs(sourceConfig, activeRefreshContext),
            includeAuthStoreRefs: includeAuthStoreRefs ?? activeRefreshContext.includeAuthStoreRefs,
            loadablePluginOrigins: activeRefreshContext.loadablePluginOrigins,
            ...(activeRefreshContext.manifestRegistry
              ? { manifestRegistry: activeRefreshContext.manifestRegistry }
              : {}),
            ...(activeRefreshContext.loadAuthStore
              ? { loadAuthStore: activeRefreshContext.loadAuthStore }
              : {}),
          }));
        if (oneShotSkipAuthStoreRefs) {
          refreshed.authStores = getLiveSecretsRuntimeAuthStores();
          setPreparedSecretsRuntimeSnapshotRefreshContext(refreshed, activeRefreshContext);
        }
        activateSecretsRuntimeSnapshot(refreshed);
        return true;
      },
    },
  });
}

export async function refreshActiveSecretsRuntimeSnapshot(): Promise<boolean> {
  const activeSnapshot = getActiveSecretsRuntimeSnapshotState();
  const activeRefreshContext = getActiveSecretsRuntimeRefreshContext();
  if (!activeSnapshot || !activeRefreshContext) {
    return false;
  }
  const refreshed = await prepareSecretsRuntimeSnapshot({
    config: activeSnapshot.sourceConfig,
    env: activeRefreshContext.env,
    agentDirs: resolveRefreshAgentDirs(activeSnapshot.sourceConfig, activeRefreshContext),
    includeAuthStoreRefs: activeRefreshContext.includeAuthStoreRefs,
    loadablePluginOrigins: activeRefreshContext.loadablePluginOrigins,
    ...(activeRefreshContext.manifestRegistry
      ? { manifestRegistry: activeRefreshContext.manifestRegistry }
      : {}),
    ...(activeRefreshContext.loadAuthStore
      ? { loadAuthStore: activeRefreshContext.loadAuthStore }
      : {}),
  });
  activateSecretsRuntimeSnapshot(refreshed);
  return true;
}

export function getActiveSecretsRuntimeSnapshot(): PreparedSecretsRuntimeSnapshot | null {
  return getActiveSecretsRuntimeSnapshotState();
}

export function getActiveSecretsRuntimeEnv(): NodeJS.ProcessEnv {
  return getActiveSecretsRuntimeEnvState();
}

export function getActiveRuntimeWebToolsMetadata(): RuntimeWebToolsMetadata | null {
  return getActiveRuntimeWebToolsMetadataFromState();
}

export function clearSecretsRuntimeSnapshot(): void {
  clearSecretsRuntimeSnapshotState();
}

// ============== cross-wms SecretsRuntime class ==============

/** 默认缓存 TTL：5 分钟 */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/** 运行时选项 */
export interface SecretsRuntimeOptions {
  /** Provider 注册表 */
  registry: ProviderRegistry;
  /** 缓存 TTL（毫秒） */
  cacheTtlMs?: number;
  /** 访问来源标识 */
  source?: string;
  /** 是否启用缓存（默认 true） */
  enableCache?: boolean;
}

/** 统计计数器 */
interface RuntimeStats {
  hits: number;
  misses: number;
  resolves: number;
  errors: number;
  invalidations: number;
  lastUpdated: number;
}

/**
 * 密钥运行时
 *
 * 封装解析 + 缓存 + 失效 + 统计能力，是上层应用访问密钥的统一入口。
 */
export class SecretsRuntime {
  private readonly registry: ProviderRegistry;
  private readonly cacheTtlMs: number;
  private readonly source: string;
  private readonly enableCache: boolean;
  private readonly cache = new Map<string, SecretCacheEntry>();
  private readonly stats: RuntimeStats = {
    hits: 0,
    misses: 0,
    resolves: 0,
    errors: 0,
    invalidations: 0,
    lastUpdated: Date.now(),
  };
  private sessionId: string | undefined;
  private activeSecrets: SecretRef[] = [];
  private snapshotTime = 0;
  private invalidateRegistered = false;

  constructor(options: SecretsRuntimeOptions) {
    this.registry = options.registry;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.source = options.source ?? 'runtime';
    this.enableCache = options.enableCache ?? true;
  }

  setSession(sessionId: string): void {
    this.sessionId = sessionId;
    this.snapshotTime = Date.now();
    logger.debug('[SecretsRuntime] 会话已设置', { sessionId });
  }

  setActiveSecrets(refs: SecretRef[]): void {
    this.activeSecrets = [...refs];
    this.snapshotTime = Date.now();
  }

  snapshot(): SecretsRuntimeConfig {
    return {
      activeSecrets: [...this.activeSecrets],
      snapshotTime: this.snapshotTime || Date.now(),
      sessionId: this.sessionId ?? '',
    };
  }

  get(ref: SecretRef): string | null {
    const cacheKey = this.cacheKey(ref);
    const cached = this.getFromCache(cacheKey);
    if (cached !== null) {
      this.stats.hits++;
      return cached;
    }

    this.stats.misses++;
    const resolved = resolveSecretRef(ref, this.registry, this.source);
    if (resolved === null) {
      this.stats.errors++;
      return null;
    }

    this.stats.resolves++;
    this.putToCache(cacheKey, resolved.value);
    return resolved.value;
  }

  async getAsync(ref: SecretRef): Promise<string | null> {
    const cacheKey = this.cacheKey(ref);
    const cached = this.getFromCache(cacheKey);
    if (cached !== null) {
      this.stats.hits++;
      return cached;
    }

    this.stats.misses++;
    const resolved = await resolveSecretRefAsync(ref, this.registry, this.source);
    if (resolved === null) {
      this.stats.errors++;
      return null;
    }

    this.stats.resolves++;
    this.putToCache(cacheKey, resolved.value);
    return resolved.value;
  }

  getWithFallback(refs: SecretRef[]): string | null {
    if (refs.length === 0) return null;

    for (const ref of refs) {
      const cacheKey = this.cacheKey(ref);
      const cached = this.getFromCache(cacheKey);
      if (cached !== null) {
        this.stats.hits++;
        return cached;
      }
    }

    this.stats.misses++;
    const resolved = resolveWithFallback(refs, this.registry, this.source);
    if (resolved === null) {
      this.stats.errors++;
      return null;
    }

    this.stats.resolves++;
    this.putToCache(this.cacheKey(resolved.ref), resolved.value);
    return resolved.value;
  }

  resolveTemplate(template: string): string {
    return resolveTemplateBase(template, this.registry, this.source);
  }

  invalidate(provider: SecretProvider, key: string): void {
    const cacheKey = `${provider}:${key}`;
    if (this.cache.delete(cacheKey)) {
      this.stats.invalidations++;
      logger.debug('[SecretsRuntime] 缓存已失效', { provider, key });
    }
  }

  invalidateAll(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.invalidations += size;
    logger.debug('[SecretsRuntime] 全部缓存已失效', { size });
  }

  registerStoreInvalidation(): void {
    if (this.invalidateRegistered) return;
    onCacheInvalidate((provider, key) => this.invalidate(provider, key));
    this.invalidateRegistered = true;
  }

  getStats(): SecretsStats {
    const total = this.stats.hits + this.stats.misses;
    const cacheHitRate = total > 0 ? this.stats.hits / total : 0;
    return {
      totalSecrets: this.cache.size,
      byProvider: this.countByProvider(),
      byType: {},
      cacheHitRate,
      lastUpdated: this.stats.lastUpdated,
    };
  }

  getRawStats(): RuntimeStats {
    return { ...this.stats };
  }

  private cacheKey(ref: SecretRef): string {
    return `${ref.provider}:${ref.key}`;
  }

  private getFromCache(cacheKey: string): string | null {
    if (!this.enableCache) return null;
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    const now = Date.now();
    if (entry.expiresAt !== undefined && now >= entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }
    return entry.value;
  }

  private putToCache(cacheKey: string, value: string): void {
    if (!this.enableCache) return;
    const now = Date.now();
    const entry: SecretCacheEntry = {
      value,
      cachedAt: now,
      expiresAt: this.cacheTtlMs > 0 ? now + this.cacheTtlMs : undefined,
    };
    this.cache.set(cacheKey, entry);
    this.stats.lastUpdated = now;
  }

  private countByProvider(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const key of this.cache.keys()) {
      const provider = key.split(':')[0];
      counts[provider] = (counts[provider] ?? 0) + 1;
    }
    return counts;
  }
}

/**
 * 判断解析结果是否命中缓存
 */
export function isResolvedFromCache(resolved: ResolvedSecret): boolean {
  return resolved.cached === true;
}

/** 默认缓存 TTL 常量（导出供测试与外部配置引用） */
export const DEFAULT_RUNTIME_CACHE_TTL_MS = DEFAULT_CACHE_TTL_MS;
