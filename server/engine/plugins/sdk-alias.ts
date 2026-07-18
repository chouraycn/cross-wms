/**
 * Resolves plugin SDK aliases for public package imports.
 * 移植自 openclaw/src/plugins/sdk-alias.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginSdkResolutionPreference = unknown;

export type LoaderModuleResolveParams = unknown;

export type PluginRuntimeModuleResolution = unknown;

export function normalizeJitiAliasTargetPath(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeJitiAliasTargetPath");
}

export function resolvePluginLoaderJitiFsCacheDir(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginLoaderJitiFsCacheDir");
}

export function resolvePluginLoaderJitiFsCacheOption(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginLoaderJitiFsCacheOption");
}

export function resolveLoaderPackageRoot(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveLoaderPackageRoot");
}

export function resolvePluginSdkAliasCandidateOrder(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginSdkAliasCandidateOrder");
}

export function listPluginSdkAliasCandidates(...args: unknown[]): unknown {
  throw new Error("not implemented: listPluginSdkAliasCandidates");
}

export function resolvePluginSdkAliasFile(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginSdkAliasFile");
}

export function listWorkspacePackageExportAliasEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: listWorkspacePackageExportAliasEntries");
}

export function listPluginSdkExportedSubpaths(...args: unknown[]): unknown {
  throw new Error("not implemented: listPluginSdkExportedSubpaths");
}

export function resolvePluginSdkScopedAliasMap(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginSdkScopedAliasMap");
}

export function resolveExtensionApiAlias(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExtensionApiAlias");
}

export function buildPluginLoaderAliasMap(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginLoaderAliasMap");
}

export function resolvePluginRuntimeModulePath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginRuntimeModulePath");
}

export function resolvePluginRuntimeModulePathWithDiagnostics(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginRuntimeModulePathWithDiagnostics");
}

export function buildPluginLoaderJitiOptions(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginLoaderJitiOptions");
}

export function shouldPreferNativeModuleLoad(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldPreferNativeModuleLoad");
}

export function resolvePluginLoaderTryNative(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginLoaderTryNative");
}

export function createPluginLoaderModuleCacheKey(...args: unknown[]): unknown {
  throw new Error("not implemented: createPluginLoaderModuleCacheKey");
}

export function resolvePluginLoaderModuleConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginLoaderModuleConfig");
}

export function isBundledPluginExtensionPath(...args: unknown[]): unknown {
  throw new Error("not implemented: isBundledPluginExtensionPath");
}

