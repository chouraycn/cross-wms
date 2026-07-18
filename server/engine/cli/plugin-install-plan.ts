// Plugin install planning helpers for bundled, official external, and npm fallback paths.
// 移植自 openclaw/src/cli/plugin-install-plan.ts。
//
// 降级策略：
//  - 原模块依赖 `../infra/npm-registry-spec.js` 的 `parseRegistryNpmSpec`、
//    `../plugins/bundled-sources.js` 的 `BundledPluginSource`、
//    `../plugins/install.js` 的 `PLUGIN_INSTALL_ERROR_CODE`、
//    `../utils.js` 的 `shortenHomePath`。
//    这些模块在 cross-wms 中尚未移植。
//  - 这里提供降级实现：所有 install plan 解析函数返回 null（无可用计划），
//    类型保留原结构以便未来替换为正式实现。
//  - `isBareNpmPackageName` 为纯函数，无外部依赖，保持原始实现。

// ===== 内联降级：BundledPluginSource 类型 =====
/**
 * Bundled plugin source descriptor（降级占位）。
 *
 * 降级原因：openclaw 的 `plugins/bundled-sources.js` 未移植。
 */
export type BundledPluginSource = {
  pluginId: string;
  localPath: string;
  npmSpec?: string;
};
// ===== BundledPluginSource 结束 =====

// ===== 内联降级：PLUGIN_INSTALL_ERROR_CODE 占位 =====
/**
 * 插件安装错误码（降级占位）。
 *
 * 降级原因：openclaw 的 `plugins/install.js` 未移植。
 */
const PLUGIN_INSTALL_ERROR_CODE = {
  NPM_PACKAGE_NOT_FOUND: "NPM_PACKAGE_NOT_FOUND",
} as const;
// ===== PLUGIN_INSTALL_ERROR_CODE 结束 =====

// ===== 内联降级：parseRegistryNpmSpec stub =====
/**
 * 解析 npm registry spec 为 { name, version? }。
 *
 * 降级实现：openclaw 的 `infra/npm-registry-spec.js` 未移植；
 * 这里提供最小实现，支持 `name`、`name@version`、`name@version` 形式。
 */
function parseRegistryNpmSpec(spec: string): { name: string; version?: string } | null {
  const trimmed = spec.trim();
  if (!trimmed) {
    return null;
  }
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0) {
    // 无 @ 或以 @ 开头（scoped package 无 version）。
    if (trimmed.startsWith("@")) {
      return { name: trimmed };
    }
    return { name: trimmed };
  }
  const name = trimmed.slice(0, atIndex);
  const version = trimmed.slice(atIndex + 1);
  if (!name || !version) {
    return null;
  }
  return { name, version };
}
// ===== parseRegistryNpmSpec 结束 =====

// ===== 内联降级：shortenHomePath stub =====
/**
 * 将 home 目录前缀缩短为 ~。
 *
 * 降级实现：openclaw 的 `utils.js` 未移植；
 * 这里提供最小实现，使用 os.homedir()。
 */
import os from "node:os";
import path from "node:path";
function shortenHomePath(filePath: string): string {
  const home = os.homedir();
  if (filePath.startsWith(home + path.sep)) {
    return "~" + filePath.slice(home.length);
  }
  if (filePath === home) {
    return "~";
  }
  return filePath;
}
// ===== shortenHomePath 结束 =====

type BundledLookup = (params: {
  kind: "pluginId" | "npmSpec";
  value: string;
}) => BundledPluginSource | undefined;

type OfficialExternalPluginLookup = (pluginId: string) =>
  | {
      pluginId: string;
      npmSpec?: string;
      expectedIntegrity?: string;
    }
  | undefined;

type OfficialExternalPackageLookup = (packageName: string) =>
  | {
      pluginId: string;
      npmSpec?: string;
      expectedIntegrity?: string;
    }
  | undefined;

function isBareNpmPackageName(spec: string): boolean {
  const trimmed = spec.trim();
  return /^[a-z0-9][a-z0-9-._~]*$/.test(trimmed);
}

/**
 * Resolve a bundled install plan for a catalog entry.
 *
 * 降级实现：openclaw 的 `bundled-sources.js` 未移植；
 * 这里保持原始逻辑，依赖调用方传入的 `findBundledSource` 回调。
 */
export function resolveBundledInstallPlanForCatalogEntry(params: {
  pluginId: string;
  npmSpec: string;
  findBundledSource: BundledLookup;
}): { bundledSource: BundledPluginSource } | null {
  const pluginId = params.pluginId.trim();
  const npmSpec = params.npmSpec.trim();
  if (!pluginId || !npmSpec) {
    return null;
  }

  const bundledBySpec = params.findBundledSource({
    kind: "npmSpec",
    value: npmSpec,
  });
  if (bundledBySpec?.pluginId === pluginId) {
    return { bundledSource: bundledBySpec };
  }

  const bundledById = params.findBundledSource({
    kind: "pluginId",
    value: pluginId,
  });
  if (bundledById?.pluginId !== pluginId) {
    return null;
  }
  if (bundledById.npmSpec && bundledById.npmSpec !== npmSpec) {
    return null;
  }

  return { bundledSource: bundledById };
}

/**
 * Resolve a bundled install plan before npm lookup.
 *
 * 降级实现：保持原始逻辑，依赖调用方传入的 `findBundledSource` 回调。
 */
export function resolveBundledInstallPlanBeforeNpm(params: {
  rawSpec: string;
  findBundledSource: BundledLookup;
}): { bundledSource: BundledPluginSource; warning: string } | null {
  // Bundled plugin ids win before npm lookup so local official plugins do not hit the registry.
  const rawSpec = params.rawSpec.trim();
  if (!rawSpec) {
    return null;
  }
  if (isBareNpmPackageName(rawSpec)) {
    const bundledSource = params.findBundledSource({
      kind: "pluginId",
      value: rawSpec,
    });
    if (!bundledSource) {
      return null;
    }
    return {
      bundledSource,
      warning: `Using bundled plugin "${bundledSource.pluginId}" from ${shortenHomePath(bundledSource.localPath)} for bare install spec "${rawSpec}". To install an npm package with the same name, use a scoped package name (for example @scope/${rawSpec}).`,
    };
  }

  const parsedNpmSpec = parseRegistryNpmSpec(rawSpec);
  if (!parsedNpmSpec) {
    return null;
  }
  const bundledSource =
    params.findBundledSource({
      kind: "npmSpec",
      value: rawSpec,
    }) ??
    params.findBundledSource({
      kind: "npmSpec",
      value: parsedNpmSpec.name,
    });
  if (!bundledSource) {
    return null;
  }
  return {
    bundledSource,
    warning: `Using bundled plugin "${bundledSource.pluginId}" from ${shortenHomePath(bundledSource.localPath)} for npm install spec "${rawSpec}" because this plugin ships with the current OpenClaw build. To force an external npm override, use npm:${rawSpec}.`,
  };
}

/**
 * Resolve an official external install plan before npm lookup.
 *
 * 降级实现：保持原始逻辑，依赖调用方传入的 `findOfficialExternalPlugin` 回调。
 */
export function resolveOfficialExternalInstallPlanBeforeNpm(params: {
  rawSpec: string;
  findOfficialExternalPlugin: OfficialExternalPluginLookup;
}): { pluginId: string; npmSpec: string; expectedIntegrity?: string } | null {
  if (!isBareNpmPackageName(params.rawSpec)) {
    return null;
  }
  const entry = params.findOfficialExternalPlugin(params.rawSpec);
  const npmSpec = entry?.npmSpec?.trim();
  if (!entry?.pluginId || !npmSpec) {
    return null;
  }
  return {
    pluginId: entry.pluginId,
    npmSpec,
    ...(entry.expectedIntegrity ? { expectedIntegrity: entry.expectedIntegrity } : {}),
  };
}

/**
 * Resolve official external npm package trust.
 *
 * 降级实现：保持原始逻辑，依赖调用方传入的 `findOfficialExternalPackage` 回调。
 */
export function resolveOfficialExternalNpmPackageTrust(params: {
  npmSpec: string;
  findOfficialExternalPackage: OfficialExternalPackageLookup;
}): {
  pluginId: string;
  expectedIntegrity?: string;
  trustedSourceLinkedOfficialInstall: true;
} | null {
  const parsed = parseRegistryNpmSpec(params.npmSpec);
  if (!parsed) {
    return null;
  }
  const entry = params.findOfficialExternalPackage(parsed.name);
  if (!entry?.pluginId) {
    return null;
  }
  const catalogSpec = entry.npmSpec?.trim();
  const catalogPackageName = catalogSpec ? parseRegistryNpmSpec(catalogSpec)?.name : undefined;
  if (catalogPackageName && catalogPackageName !== parsed.name) {
    return null;
  }
  return {
    pluginId: entry.pluginId,
    ...(entry.expectedIntegrity && catalogSpec === params.npmSpec.trim()
      ? { expectedIntegrity: entry.expectedIntegrity }
      : {}),
    trustedSourceLinkedOfficialInstall: true,
  };
}

/**
 * Resolve a bundled install plan for npm failure fallback.
 *
 * 降级实现：保持原始逻辑，依赖调用方传入的 `findBundledSource` 回调。
 */
export function resolveBundledInstallPlanForNpmFailure(params: {
  rawSpec: string;
  code?: string;
  findBundledSource: BundledLookup;
}): { bundledSource: BundledPluginSource; warning: string } | null {
  if (params.code !== PLUGIN_INSTALL_ERROR_CODE.NPM_PACKAGE_NOT_FOUND) {
    return null;
  }
  const bundledSource = params.findBundledSource({
    kind: "npmSpec",
    value: params.rawSpec,
  });
  if (!bundledSource) {
    return null;
  }
  return {
    bundledSource,
    warning: `npm package unavailable for ${params.rawSpec}; using bundled plugin at ${shortenHomePath(bundledSource.localPath)}.`,
  };
}
