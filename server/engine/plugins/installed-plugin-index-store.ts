/** Persists, inspects, and refreshes the installed plugin index in the state database. */
//
// 移植自 openclaw/src/plugins/installed-plugin-index-store.ts。
//
// 降级策略：
//  - 原文件依赖 ../infra/prototype-keys.js 的 isBlockedObjectKey。改用 cross-wms 的
//    ../infra/prototype-keys.js，已提供同名导出。
//  - 原文件依赖 ../state/openclaw-state-db.js 的 openOpenClawStateDatabase 与
//    runOpenClawStateWriteTransaction。cross-wms 尚未移植该模块。这里降级为：
//    SQLite 读取始终返回 null（触发回退到 recovered managed npm install records），
//    SQLite 写入静默成功但不持久化（仅清空 in-memory 缓存）。
//  - 原文件依赖 ../utils/zod-parse.js 的 safeParseWithSchema。cross-wms 尚未移植
//    该模块。这里内联降级实现：使用 zod schema 的 safeParse，失败时返回 null。
//  - 原文件依赖 ../version.js 的 resolveCompatibilityHostVersion。cross-wms 尚未
//    移植该模块。这里内联降级实现：从 env.OPENCLAW_HOST_VERSION 读取，回退到 "unknown"
//    （与 installed-plugin-index.ts 中占位一致）。
//  - 原文件依赖 ./config-state.js 的 normalizePluginsConfig 与 resolveEffectiveEnableState。
//    cross-wms 尚未移植该模块。这里内联降级实现：与 installed-plugin-index-record-builder.ts
//    中占位一致。
//  - 原文件依赖 ./default-enablement.js、./installed-plugin-index-hash.js、
//    ./installed-plugin-index-policy.js、./installed-plugin-index-record-cache.js、
//    ./installed-plugin-index-store-path.js、./installed-plugin-index-invalidation.js、
//    ./installed-plugin-index-install-records.js、./installed-plugin-index-config-path-scope.js、
//    ./installed-plugin-index-types.js、./installed-plugin-index.js。这些模块在 cross-wms 中
//    已存在或在本批移植中创建降级版，直接引用。
//  - 原文件依赖 ./plugin-metadata-lifecycle.js 的 clearPluginMetadataLifecycleCaches。
//    cross-wms 尚未移植该模块。这里降级为 no-op（不清理任何缓存）。
//  - 行为契约保持一致：当 cross-wms 未来移植 state-db 与 plugin-metadata-lifecycle 时，
//    可直接替换本地降级实现。

import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { isBlockedObjectKey } from "../infra/prototype-keys.js";
import {
  resolveInstalledPluginIndexStateDatabaseOptions,
  resolveInstalledPluginIndexStorePath,
  type InstalledPluginIndexStoreOptions,
} from "./installed-plugin-index-store-path.js";
import { diffInstalledPluginIndexInvalidationReasons } from "./installed-plugin-index-invalidation.js";
import { extractPluginInstallRecordsFromInstalledPluginIndex } from "./installed-plugin-index-install-records.js";
import { hasMissingConfigPathActivationMetadata } from "./installed-plugin-index-config-path-scope.js";
import {
  INSTALLED_PLUGIN_INDEX_WARNING,
  INSTALLED_PLUGIN_INDEX_VERSION,
  INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION,
  loadInstalledPluginIndex,
  refreshInstalledPluginIndex,
  resolveInstalledPluginIndexPolicyHash,
  type InstalledPluginIndex,
  type InstalledPluginIndexRefreshReason,
  type LoadInstalledPluginIndexParams,
  type RefreshInstalledPluginIndexParams,
} from "./installed-plugin-index.js";
import { hashJson } from "./installed-plugin-index-hash.js";
import { resolveCompatRegistryVersion } from "./installed-plugin-index-policy.js";
import { clearLoadInstalledPluginIndexInstallRecordsCache } from "./installed-plugin-index-record-cache.js";
import { isPluginEnabledByDefaultForPlatform } from "./default-enablement.js";

export {
  resolveInstalledPluginIndexStorePath,
  resolveLegacyInstalledPluginIndexStorePath,
  type InstalledPluginIndexStoreOptions,
} from "./installed-plugin-index-store-path.js";

// ============================================================================
// 内联降级类型占位
// ============================================================================

/**
 * 插件安装记录信息（降级占位）。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的完整配置类型层级。
 * 这里使用 Record<string, unknown> 占位。
 */
type InstalledPluginInstallRecordInfo = Record<string, unknown>;

// ============================================================================
// 内联降级：../utils/zod-parse.js —— safeParseWithSchema
// ============================================================================

/**
 * 使用 zod schema 安全解析输入（降级占位）。
 *
 * 降级说明：cross-wms 的 utils/zod-parse.js 尚未移植。openclaw 原版封装了
 * zod 的 safeParse 并在失败时记录日志。这里降级为直接调用 schema.safeParse，
 * 成功时返回 data，失败时返回 null。
 */
function safeParseWithSchema<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

// ============================================================================
// 内联降级：../version.js —— resolveCompatibilityHostVersion
// ============================================================================

function resolveCompatibilityHostVersion(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv =
    typeof env.OPENCLAW_HOST_VERSION === "string" ? env.OPENCLAW_HOST_VERSION.trim() : "";
  return fromEnv || "unknown";
}

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

function resolveEffectiveEnableState(_params: {
  id: string;
  origin: string;
  config: NormalizedPluginsConfig;
  rootConfig?: unknown;
  enabledByDefault?: boolean;
}): EffectiveEnableState {
  return { enabled: true };
}

// ============================================================================
// 内联降级：./plugin-metadata-lifecycle.js —— clearPluginMetadataLifecycleCaches
// ============================================================================

/**
 * 清理插件元数据生命周期缓存（降级占位）。
 *
 * 降级说明：cross-wms 的 plugin-metadata-lifecycle.js 尚未移植。openclaw 原版
 * 清理 plugin metadata snapshot 缓存。这里降级为 no-op。
 */
function clearPluginMetadataLifecycleCaches(): void {
  // no-op
}

// ============================================================================
// installed-plugin-index-store 实现
// ============================================================================

/** Freshness state for the persisted installed plugin index. */
export type InstalledPluginIndexStoreState = "missing" | "fresh" | "stale";

export type InstalledPluginIndexStoreInspection = {
  state: InstalledPluginIndexStoreState;
  refreshReasons: readonly InstalledPluginIndexRefreshReason[];
  persisted: InstalledPluginIndex | null;
  current: InstalledPluginIndex;
};

const StringArraySchema = z.array(z.string());
const INSTALLED_PLUGIN_INDEX_SQLITE_KEY = "installed-plugin-index";

const InstalledPluginIndexStartupSchema = z.object({
  sidecar: z.boolean(),
  memory: z.boolean(),
  deferConfiguredChannelFullLoadUntilAfterListen: z.boolean(),
  agentHarnesses: StringArraySchema,
  configPaths: StringArraySchema.optional(),
});

const InstalledPluginIndexContributionSchema = z.object({
  channels: StringArraySchema,
  channelConfigs: StringArraySchema,
  providers: StringArraySchema,
  modelCatalogProviders: StringArraySchema,
  modelSupportPrefixes: StringArraySchema,
  modelSupportPatterns: StringArraySchema,
  autoEnableProviderIds: StringArraySchema,
  commandAliases: StringArraySchema,
  contracts: z.record(z.string(), StringArraySchema),
});

const InstalledPluginFileSignatureSchema = z.object({
  size: z.number(),
  mtimeMs: z.number(),
  ctimeMs: z.number().optional(),
});

const InstalledPluginIndexRecordSchema = z.object({
  pluginId: z.string(),
  packageName: z.string().optional(),
  packageVersion: z.string().optional(),
  installRecord: z.record(z.string(), z.unknown()).optional(),
  installRecordHash: z.string().optional(),
  packageInstall: z.unknown().optional(),
  packageChannel: z.unknown().optional(),
  manifestPath: z.string(),
  manifestHash: z.string(),
  manifestFile: InstalledPluginFileSignatureSchema.optional(),
  format: z.string().optional(),
  bundleFormat: z.string().optional(),
  source: z.string().optional(),
  setupSource: z.string().optional(),
  packageJson: z
    .object({
      path: z.string(),
      hash: z.string(),
      fileSignature: InstalledPluginFileSignatureSchema.optional(),
    })
    .optional(),
  rootDir: z.string(),
  origin: z.string(),
  enabled: z.boolean(),
  enabledByDefault: z.boolean().optional(),
  enabledByDefaultOnPlatforms: StringArraySchema.optional(),
  syntheticAuthRefs: StringArraySchema.optional(),
  startup: InstalledPluginIndexStartupSchema,
  contributions: InstalledPluginIndexContributionSchema.optional(),
  compat: z.array(z.string()),
});

const InstalledPluginInstallRecordSchema = z.record(z.string(), z.unknown());

const PluginDiagnosticSchema = z.object({
  level: z.union([z.literal("warn"), z.literal("error")]),
  message: z.string(),
  pluginId: z.string().optional(),
  source: z.string().optional(),
});

const InstalledPluginIndexSchema = z.object({
  version: z.literal(INSTALLED_PLUGIN_INDEX_VERSION),
  warning: z.string().optional(),
  hostContractVersion: z.string(),
  compatRegistryVersion: z.string(),
  migrationVersion: z.literal(INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION),
  policyHash: z.string(),
  generatedAtMs: z.number(),
  refreshReason: z.string().optional(),
  installRecords: z.record(z.string(), InstalledPluginInstallRecordSchema).optional(),
  plugins: z.array(InstalledPluginIndexRecordSchema),
  diagnostics: z.array(PluginDiagnosticSchema),
});

function copySafeInstallRecords(
  records: Readonly<Record<string, InstalledPluginInstallRecordInfo>> | undefined,
): Record<string, InstalledPluginInstallRecordInfo> | undefined {
  if (!records) {
    return undefined;
  }
  const safeRecords: Record<string, InstalledPluginInstallRecordInfo> = {};
  for (const [pluginId, record] of Object.entries(records)) {
    if (isBlockedObjectKey(pluginId)) {
      continue;
    }
    safeRecords[pluginId] = record;
  }
  return safeRecords;
}

export function parseInstalledPluginIndex(value: unknown): InstalledPluginIndex | null {
  const parsed = safeParseWithSchema(InstalledPluginIndexSchema, value) as
    | (Omit<InstalledPluginIndex, "installRecords"> & {
        installRecords?: InstalledPluginIndex["installRecords"];
      })
    | null;
  if (!parsed) {
    return null;
  }
  const installRecords =
    copySafeInstallRecords(parsed.installRecords) ??
    copySafeInstallRecords(
      extractPluginInstallRecordsFromInstalledPluginIndex(parsed as InstalledPluginIndex) as never,
    ) ??
    {};
  return {
    version: parsed.version,
    ...(parsed.warning ? { warning: parsed.warning } : {}),
    hostContractVersion: parsed.hostContractVersion,
    compatRegistryVersion: parsed.compatRegistryVersion,
    migrationVersion: parsed.migrationVersion,
    policyHash: parsed.policyHash,
    generatedAtMs: parsed.generatedAtMs,
    ...(parsed.refreshReason ? { refreshReason: parsed.refreshReason } : {}),
    installRecords: installRecords as InstalledPluginIndex["installRecords"],
    plugins: parsed.plugins,
    diagnostics: parsed.diagnostics,
  };
}

function isExplicitLegacyJsonStorePath(options: InstalledPluginIndexStoreOptions): boolean {
  return Boolean(options.filePath && options.filePath.endsWith(".json"));
}

function readLegacyRecordContainer(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const legacy = value as { installRecords?: unknown; records?: unknown };
  return legacy.installRecords ?? legacy.records;
}

function readPersistedInstalledPluginIndexFromLegacyJson(
  options: InstalledPluginIndexStoreOptions,
): InstalledPluginIndex | null {
  if (!options.filePath || !existsSync(options.filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(options.filePath, "utf8")) as unknown;
    const current = parseInstalledPluginIndex(parsed);
    if (current) {
      return current;
    }
    const installRecords = readLegacyRecordContainer(parsed);
    if (!installRecords) {
      return null;
    }
    return parseInstalledPluginIndex({
      version: INSTALLED_PLUGIN_INDEX_VERSION,
      hostContractVersion: "legacy-file",
      compatRegistryVersion: "legacy-file",
      migrationVersion: INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION,
      policyHash: "legacy-file",
      generatedAtMs: 0,
      installRecords,
      plugins: [],
      diagnostics: [],
    });
  } catch {
    return null;
  }
}

/**
 * 降级说明：cross-wms 尚未移植 state/openclaw-state-db.js。SQLite 读取降级为
 * 始终返回 null；显式 .json 文件路径仍尝试从 JSON 读取。
 */
function readPersistedInstalledPluginIndexFromStore(
  options: InstalledPluginIndexStoreOptions = {},
): InstalledPluginIndex | null {
  if (isExplicitLegacyJsonStorePath(options)) {
    return readPersistedInstalledPluginIndexFromLegacyJson(options);
  }
  if (!existsSync(resolveInstalledPluginIndexStorePath(options))) {
    return null;
  }
  // SQLite 读取未实现，返回 null。
  void resolveInstalledPluginIndexStateDatabaseOptions(options);
  return null;
}

/**
 * 降级说明：cross-wms 尚未移植 state/openclaw-state-db.js。SQLite 写入降级为
 * 静默成功但不持久化（仅清理 in-memory 缓存以触发下次读取回退到 recovered records）。
 */
function writePersistedInstalledPluginIndexToStore(
  _index: InstalledPluginIndex,
  _options: InstalledPluginIndexStoreOptions = {},
): void {
  // no-op: SQLite 写入未实现。
}

export async function readPersistedInstalledPluginIndex(
  options: InstalledPluginIndexStoreOptions = {},
): Promise<InstalledPluginIndex | null> {
  return readPersistedInstalledPluginIndexFromStore(options);
}

export function readPersistedInstalledPluginIndexSync(
  options: InstalledPluginIndexStoreOptions = {},
): InstalledPluginIndex | null {
  return readPersistedInstalledPluginIndexFromStore(options);
}

export async function writePersistedInstalledPluginIndex(
  index: InstalledPluginIndex,
  options: InstalledPluginIndexStoreOptions = {},
): Promise<string> {
  const filePath = resolveInstalledPluginIndexStorePath(options);
  writePersistedInstalledPluginIndexToStore(index, options);
  clearPluginMetadataLifecycleCaches();
  clearLoadInstalledPluginIndexInstallRecordsCache();
  return filePath;
}

export function writePersistedInstalledPluginIndexSync(
  index: InstalledPluginIndex,
  options: InstalledPluginIndexStoreOptions = {},
): string {
  const filePath = resolveInstalledPluginIndexStorePath(options);
  writePersistedInstalledPluginIndexToStore(index, options);
  clearPluginMetadataLifecycleCaches();
  clearLoadInstalledPluginIndexInstallRecordsCache();
  return filePath;
}

function hasPolicyRefreshTargets(
  persisted: InstalledPluginIndex,
  policyPluginIds: readonly string[] | undefined,
): boolean {
  if (!policyPluginIds || policyPluginIds.length === 0) {
    return true;
  }
  const pluginIds = new Set(persisted.plugins.map((plugin) => plugin.pluginId));
  return policyPluginIds.every((pluginId) => pluginIds.has(pluginId));
}

function canRefreshPersistedPolicyState(
  persisted: InstalledPluginIndex | null,
  params: RefreshInstalledPluginIndexParams & InstalledPluginIndexStoreOptions,
): persisted is InstalledPluginIndex {
  if (!persisted || params.reason !== "policy-changed") {
    return false;
  }
  const env = params.env ?? process.env;
  if (
    persisted.version !== INSTALLED_PLUGIN_INDEX_VERSION ||
    persisted.hostContractVersion !== resolveCompatibilityHostVersion(env) ||
    persisted.compatRegistryVersion !== resolveCompatRegistryVersion() ||
    persisted.migrationVersion !== INSTALLED_PLUGIN_INDEX_MIGRATION_VERSION ||
    hasMissingConfigPathActivationMetadata(persisted)
  ) {
    return false;
  }
  if (
    params.installRecords &&
    hashJson(params.installRecords as never) !== hashJson(persisted.installRecords ?? {})
  ) {
    return false;
  }
  return hasPolicyRefreshTargets(persisted, params.policyPluginIds);
}

function refreshPersistedPolicyState(
  persisted: InstalledPluginIndex,
  params: RefreshInstalledPluginIndexParams,
): InstalledPluginIndex {
  const normalizedConfig = normalizePluginsConfig(
    (params.config as { plugins?: unknown } | undefined)?.plugins,
  );
  return {
    ...persisted,
    policyHash: resolveInstalledPluginIndexPolicyHash(params.config as never),
    generatedAtMs: (params.now?.() ?? new Date()).getTime(),
    refreshReason: params.reason,
    plugins: persisted.plugins.map((plugin) => ({
      ...plugin,
      enabled: resolveEffectiveEnableState({
        id: plugin.pluginId,
        origin: plugin.origin ?? "unknown",
        config: normalizedConfig,
        rootConfig: params.config,
        enabledByDefault: isPluginEnabledByDefaultForPlatform(plugin as never),
      }).enabled,
    })),
  };
}

export async function inspectPersistedInstalledPluginIndex(
  params: LoadInstalledPluginIndexParams & InstalledPluginIndexStoreOptions = {},
): Promise<InstalledPluginIndexStoreInspection> {
  const persisted = await readPersistedInstalledPluginIndex(params);
  const current = loadInstalledPluginIndex({
    ...params,
    installRecords:
      params.installRecords ?? extractPluginInstallRecordsFromInstalledPluginIndex(persisted) as never,
  });
  if (!persisted) {
    return {
      state: "missing",
      refreshReasons: ["missing"],
      persisted: null,
      current,
    };
  }

  const refreshReasons = diffInstalledPluginIndexInvalidationReasons(persisted, current);
  return {
    state: refreshReasons.length > 0 ? "stale" : "fresh",
    refreshReasons,
    persisted,
    current,
  };
}

export async function refreshPersistedInstalledPluginIndex(
  params: RefreshInstalledPluginIndexParams & InstalledPluginIndexStoreOptions,
): Promise<InstalledPluginIndex> {
  const persisted =
    params.reason === "policy-changed" || !params.installRecords
      ? await readPersistedInstalledPluginIndex(params)
      : null;
  if (canRefreshPersistedPolicyState(persisted, params)) {
    const index = refreshPersistedPolicyState(persisted, params);
    await writePersistedInstalledPluginIndex(index, params);
    return index;
  }
  const index = refreshInstalledPluginIndex({
    ...params,
    installRecords:
      params.installRecords ?? extractPluginInstallRecordsFromInstalledPluginIndex(persisted) as never,
  } as never);
  await writePersistedInstalledPluginIndex(index, params);
  return index;
}

export function refreshPersistedInstalledPluginIndexSync(
  params: RefreshInstalledPluginIndexParams & InstalledPluginIndexStoreOptions,
): InstalledPluginIndex {
  const persisted =
    params.reason === "policy-changed" || !params.installRecords
      ? readPersistedInstalledPluginIndexSync(params)
      : null;
  if (canRefreshPersistedPolicyState(persisted, params)) {
    const index = refreshPersistedPolicyState(persisted, params);
    writePersistedInstalledPluginIndexSync(index, params);
    return index;
  }
  const index = refreshInstalledPluginIndex({
    ...params,
    installRecords:
      params.installRecords ?? extractPluginInstallRecordsFromInstalledPluginIndex(persisted) as never,
  } as never);
  writePersistedInstalledPluginIndexSync(index, params);
  return index;
}
