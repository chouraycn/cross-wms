/**
 * Caches plugin module loaders and native-load stats for runtime/source module imports.
 * 移植自 openclaw/src/plugins/plugin-module-loader-cache.ts。
 * 降级策略：
 *  - jiti / createJiti 降级为惰性抛出 not implemented 的占位工厂（jiti 包未安装）。
 *  - native-module-require.ts 与 sdk-alias.ts 未移植，相关函数降级为 no-op / 抛错。
 *  - import.meta.url 改用 __filename。
 *  - PluginLruCache 复用 cross-wms 已移植的 plugin-cache-primitives.ts。
 *  - toSafeImportPath 复用内联实现。
 *  - 缓存与统计 API 保持签名兼容；loadCreateJitiLoaderFactory 抛出 not implemented。
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PluginLruCache } from "./plugin-cache-primitives.js";

/** Jiti-based module loader used for plugin source/runtime imports. */
export type PluginModuleLoader = ((target: string, ...rest: unknown[]) => unknown) & {
  [key: string]: unknown;
};
export type PluginModuleLoaderFactory = (
  filename: string,
  options?: Record<string, unknown>,
) => PluginModuleLoader;
export type PluginModuleLoaderCache = Pick<
  PluginLruCache<PluginModuleLoader>,
  "clear" | "get" | "set" | "size"
>;
export type ResolvePluginModuleLoaderCacheEntryParams = {
  modulePath: string;
  importerUrl: string;
  argvEntry?: string;
  preferBuiltDist?: boolean;
  loaderFilename?: string;
  aliasMap?: Record<string, string>;
  tryNative?: boolean;
  devSourceRoot?: string | null;
  pluginSdkResolution?: PluginSdkResolutionPreference;
  cacheScopeKey?: string;
  sharedCacheScopeKey?: string;
};
export type PluginModuleLoaderCacheEntry = {
  loaderFilename: string;
  aliasMap: Record<string, string>;
  tryNative: boolean;
  cacheKey: string;
  scopedCacheKey: string;
};
export type PluginModuleLoaderStatsSnapshot = {
  calls: number;
  nativeHits: number;
  nativeMisses: number;
  sourceTransformForced: number;
  sourceTransformFallbacks: number;
  topSourceTransformTargets: Array<{ target: string; count: number }>;
};

/** 占位：插件 SDK 解析偏好。 */
export type PluginSdkResolutionPreference = "source" | "dist" | "auto";

const DEFAULT_PLUGIN_MODULE_LOADER_CACHE_ENTRIES = 128;
const MAX_TRACKED_SOURCE_TRANSFORM_TARGETS = 24;
const pluginModuleLoaderStats = {
  calls: 0,
  nativeHits: 0,
  nativeMisses: 0,
  sourceTransformForced: 0,
  sourceTransformFallbacks: 0,
  sourceTransformTargets: new Map<string, number>(),
};

function recordSourceTransformTarget(target: string): void {
  const current = pluginModuleLoaderStats.sourceTransformTargets.get(target) ?? 0;
  pluginModuleLoaderStats.sourceTransformTargets.set(target, current + 1);
  if (pluginModuleLoaderStats.sourceTransformTargets.size <= MAX_TRACKED_SOURCE_TRANSFORM_TARGETS) {
    return;
  }
  let leastUsedTarget: string | undefined;
  let leastUsedCount = Number.POSITIVE_INFINITY;
  for (const [candidate, count] of pluginModuleLoaderStats.sourceTransformTargets) {
    if (count < leastUsedCount) {
      leastUsedTarget = candidate;
      leastUsedCount = count;
    }
  }
  if (leastUsedTarget) {
    pluginModuleLoaderStats.sourceTransformTargets.delete(leastUsedTarget);
  }
}

/** Returns process-local plugin module loader stats for diagnostics and tests. */
export function getPluginModuleLoaderStats(): PluginModuleLoaderStatsSnapshot {
  return {
    calls: pluginModuleLoaderStats.calls,
    nativeHits: pluginModuleLoaderStats.nativeHits,
    nativeMisses: pluginModuleLoaderStats.nativeMisses,
    sourceTransformForced: pluginModuleLoaderStats.sourceTransformForced,
    sourceTransformFallbacks: pluginModuleLoaderStats.sourceTransformFallbacks,
    topSourceTransformTargets: [...pluginModuleLoaderStats.sourceTransformTargets]
      .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 8)
      .map(([target, count]) => ({ target, count })),
  };
}

/** 占位：加载 jiti 工厂（jiti 包未安装，降级为抛出 not implemented）。 */
function loadCreateJitiLoaderFactory(): PluginModuleLoaderFactory {
  throw new Error("not implemented: jiti module loader is not available in cross-wms");
}

export function createPluginModuleLoaderCache(
  maxEntries = DEFAULT_PLUGIN_MODULE_LOADER_CACHE_ENTRIES,
): PluginModuleLoaderCache {
  return new PluginLruCache<PluginModuleLoader>(maxEntries);
}

/** 占位：将 import 路径转换为安全 import 路径（内联降级实现）。 */
function toSafeImportPath(specifier: string): string {
  return specifier;
}

function toSourceTransformImportPath(specifier: string): string {
  if (process.platform === "win32" && path.isAbsolute(specifier)) {
    return pathToFileURL(specifier).href;
  }
  return toSafeImportPath(specifier);
}

/** 占位：解析插件加载器模块配置（sdk-alias.ts 未移植）。 */
function resolvePluginLoaderModuleConfig(params: {
  modulePath: string;
  argv1: string;
  moduleUrl?: string;
  devSourceRoot?: string | null;
  preferBuiltDist?: boolean;
  pluginSdkResolution?: PluginSdkResolutionPreference;
}): { tryNative: boolean; aliasMap: Record<string, string>; cacheKey: string } {
  void params;
  return {
    tryNative: true,
    aliasMap: {},
    cacheKey: "default",
  };
}

/** 占位：创建插件加载器 jiti 选项（sdk-alias.ts 未移植）。 */
function buildPluginLoaderJitiOptions(
  aliasMap: Record<string, string>,
  _extra?: { modulePath: string },
): Record<string, unknown> {
  return { alias: aliasMap };
}

/** 占位：创建插件加载器模块缓存键（sdk-alias.ts 未移植）。 */
function createPluginLoaderModuleCacheKey(params: {
  tryNative: boolean;
  aliasMap: Record<string, string>;
}): string {
  return JSON.stringify(params);
}

/** 占位：安装 OpenClaw 内部核心包原生解析器（plugin-sdk-native-resolver.ts 未移植）。 */
function installOpenClawInternalCorePackageNativeResolver(_params: {
  moduleUrl?: string;
}): string[] {
  return [];
}

/** 占位：尝试原生 require JS 模块（native-module-require.ts 未移植）。 always returns miss. */
function tryNativeRequireJavaScriptModule(
  _target: string,
  _options: {
    allowWindows?: boolean;
    aliasMap?: Record<string, string>;
    fallbackOnMissingDependency?: boolean;
    fallbackOnNativeError?: boolean;
  },
): { ok: boolean; moduleExport?: unknown } {
  return { ok: false };
}

function resolveDefaultPluginModuleLoaderConfig(
  params: ResolvePluginModuleLoaderCacheEntryParams,
): ReturnType<typeof resolvePluginLoaderModuleConfig> {
  return resolvePluginLoaderModuleConfig({
    modulePath: params.modulePath,
    argv1: params.argvEntry ?? process.argv[1],
    moduleUrl: params.importerUrl,
    devSourceRoot: params.devSourceRoot,
    ...(params.preferBuiltDist ? { preferBuiltDist: true } : {}),
    ...(params.pluginSdkResolution ? { pluginSdkResolution: params.pluginSdkResolution } : {}),
  });
}

export function resolvePluginModuleLoaderCacheEntry(
  params: ResolvePluginModuleLoaderCacheEntryParams,
): PluginModuleLoaderCacheEntry {
  const loaderFilename = toSafeImportPath(params.loaderFilename ?? params.modulePath);
  const hasAliasOverride = Boolean(params.aliasMap);
  const hasTryNativeOverride = typeof params.tryNative === "boolean";
  const defaultConfig =
    hasAliasOverride || hasTryNativeOverride
      ? resolveDefaultPluginModuleLoaderConfig(params)
      : null;
  const canReuseDefaultCacheKey =
    defaultConfig !== null &&
    (!hasAliasOverride || params.aliasMap === defaultConfig.aliasMap) &&
    (!hasTryNativeOverride || params.tryNative === defaultConfig.tryNative);
  const resolved = defaultConfig
    ? {
        tryNative: params.tryNative ?? defaultConfig.tryNative,
        aliasMap: params.aliasMap ?? defaultConfig.aliasMap,
        cacheKey: canReuseDefaultCacheKey ? defaultConfig.cacheKey : undefined,
      }
    : resolveDefaultPluginModuleLoaderConfig(params);
  const { tryNative, aliasMap } = resolved;
  const cacheKey =
    resolved.cacheKey ??
    createPluginLoaderModuleCacheKey({
      tryNative,
      aliasMap,
    });
  const scopedCacheKey = `${loaderFilename}::${
    params.sharedCacheScopeKey ??
    (params.cacheScopeKey ? `${params.cacheScopeKey}::${cacheKey}` : cacheKey)
  }`;
  return {
    loaderFilename,
    aliasMap,
    tryNative,
    cacheKey,
    scopedCacheKey,
  };
}

function createLazySourceTransformLoader(params: {
  loaderFilename: string;
  aliasMap: Record<string, string>;
  sourceTransformTryNative: boolean;
  createLoader?: PluginModuleLoaderFactory;
}): () => PluginModuleLoader {
  let loadWithSourceTransform: PluginModuleLoader | undefined;
  return () => {
    if (loadWithSourceTransform) {
      return loadWithSourceTransform;
    }
    const jitiLoader = (params.createLoader ?? loadCreateJitiLoaderFactory())(
      params.loaderFilename,
      {
        ...buildPluginLoaderJitiOptions(params.aliasMap, {
          modulePath: params.loaderFilename,
        }),
        tryNative: params.sourceTransformTryNative,
      },
    );
    loadWithSourceTransform = ((target: string, ...rest: unknown[]) => {
      return (jitiLoader as (t: string, ...a: unknown[]) => unknown)(
        toSourceTransformImportPath(target),
        ...rest,
      );
    }) as PluginModuleLoader;
    return loadWithSourceTransform;
  };
}

function createPluginModuleLoader(params: {
  loaderFilename: string;
  aliasMap: Record<string, string>;
  tryNative: boolean;
  createLoader?: PluginModuleLoaderFactory;
}): PluginModuleLoader {
  const getLoadWithSourceTransform = createLazySourceTransformLoader({
    ...params,
    sourceTransformTryNative: params.tryNative,
  });
  if (!params.tryNative) {
    return ((target: string, ...rest: unknown[]) => {
      pluginModuleLoaderStats.calls += 1;
      pluginModuleLoaderStats.sourceTransformForced += 1;
      recordSourceTransformTarget(target);
      return (getLoadWithSourceTransform() as (t: string, ...a: unknown[]) => unknown)(
        target,
        ...rest,
      );
    }) as PluginModuleLoader;
  }
  return ((target: string, ...rest: unknown[]) => {
    pluginModuleLoaderStats.calls += 1;
    const native = tryNativeRequireJavaScriptModule(target, {
      allowWindows: true,
      aliasMap: params.aliasMap,
      fallbackOnMissingDependency: true,
      fallbackOnNativeError: true,
    });
    if (native.ok) {
      pluginModuleLoaderStats.nativeHits += 1;
      return native.moduleExport;
    }
    pluginModuleLoaderStats.nativeMisses += 1;
    pluginModuleLoaderStats.sourceTransformFallbacks += 1;
    recordSourceTransformTarget(target);
    return (getLoadWithSourceTransform() as (t: string, ...a: unknown[]) => unknown)(
      target,
      ...rest,
    );
  }) as PluginModuleLoader;
}

export function getCachedPluginModuleLoader(
  params: ResolvePluginModuleLoaderCacheEntryParams & {
    cache: PluginModuleLoaderCache;
    createLoader?: PluginModuleLoaderFactory;
  },
): PluginModuleLoader {
  installOpenClawInternalCorePackageNativeResolver({ moduleUrl: params.importerUrl });
  const cacheEntry = resolvePluginModuleLoaderCacheEntry(params);
  const cached = params.cache.get(cacheEntry.scopedCacheKey);
  if (cached) {
    return cached;
  }
  const loader = createPluginModuleLoader({
    loaderFilename: cacheEntry.loaderFilename,
    aliasMap: cacheEntry.aliasMap,
    tryNative: cacheEntry.tryNative,
    ...(params.createLoader ? { createLoader: params.createLoader } : {}),
  });
  params.cache.set(cacheEntry.scopedCacheKey, loader);
  return loader;
}

export function getCachedPluginSourceModuleLoader(
  params: Omit<Parameters<typeof getCachedPluginModuleLoader>[0], "tryNative">,
): PluginModuleLoader {
  return getCachedPluginModuleLoader({
    ...params,
    tryNative: false,
  });
}
