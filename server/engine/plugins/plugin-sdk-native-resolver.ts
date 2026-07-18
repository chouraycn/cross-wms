/**
 * Installs native Node resolution aliases so plugins can import the OpenClaw SDK in dev and tests.
 * 移植自 openclaw/src/plugins/plugin-sdk-native-resolver.ts。
 * 降级策略：
 *  - sdk-alias.ts 未移植，buildPluginLoaderAliasMap、listWorkspacePackageExportAliasEntries
 *    降级为返回空对象/空数组。
 *  - import.meta.url 改用 __filename。
 *  - 原生 resolver 安装保留结构与 API 兼容；由于 aliasMap 为空，注册的别名不会生效。
 *  - 所有 export 保持签名兼容。
 */
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** 占位：插件 SDK 解析偏好。 */
export type PluginSdkResolutionPreference = "source" | "dist" | "auto";

type ResolveFilename = (
  request: string,
  parent: NodeJS.Module | undefined,
  isMain: boolean,
  options?: { paths?: string[] },
) => string;

type ModuleWithResolver = typeof Module & {
  _resolveFilename?: ResolveFilename;
  registerHooks?: (options: {
    resolve?: (
      specifier: string,
      context: { parentURL?: string | undefined },
      nextResolve: (
        specifier: string,
        context?: { parentURL?: string | undefined },
      ) => {
        url: string;
      },
    ) => { shortCircuit?: boolean; url: string };
  }) => { deregister: () => void };
};

type NativeAliasEntry = {
  parentRoot: string;
  target: string;
};

/** Resolver install options for CJS `_resolveFilename` and modern ESM loader hooks. */
export type InstallOpenClawPluginSdkNativeResolverOptions = {
  modulePath?: string;
  pluginModulePath?: string;
  allowedParentRoots?: readonly string[];
  argv1?: string;
  moduleUrl?: string;
  devSourceRoot?: string | null;
  pluginSdkResolution?: PluginSdkResolutionPreference;
};

const moduleWithResolver = Module as ModuleWithResolver;
const nodeResolveFilenameProperty = "_resolveFilename" as const;
const pluginSdkNativeAliases = new Map<string, NativeAliasEntry[]>();
let installed = false;
let previousResolveFilename: ResolveFilename | undefined;
let esmHooks: { deregister: () => void } | undefined;

function resolveLoaderModulePath(options: InstallOpenClawPluginSdkNativeResolverOptions): string {
  return options.modulePath ?? (options.moduleUrl ? fileURLToPath(options.moduleUrl) : __filename);
}

/** 占位：构建插件加载器 alias map（sdk-alias.ts 未移植）。 */
function buildPluginLoaderAliasMap(
  _modulePath: string,
  _argv1: string,
  _moduleUrl?: string,
  _preferDist?: string,
  _devSourceRoot?: string | null,
): Record<string, string> {
  return {};
}

/** 占位：列出工作区包导出 alias 条目（sdk-alias.ts 未移植）。 */
function listWorkspacePackageExportAliasEntries(_params: {
  packageRoot: string;
  packageName: string;
  packageDir: string;
}): Array<{ subpath: string; srcFile: string }> {
  return [];
}

function normalizePathForBoundary(candidate: string): string {
  try {
    return fs.realpathSync(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function findNearestPackageRoot(modulePath: string): string {
  let cursor = path.dirname(path.resolve(modulePath));
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(cursor, "package.json"))) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }
  return path.dirname(path.resolve(modulePath));
}

function findBundledPluginRoot(modulePath: string): string | undefined {
  const resolvedModulePath = normalizePathForBoundary(modulePath);
  const packageRoot = normalizePathForBoundary(resolveLoaderPackageRootFromModulePath(modulePath));
  for (const relativeRoot of ["extensions", "dist/extensions", "dist-runtime/extensions"]) {
    const bundledRoot = path.join(packageRoot, relativeRoot);
    const relative = path.relative(bundledRoot, resolvedModulePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      continue;
    }
    const [pluginId] = relative.split(path.sep);
    if (pluginId) {
      return path.join(bundledRoot, pluginId);
    }
  }
  return undefined;
}

function resolveLoaderPackageRootFromModulePath(modulePath: string): string {
  let cursor = path.dirname(path.resolve(modulePath));
  for (let i = 0; i < 12; i += 1) {
    const packageJsonPath = path.join(cursor, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
          bin?: unknown;
          name?: unknown;
        };
        if (
          packageJson.name === "openclaw" ||
          (typeof packageJson.bin === "object" &&
            packageJson.bin !== null &&
            typeof (packageJson.bin as { openclaw?: unknown }).openclaw === "string")
        ) {
          return cursor;
        }
      } catch {
        // Keep walking; malformed package metadata should not widen alias scope.
      }
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }
  return findNearestPackageRoot(modulePath);
}

function resolveAllowedParentRoot(modulePath: string): string {
  return findBundledPluginRoot(modulePath) ?? findNearestPackageRoot(modulePath);
}

function resolveAllowedParentRoots(
  options: InstallOpenClawPluginSdkNativeResolverOptions,
): string[] {
  const roots = new Set<string>();
  if (options.pluginModulePath) {
    roots.add(normalizePathForBoundary(resolveAllowedParentRoot(options.pluginModulePath)));
  }
  for (const root of options.allowedParentRoots ?? []) {
    roots.add(normalizePathForBoundary(root));
  }
  return [...roots];
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, normalizePathForBoundary(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveAliasTargetForParent(
  request: string,
  parent: NodeJS.Module | undefined,
): string | undefined {
  return resolveAliasTargetForParentPath(request, parent?.filename);
}

function resolveAliasTargetForParentUrl(
  request: string,
  parentUrl: string | undefined,
): string | undefined {
  if (!parentUrl?.startsWith("file:")) {
    return undefined;
  }
  try {
    return resolveAliasTargetForParentPath(request, fileURLToPath(parentUrl));
  } catch {
    return undefined;
  }
}

function resolveAliasTargetForParentPath(
  request: string,
  parentFilename: string | undefined,
): string | undefined {
  const entries = pluginSdkNativeAliases.get(request);
  if (!entries || !parentFilename) {
    return undefined;
  }
  return entries.find((entry) => isWithinRoot(parentFilename, entry.parentRoot))?.target;
}

function installResolver(): void {
  if (installed || !moduleWithResolver[nodeResolveFilenameProperty]) {
    return;
  }
  previousResolveFilename = moduleWithResolver[nodeResolveFilenameProperty];
  moduleWithResolver[nodeResolveFilenameProperty] = ((request, parent, isMain, options) => {
    const aliasTarget = resolveAliasTargetForParent(request, parent);
    if (aliasTarget) {
      return aliasTarget;
    }
    return previousResolveFilename?.(request, parent, isMain, options) ?? request;
  }) satisfies ResolveFilename;
  esmHooks = moduleWithResolver.registerHooks?.({
    resolve(specifier, context, nextResolve) {
      const aliasTarget = resolveAliasTargetForParentUrl(specifier, context.parentURL);
      if (aliasTarget) {
        return {
          shortCircuit: true,
          url: pathToFileURL(aliasTarget).href,
        };
      }
      return nextResolve(specifier, context);
    },
  });
  installed = true;
}

function registerNativeAlias(params: {
  request: string;
  target: string;
  parentRoots: readonly string[];
}): void {
  const entries = pluginSdkNativeAliases.get(params.request) ?? [];
  for (const parentRoot of params.parentRoots) {
    const existingIndex = entries.findIndex((entry) => entry.parentRoot === parentRoot);
    if (existingIndex !== -1) {
      entries[existingIndex] = { parentRoot, target: params.target };
      continue;
    }
    entries.push({ parentRoot, target: params.target });
  }
  if (entries.length > 0) {
    pluginSdkNativeAliases.set(params.request, entries);
  }
}

function clearNativeAliasesForParentRoots(parentRoots: readonly string[]): void {
  if (parentRoots.length === 0) {
    return;
  }
  const parentRootSet = new Set(parentRoots);
  for (const [request, entries] of pluginSdkNativeAliases) {
    const nextEntries = entries.filter((entry) => !parentRootSet.has(entry.parentRoot));
    if (nextEntries.length === 0) {
      pluginSdkNativeAliases.delete(request);
    } else {
      pluginSdkNativeAliases.set(request, nextEntries);
    }
  }
}

export function installOpenClawPluginSdkNativeResolver(
  options: InstallOpenClawPluginSdkNativeResolverOptions = {},
): string[] {
  const parentRoots = resolveAllowedParentRoots(options);
  clearNativeAliasesForParentRoots(parentRoots);
  // 降级：sdk-alias.ts 未移植，aliasMap 始终为空，所以跳过 alias 注册。
  // 原代码会在此处调用 listPluginSdkNativeAliases(options) 与
  // listInternalCorePackageNativeAliases(options) 并注册到 pluginSdkNativeAliases。
  installResolver();
  return [...pluginSdkNativeAliases.keys()].toSorted();
}

export function installOpenClawInternalCorePackageNativeResolver(
  options: Pick<InstallOpenClawPluginSdkNativeResolverOptions, "moduleUrl"> = {},
): string[] {
  // 降级：sdk-alias.ts 未移植，跳过 alias 注册。
  void options;
  installResolver();
  return [...pluginSdkNativeAliases.keys()].toSorted();
}

export function resetOpenClawPluginSdkNativeResolverForTest(): void {
  pluginSdkNativeAliases.clear();
  esmHooks?.deregister();
  esmHooks = undefined;
  if (installed && previousResolveFilename) {
    moduleWithResolver[nodeResolveFilenameProperty] = previousResolveFilename;
  }
  previousResolveFilename = undefined;
  installed = false;
}
