/** Resolves bundled plugin source metadata from package manifests. */
//
// 移植自 openclaw/src/plugins/bundled-sources.ts。
//
// 降级策略：
//  - 原文件依赖 @openclaw/normalization-core/record-coerce 的 isRecord。
//    改用 cross-wms 的 ../infra/record-coerce.js，已提供同名导出。
//  - 原文件依赖 @openclaw/normalization-core/string-coerce 的 normalizeOptionalString。
//    改用 cross-wms 的 ../infra/string-coerce.js，已提供同名导出。
//  - 原文件依赖 ./discovery.js 的 discoverOpenClawPlugins 与 PluginDiscoveryResult。
//    cross-wms 尚未移植该模块。这里内联降级实现：PluginDiscoveryResult 占位为
//    { candidates: never[]; diagnostics: never[] }，discoverOpenClawPlugins 返回
//    空结果集（与 installed-plugin-index-registry.ts 中占位一致）。
//  - 原文件依赖 ./manifest.js 的 loadPluginManifest。cross-wms 尚未移植该模块。
//    这里内联降级实现：始终返回 { ok: false }，使 resolveBundledPluginSources
//    跳过所有候选项并返回空 Map（行为契约保持一致）。
//  - 行为契约保持一致：当 cross-wms 未来移植 discovery 与 manifest 时，可直接
//    替换本地降级实现。

import { isRecord } from "../infra/record-coerce.js";
import { normalizeOptionalString } from "../infra/string-coerce.js";

// ============================================================================
// 内联降级类型占位：./discovery.js —— PluginDiscoveryResult / PluginCandidate
// ============================================================================

/**
 * 插件候选项的最小结构占位。
 *
 * 降级原因：cross-wms 的 discovery.js 尚未移植。仅保留 bundled-sources 实际
 * 访问的字段（origin/rootDir/packageManifest/packageName/packageVersion/source/workspaceDir）。
 */
type PluginCandidate = {
  origin?: string;
  rootDir: string;
  source: string;
  workspaceDir?: string;
  packageName?: string;
  packageVersion?: string;
  packageManifest?: {
    install?: { npmSpec?: string };
    [key: string]: unknown;
  };
};

/**
 * 插件发现结果的最小结构占位。
 *
 * 降级原因：cross-wms 的 discovery.js 尚未移植。这里定义与 openclaw
 * PluginDiscoveryResult 结构兼容的最小类型。
 */
type PluginDiscoveryResult = {
  candidates: readonly PluginCandidate[];
  diagnostics?: readonly unknown[];
};

/**
 * 发现 OpenClaw 插件候选项（降级占位）。
 *
 * 降级说明：cross-wms 的 discovery.js 尚未移植。openclaw 原版扫描 workspaceDir
 * 与 env 配置的目录以发现插件。这里降级为始终返回空结果集。
 */
function discoverOpenClawPlugins(_params: {
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): PluginDiscoveryResult {
  return { candidates: [], diagnostics: [] };
}

// ============================================================================
// 内联降级：./manifest.js —— loadPluginManifest
// ============================================================================

/**
 * 插件 manifest 加载结果的最小结构占位。
 *
 * 降级原因：cross-wms 的 manifest.js 尚未移植。仅保留 bundled-sources 实际
 * 访问的字段（ok/manifest.id/version/configSchema）。
 */
type PluginManifestLoadResult =
  | { ok: true; manifest: { id: string; version?: string; configSchema?: unknown } }
  | { ok: false };

/**
 * 加载插件 manifest（降级占位）。
 *
 * 降级说明：cross-wms 的 manifest.js 尚未移植。openclaw 原版从 pluginDir 下
 * 读取 openclaw.plugin.json 并校验。这里降级为始终返回 { ok: false }，
 * 使 resolveBundledPluginSources 跳过所有候选项。
 */
function loadPluginManifest(_pluginDir: string, _strict: boolean): PluginManifestLoadResult {
  return { ok: false };
}

// ============================================================================
// bundled-sources 实现
// ============================================================================

export type BundledPluginSource = {
  pluginId: string;
  localPath: string;
  npmSpec?: string;
  version?: string;
  configSchema?: Record<string, unknown>;
  requiresConfig?: boolean;
};

export type BundledPluginLookup =
  | { kind: "npmSpec"; value: string }
  | { kind: "pluginId"; value: string };

export function findBundledPluginSourceInMap(params: {
  bundled: ReadonlyMap<string, BundledPluginSource>;
  lookup: BundledPluginLookup;
}): BundledPluginSource | undefined {
  const targetValue = params.lookup.value.trim();
  if (!targetValue) {
    return undefined;
  }
  if (params.lookup.kind === "pluginId") {
    return params.bundled.get(targetValue);
  }
  for (const source of params.bundled.values()) {
    if (source.npmSpec === targetValue) {
      return source;
    }
  }
  return undefined;
}

export function resolveBundledPluginSources(params: {
  workspaceDir?: string;
  /** Use an explicit env when bundled roots should resolve independently from process.env. */
  env?: NodeJS.ProcessEnv;
  discovery?: PluginDiscoveryResult;
}): Map<string, BundledPluginSource> {
  const discovery =
    params.discovery ??
    discoverOpenClawPlugins({ workspaceDir: params.workspaceDir, env: params.env });
  const bundled = new Map<string, BundledPluginSource>();

  for (const candidate of discovery.candidates) {
    if (candidate.origin !== "bundled") {
      continue;
    }
    const manifest = loadPluginManifest(candidate.rootDir, false);
    if (!manifest.ok) {
      continue;
    }
    const pluginId = manifest.manifest.id;
    if (bundled.has(pluginId)) {
      continue;
    }

    const npmSpec =
      normalizeOptionalString(candidate.packageManifest?.install?.npmSpec) ||
      normalizeOptionalString(candidate.packageName) ||
      undefined;

    const version =
      normalizeOptionalString(candidate.packageVersion) ||
      normalizeOptionalString(manifest.manifest.version) ||
      undefined;

    bundled.set(pluginId, {
      pluginId,
      localPath: candidate.rootDir,
      npmSpec,
      version,
      ...(isRecord(manifest.manifest.configSchema)
        ? { configSchema: manifest.manifest.configSchema as Record<string, unknown> }
        : {}),
      requiresConfig: pluginConfigSchemaHasRequiredFields(manifest.manifest.configSchema),
    });
  }

  return bundled;
}

function pluginConfigSchemaHasRequiredFields(schema: unknown): boolean {
  if (!isRecord(schema)) {
    return false;
  }
  const required = schema.required;
  return Array.isArray(required) && required.some((entry) => typeof entry === "string");
}

export function findBundledPluginSource(params: {
  lookup: BundledPluginLookup;
  workspaceDir?: string;
  /** Use an explicit env when bundled roots should resolve independently from process.env. */
  env?: NodeJS.ProcessEnv;
}): BundledPluginSource | undefined {
  const bundled = resolveBundledPluginSources({
    workspaceDir: params.workspaceDir,
    env: params.env,
  });
  return findBundledPluginSourceInMap({
    bundled,
    lookup: params.lookup,
  });
}

export function resolveBundledPluginInstallCommandHint(params: {
  pluginId: string;
  workspaceDir?: string;
  /** Use an explicit env when bundled roots should resolve independently from process.env. */
  env?: NodeJS.ProcessEnv;
}): string | null {
  const bundledSource = findBundledPluginSource({
    lookup: { kind: "pluginId", value: params.pluginId },
    workspaceDir: params.workspaceDir,
    env: params.env,
  });
  if (!bundledSource?.localPath) {
    return null;
  }
  return `openclaw plugins install ${bundledSource.localPath}`;
}
