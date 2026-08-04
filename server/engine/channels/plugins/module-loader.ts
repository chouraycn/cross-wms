// @ts-nocheck
/**
 * Channel plugin module loader.
 *
 * Loads JavaScript or source plugin modules through native require or cached TS loaders.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { openRootFileSync } from "../../infra/boundary-file-read.js";
import { isJavaScriptModulePath } from "../../plugins/native-module-require.js";
import {
  getCachedPluginModuleLoader,
  type PluginModuleLoaderCache,
  type PluginModuleLoaderFactory,
} from "../../plugins/plugin-module-loader-cache.js";

const nodeRequire = createRequire(import.meta.url);
const SOURCE_MODULE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const jitiLoaders: PluginModuleLoaderCache = new Map();
let channelPluginModuleLoaderFactoryForTest: PluginModuleLoaderFactory | undefined;

/**
 * Installs a test-only module loader factory for source channel plugin modules.
 */
export function setChannelPluginModuleLoaderFactoryForTest(
  factory?: PluginModuleLoaderFactory,
): void {
  channelPluginModuleLoaderFactoryForTest = factory;
  jitiLoaders.clear();
}

function hasNativeSourceRequireHook(modulePath: string): boolean {
  const extension = path.extname(modulePath).toLowerCase();
  return (
    SOURCE_MODULE_EXTENSIONS.has(extension) &&
    typeof nodeRequire.extensions?.[extension] === "function"
  );
}

function isSourceModulePath(modulePath: string): boolean {
  return SOURCE_MODULE_EXTENSIONS.has(path.extname(modulePath).toLowerCase());
}

function loadModuleWithJiti(modulePath: string): unknown {
  const loadWithJiti = getCachedPluginModuleLoader({
    cache: jitiLoaders,
    modulePath,
    importerUrl: import.meta.url,
    loaderFilename: import.meta.url,
    tryNative: false,
    cacheScopeKey: "channel-plugin-module-loader",
    ...(channelPluginModuleLoaderFactoryForTest
      ? { createLoader: channelPluginModuleLoaderFactoryForTest }
      : {}),
  });
  return loadWithJiti(modulePath);
}

function loadModule(modulePath: string): unknown {
  if (!isJavaScriptModulePath(modulePath) && !hasNativeSourceRequireHook(modulePath)) {
    if (isSourceModulePath(modulePath)) {
      // Local source plugins need the TS loader unless the current runtime has
      // installed a native source require hook for that extension.
      return loadModuleWithJiti(modulePath);
    }
    throw new Error(`channel plugin module must be built JavaScript: ${modulePath}`);
  }
  try {
    return nodeRequire(modulePath);
  } catch (error) {
    if (isSourceModulePath(modulePath)) {
      // Native source hooks can still fail on ESM/TS edge cases; fall back to
      // the cached loader before surfacing the error.
      return loadModuleWithJiti(modulePath);
    }
    throw new Error(`failed to load channel plugin module with native require: ${modulePath}`, {
      cause: error,
    });
  }
}

function resolvePluginModuleCandidates(rootDir: string, specifier: string): string[] {
  const normalizedSpecifier = specifier.replace(/\\/g, "/");
  const resolvedPath = path.resolve(rootDir, normalizedSpecifier);
  const ext = path.extname(resolvedPath);
  if (ext) {
    return [resolvedPath];
  }
  return [
    resolvedPath,
    `${resolvedPath}.ts`,
    `${resolvedPath}.mts`,
    `${resolvedPath}.js`,
    `${resolvedPath}.mjs`,
    `${resolvedPath}.cts`,
    `${resolvedPath}.cjs`,
  ];
}

/**
 * Resolves a plugin-relative module specifier to an existing candidate path.
 */
export function resolveExistingPluginModulePath(rootDir: string, specifier: string): string {
  for (const candidate of resolvePluginModuleCandidates(rootDir, specifier)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.resolve(rootDir, specifier);
}

/**
 * Loads a channel plugin module after enforcing plugin-root file boundaries.
 */
export function loadChannelPluginModule(params: {
  modulePath: string;
  rootDir: string;
  boundaryRootDir?: string;
  boundaryLabel?: string;
}): unknown {
  const opened = openRootFileSync({
    absolutePath: params.modulePath,
    rootPath: params.boundaryRootDir ?? params.rootDir,
    boundaryLabel: params.boundaryLabel ?? "plugin root",
    rejectHardlinks: false,
    skipLexicalRootCheck: true,
  });
  if (!opened.ok) {
    throw new Error(
      `${params.boundaryLabel ?? "plugin"} module path escapes plugin root or fails alias checks`,
    );
  }
  const safePath = opened.path;
  // The boundary check opens the file to verify the path; close before loading
  // through require/jiti so module evaluation owns its own descriptor lifecycle.
  fs.closeSync(opened.fd);
  return loadModule(safePath);
}

// ============================================================================
// WMS 兼容：plugins/index.ts barrel 期望以下导出（openclaw 没有，是 WMS 扩展）。
// 提供最小可运行 stub：模块缓存空实现。
// ============================================================================

export type ModuleLoaderOptions = {
  rootDir?: string;
  boundaryRootDir?: string;
  boundaryLabel?: string;
};

const loadedModules = new Map<string, unknown>();
const loadingModules = new Set<string>();

/** 加载渠道模块（兼容别名，委托给 loadChannelPluginModule）。 */
export function loadChannelModule(
  modulePath: string,
  options?: ModuleLoaderOptions,
): unknown {
  if (loadedModules.has(modulePath)) {
    return loadedModules.get(modulePath);
  }
  if (options?.rootDir) {
    return loadChannelPluginModule({
      modulePath,
      rootDir: options.rootDir,
      boundaryRootDir: options.boundaryRootDir,
      boundaryLabel: options.boundaryLabel,
    });
  }
  const mod = loadModule(modulePath);
  loadedModules.set(modulePath, mod);
  return mod;
}

/** 获取已加载的模块。 */
export function getLoadedModule(modulePath: string): unknown {
  return loadedModules.get(modulePath);
}

/** 检查模块是否已加载。 */
export function isModuleLoaded(modulePath: string): boolean {
  return loadedModules.has(modulePath);
}

/** 检查模块是否正在加载。 */
export function isModuleLoading(modulePath: string): boolean {
  return loadingModules.has(modulePath);
}

/** 卸载模块。 */
export function unloadChannelModule(modulePath: string): boolean {
  return loadedModules.delete(modulePath);
}

/** 清空所有已加载模块。 */
export function clearLoadedModules(): void {
  loadedModules.clear();
  loadingModules.clear();
}

/** 获取已加载模块数量。 */
export function getLoadedModuleCount(): number {
  return loadedModules.size;
}

/** 列出所有已加载模块路径。 */
export function listLoadedModules(): string[] {
  return Array.from(loadedModules.keys());
}

/** 创建懒加载插件加载器。 */
export function createLazyPluginLoader(
  modulePath: string,
  options?: ModuleLoaderOptions,
): () => unknown {
  let cached: unknown;
  let loaded = false;
  return () => {
    if (!loaded) {
      cached = loadChannelModule(modulePath, options);
      loaded = true;
    }
    return cached;
  };
}
