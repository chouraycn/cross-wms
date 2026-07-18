/** Reads installed-index records back into manifest registry records. */
//
// 移植自 openclaw/src/plugins/installed-plugin-index-record-reader.ts。
//
// 降级策略：
//  - 原文件依赖 @openclaw/normalization-core/record-coerce 的 isRecord。
//    改用 cross-wms 的 ../infra/record-coerce.js，已提供同名导出。
//  - 原文件依赖 ../config/types.plugins.js 的 PluginInstallRecord。cross-wms 尚未
//    移植该模块。这里降级为 Record<string, unknown> 占位（与
//    installed-plugin-index-record-cache.ts 一致）。
//  - 原文件依赖 ../infra/json-files.js 的 tryReadJsonSync。改用 cross-wms 的
//    ../infra/_fs-safe-stubs.js 中同名导出，行为一致。
//  - 原文件依赖 ../state/openclaw-state-db.js 的 openOpenClawStateDatabase。
//    cross-wms 尚未移植该模块。这里降级为：readPersistedInstalledPluginIndexForRecords
//    始终返回 null，跳过 SQLite 读取，仅回退到 recovered managed npm install records。
//  - 原文件依赖 ./install-paths.js 的 resolveDefaultPluginNpmDir 与 validatePluginId。
//    cross-wms 尚未移植该模块。这里降级为：resolveDefaultPluginNpmDir 返回
//    stateDir 下的 "npm" 子目录；validatePluginId 简单校验非空且无路径分隔符。
//  - 原文件依赖 ./managed-npm-retention.js 的 hasRetainedManagedNpmInstallMarker。
//    cross-wms 尚未移植该模块。这里降级为始终返回 false（无 retained marker）。
//  - 原文件依赖 ./npm-project-roots.js 的 listManagedPluginNpmProjectRootsSync。
//    cross-wms 尚未移植该模块。这里降级为始终返回空数组。
//  - ./installed-plugin-index-record-cache.js 与 ./installed-plugin-index-store-path.js
//    在 cross-wms 中已存在，直接引用。
//  - 行为契约保持一致：当 cross-wms 未来移植 state-db 与 install-paths 时，可直接
//    替换本地降级实现。

import fs from "node:fs";
import path from "node:path";
import { isRecord } from "../infra/record-coerce.js";
import { tryReadJsonSync } from "../infra/_fs-safe-stubs.js";
import {
  getInstalledPluginIndexInstallRecordsCache,
  getInstalledPluginIndexInstallRecordsCacheGeneration,
  setInstalledPluginIndexInstallRecordsCache,
} from "./installed-plugin-index-record-cache.js";
import {
  resolveInstalledPluginIndexStateDatabaseOptions,
  resolveInstalledPluginIndexStorePath,
  type InstalledPluginIndexStoreOptions,
} from "./installed-plugin-index-store-path.js";

export { clearLoadInstalledPluginIndexInstallRecordsCache } from "./installed-plugin-index-record-cache.js";

// ============================================================================
// 内联降级类型占位
// ============================================================================

/**
 * 插件安装记录（降级占位）。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的 ../config/types.plugins.js。
 * 这里使用 Record<string, unknown> 占位（与 installed-plugin-index-record-cache.ts 一致）。
 */
type PluginInstallRecord = Record<string, unknown>;

// ============================================================================
// 内联降级：./install-paths.js —— resolveDefaultPluginNpmDir 与 validatePluginId
// ============================================================================

/**
 * 解析默认插件 npm 目录（降级占位）。
 *
 * 降级说明：cross-wms 的 install-paths.js 尚未移植。openclaw 原版从 env 读取
 * OPENCLAW_PLUGIN_NPM_DIR，回退到 stateDir 下的 npm 子目录。这里内联实现
 * 相同逻辑（仅依赖 options.env 与 options.stateDir）。
 */
function resolveDefaultPluginNpmDir(options: {
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
}): string {
  const fromEnv =
    typeof options.env?.OPENCLAW_PLUGIN_NPM_DIR === "string"
      ? options.env.OPENCLAW_PLUGIN_NPM_DIR.trim()
      : "";
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  const stateDir =
    options.stateDir ??
    (typeof options.env?.OPENCLAW_STATE_DIR === "string"
      ? options.env.OPENCLAW_STATE_DIR.trim()
      : "");
  if (stateDir) {
    return path.join(path.resolve(stateDir), "npm");
  }
  return path.join(process.cwd(), "node_modules", ".openclaw-plugins");
}

/**
 * 校验插件 id 是否合法（降级占位）。
 *
 * 降级说明：cross-wms 的 install-paths.js 尚未移植。openclaw 原版使用严格
 * 正则校验。这里降级为简单校验：非空、无路径分隔符、无点号开头。
 */
function validatePluginId(pluginId: string): boolean {
  if (!pluginId || typeof pluginId !== "string") {
    return false;
  }
  const trimmed = pluginId.trim();
  if (!trimmed) {
    return false;
  }
  if (/[\\/]/.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith(".")) {
    return false;
  }
  return true;
}

// ============================================================================
// 内联降级：./managed-npm-retention.js —— hasRetainedManagedNpmInstallMarker
// ============================================================================

/**
 * 判断目录是否包含 retained managed npm install marker（降级占位）。
 *
 * 降级说明：cross-wms 的 managed-npm-retention.js 尚未移植。openclaw 原版检查
 * packageDir 下的 .openclaw-retained marker 文件。这里降级为始终返回 false，
 * 使所有 npm 安装的插件都被视为可恢复的 install records。
 */
function hasRetainedManagedNpmInstallMarker(_packageDir: string): boolean {
  return false;
}

// ============================================================================
// 内联降级：./npm-project-roots.js —— listManagedPluginNpmProjectRootsSync
// ============================================================================

/**
 * 列出 managed plugin npm 项目根目录（降级占位）。
 *
 * 降级说明：cross-wms 的 npm-project-roots.js 尚未移植。openclaw 原版扫描 npmRoot
 * 下的子项目。这里降级为始终返回空数组。
 */
function listManagedPluginNpmProjectRootsSync(_npmRoot: string): string[] {
  return [];
}

// ============================================================================
// 内联降级：../state/openclaw-state-db.js —— openOpenClawStateDatabase
// ============================================================================

/**
 * 降级说明：cross-wms 的 state/openclaw-state-db.js 尚未移植。
 * readPersistedInstalledPluginIndexForRecords 始终返回 null，跳过 SQLite 读取，
 * 仅回退到 recovered managed npm install records。
 * 当 options.filePath 以 .json 结尾时，仍尝试从 JSON 文件读取。
 */

// ============================================================================
// installed-plugin-index-record-reader 实现
// ============================================================================

function cloneInstallRecords(
  records: Record<string, PluginInstallRecord> | undefined,
): Record<string, PluginInstallRecord> {
  return readRecordMap(records) ?? {};
}

const BLOCKED_RECORD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isSafeRecordKey(key: string): boolean {
  return !BLOCKED_RECORD_KEYS.has(key);
}

function readRecordMap(value: unknown): Record<string, PluginInstallRecord> | null {
  if (!isRecord(value)) {
    return null;
  }
  const records: Record<string, PluginInstallRecord> = {};
  for (const [pluginId, record] of Object.entries(value).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!isSafeRecordKey(pluginId)) {
      continue;
    }
    if (isRecord(record) && typeof record.source === "string") {
      records[pluginId] = structuredClone(record) as PluginInstallRecord;
    }
  }
  return records;
}

function readJsonObjectFileSync(filePath: string): Record<string, unknown> | null {
  const parsed = tryReadJsonSync<unknown>(filePath);
  return isRecord(parsed) ? parsed : null;
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!isSafeRecordKey(key)) {
      continue;
    }
    if (typeof raw === "string" && raw.trim()) {
      record[key] = raw.trim();
    }
  }
  return record;
}

function hasPackagePluginMetadata(manifest: Record<string, unknown>): boolean {
  const openclaw = manifest.openclaw;
  if (!isRecord(openclaw)) {
    return false;
  }
  const extensions = openclaw.extensions;
  return Array.isArray(extensions) && extensions.some((entry) => typeof entry === "string");
}

function readManifestPluginId(packageDir: string): string | undefined {
  const manifest = readJsonObjectFileSync(path.join(packageDir, "openclaw.plugin.json"));
  const id = typeof manifest?.id === "string" ? manifest.id.trim() : "";
  return id || undefined;
}

function resolveRecoveredManagedNpmRoot(options: InstalledPluginIndexStoreOptions = {}): string {
  return path.resolve(
    options.stateDir
      ? path.join(options.stateDir, "npm")
      : resolveDefaultPluginNpmDir({ env: options.env }),
  );
}

function resolveRecoveredManagedNpmPluginId(params: {
  packageName: string;
  packageDir: string;
}): string | undefined {
  const packageManifest = readJsonObjectFileSync(path.join(params.packageDir, "package.json"));
  if (!packageManifest || !hasPackagePluginMetadata(packageManifest)) {
    return undefined;
  }
  const packageName =
    typeof packageManifest.name === "string" && packageManifest.name.trim()
      ? packageManifest.name.trim()
      : params.packageName;
  const pluginId = readManifestPluginId(params.packageDir) ?? packageName;
  return validatePluginId(pluginId) ? undefined : pluginId;
}

function buildRecoveredManagedNpmInstallRecordsForRoot(
  npmRoot: string,
): Record<string, PluginInstallRecord> {
  const rootManifest = readJsonObjectFileSync(path.join(npmRoot, "package.json"));
  const dependencies = readStringRecord(rootManifest?.dependencies);
  const records: Record<string, PluginInstallRecord> = {};
  for (const [packageName, dependencySpec] of Object.entries(dependencies)) {
    const packageDir = path.join(npmRoot, "node_modules", ...packageName.split("/"));
    let stat: fs.Stats;
    try {
      stat = fs.statSync(packageDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) {
      continue;
    }
    if (hasRetainedManagedNpmInstallMarker(packageDir)) {
      continue;
    }
    const pluginId = resolveRecoveredManagedNpmPluginId({ packageName, packageDir });
    if (!pluginId) {
      continue;
    }
    const packageManifest = readJsonObjectFileSync(path.join(packageDir, "package.json"));
    const version =
      typeof packageManifest?.version === "string" && packageManifest.version.trim()
        ? packageManifest.version.trim()
        : undefined;
    records[pluginId] = {
      source: "npm",
      spec: `${packageName}@${dependencySpec}`,
      installPath: packageDir,
      ...(version ? { version, resolvedName: packageName, resolvedVersion: version } : {}),
      ...(version ? { resolvedSpec: `${packageName}@${version}` } : {}),
    };
  }
  return records;
}

function buildRecoveredManagedNpmInstallRecords(
  options: InstalledPluginIndexStoreOptions = {},
): Record<string, PluginInstallRecord> {
  const npmRoot = resolveRecoveredManagedNpmRoot(options);
  const legacyRecords = buildRecoveredManagedNpmInstallRecordsForRoot(npmRoot);
  const projectRecords: Record<string, PluginInstallRecord> = {};
  for (const projectRoot of listManagedPluginNpmProjectRootsSync(npmRoot)) {
    Object.assign(projectRecords, buildRecoveredManagedNpmInstallRecordsForRoot(projectRoot));
  }
  return { ...legacyRecords, ...projectRecords };
}

function recordsShareInstallPath(
  left: PluginInstallRecord | undefined,
  right: PluginInstallRecord,
): boolean {
  const leftPath = typeof left?.installPath === "string" ? left.installPath : "";
  const rightPath = typeof right.installPath === "string" ? right.installPath : "";
  if (!leftPath || !rightPath) {
    return false;
  }
  return path.resolve(leftPath) === path.resolve(rightPath);
}

function readInstallRecordVersion(record: PluginInstallRecord | undefined): string | undefined {
  if (!record) {
    return undefined;
  }
  const resolvedVersion =
    typeof record.resolvedVersion === "string" ? record.resolvedVersion : undefined;
  if (resolvedVersion) {
    return resolvedVersion;
  }
  return typeof record.version === "string" ? record.version : undefined;
}

function mergeRecoveredManagedNpmRecord(params: {
  persisted: PluginInstallRecord | undefined;
  recovered: PluginInstallRecord;
}): PluginInstallRecord {
  const persistedVersion = readInstallRecordVersion(params.persisted);
  const recoveredVersion = readInstallRecordVersion(params.recovered);
  const persistedSource =
    typeof params.persisted?.source === "string" ? params.persisted.source : "";
  if (
    persistedSource === "npm" &&
    recordsShareInstallPath(params.persisted, params.recovered) &&
    recoveredVersion &&
    persistedVersion !== recoveredVersion
  ) {
    const next: PluginInstallRecord = {
      ...params.persisted,
      ...params.recovered,
    };
    delete next.integrity;
    delete next.shasum;
    delete next.resolvedAt;
    delete next.installedAt;
    return next;
  }
  return params.persisted ?? params.recovered;
}

function mergeRecoveredManagedNpmInstallRecords(
  persisted: Record<string, PluginInstallRecord> | null,
  options: InstalledPluginIndexStoreOptions,
): Record<string, PluginInstallRecord> {
  const recovered = buildRecoveredManagedNpmInstallRecords(options);
  const merged: Record<string, PluginInstallRecord> = { ...persisted };
  for (const [pluginId, record] of Object.entries(recovered)) {
    merged[pluginId] = mergeRecoveredManagedNpmRecord({
      persisted: merged[pluginId],
      recovered: record,
    });
  }
  return merged;
}

function extractPluginInstallRecordsFromPersistedInstalledPluginIndex(
  index: unknown,
): Record<string, PluginInstallRecord> | null {
  if (!isRecord(index)) {
    return null;
  }
  if (Object.hasOwn(index, "installRecords")) {
    return readRecordMap(index.installRecords) ?? {};
  }
  if (Object.hasOwn(index, "records")) {
    return readRecordMap(index.records) ?? {};
  }
  if (!Array.isArray(index.plugins)) {
    return null;
  }
  const records: Record<string, PluginInstallRecord> = {};
  for (const entry of index.plugins) {
    if (!isRecord(entry) || typeof entry.pluginId !== "string" || !isRecord(entry.installRecord)) {
      continue;
    }
    if (!isSafeRecordKey(entry.pluginId)) {
      continue;
    }
    records[entry.pluginId] = structuredClone(entry.installRecord) as PluginInstallRecord;
  }
  return records;
}

function readPersistedInstalledPluginIndexForRecords(
  options: InstalledPluginIndexStoreOptions = {},
): unknown {
  const storePath = resolveInstalledPluginIndexStorePath(options);
  if (!fs.existsSync(storePath)) {
    return null;
  }
  // 降级：cross-wms 尚未移植 state/openclaw-state-db.js。仅支持显式 JSON 文件路径。
  if (options.filePath?.endsWith(".json")) {
    return tryReadJsonSync<unknown>(options.filePath);
  }
  // SQLite 读取未实现，返回 null 以触发回退到 recovered managed npm install records。
  void resolveInstalledPluginIndexStateDatabaseOptions(options);
  return null;
}

/** Reads install records from the persisted installed plugin index. */
export async function readPersistedInstalledPluginIndexInstallRecords(
  options: InstalledPluginIndexStoreOptions = {},
): Promise<Record<string, PluginInstallRecord> | null> {
  const parsed = readPersistedInstalledPluginIndexForRecords(options);
  return extractPluginInstallRecordsFromPersistedInstalledPluginIndex(parsed);
}

/** Synchronously reads install records from the persisted installed plugin index. */
export function readPersistedInstalledPluginIndexInstallRecordsSync(
  options: InstalledPluginIndexStoreOptions = {},
): Record<string, PluginInstallRecord> | null {
  const parsed = readPersistedInstalledPluginIndexForRecords(options);
  return extractPluginInstallRecordsFromPersistedInstalledPluginIndex(parsed);
}

function resolveInstallRecordsCacheKey(options: InstalledPluginIndexStoreOptions): string {
  return [
    path.resolve(resolveInstalledPluginIndexStorePath(options)),
    resolveRecoveredManagedNpmRoot(options),
  ].join("\0");
}

/** Loads installed plugin records, recovering managed npm installs and caching the result. */
export async function loadInstalledPluginIndexInstallRecords(
  params: InstalledPluginIndexStoreOptions = {},
): Promise<Record<string, PluginInstallRecord>> {
  const cacheKey = resolveInstallRecordsCacheKey(params);
  const cached = getInstalledPluginIndexInstallRecordsCache(cacheKey);
  if (cached) {
    return cloneInstallRecords(
      cached.records as Record<string, PluginInstallRecord> | undefined,
    );
  }
  const cacheGeneration = getInstalledPluginIndexInstallRecordsCacheGeneration();
  const records = cloneInstallRecords(
    mergeRecoveredManagedNpmInstallRecords(
      await readPersistedInstalledPluginIndexInstallRecords(params),
      params,
    ),
  );
  if (cacheGeneration !== getInstalledPluginIndexInstallRecordsCacheGeneration()) {
    return await loadInstalledPluginIndexInstallRecords(params);
  }
  setInstalledPluginIndexInstallRecordsCache(cacheKey, {
    records: records as unknown as Record<string, never>,
  } as never);
  return cloneInstallRecords(records);
}

/** Synchronously loads installed plugin records, recovering managed npm installs and caching them. */
export function loadInstalledPluginIndexInstallRecordsSync(
  params: InstalledPluginIndexStoreOptions = {},
): Record<string, PluginInstallRecord> {
  const cacheKey = resolveInstallRecordsCacheKey(params);
  const cached = getInstalledPluginIndexInstallRecordsCache(cacheKey);
  if (cached) {
    return cloneInstallRecords(
      cached.records as Record<string, PluginInstallRecord> | undefined,
    );
  }
  const records = cloneInstallRecords(
    mergeRecoveredManagedNpmInstallRecords(
      readPersistedInstalledPluginIndexInstallRecordsSync(params),
      params,
    ),
  );
  setInstalledPluginIndexInstallRecordsCache(cacheKey, {
    records: records as unknown as Record<string, never>,
  } as never);
  return cloneInstallRecords(records);
}
