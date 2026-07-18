/**
 * * Reads official external plugin/channel/provider catalogs into manifest-like metadata.
 * 移植自 openclaw/src/plugins/official-external-plugin-catalog.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type OfficialExternalProviderAuthChoice = unknown;

export type OfficialExternalProviderCatalogProvider = unknown;

export type OfficialExternalWebSearchProvider = unknown;

export type OfficialExternalPluginCatalogManifest = unknown;

export type OfficialExternalPluginCatalogEntry = unknown;

export function getOfficialExternalPluginCatalogManifest(...args: unknown[]): unknown {
  throw new Error("not implemented: getOfficialExternalPluginCatalogManifest");
}

export function resolveOfficialExternalPluginId(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOfficialExternalPluginId");
}

export function resolveOfficialExternalPluginLabel(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOfficialExternalPluginLabel");
}

export function resolveOfficialExternalPluginInstall(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOfficialExternalPluginInstall");
}

export function listOfficialExternalPluginCatalogEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: listOfficialExternalPluginCatalogEntries");
}

export function resolveOfficialExternalProviderContractPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOfficialExternalProviderContractPluginIds");
}

export function resolveOfficialExternalWebProviderContractPluginIdsForEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOfficialExternalWebProviderContractPluginIdsForEnv");
}

export function resolveOfficialExternalProviderPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOfficialExternalProviderPluginIds");
}

export function resolveOfficialExternalProviderPluginIdsForEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOfficialExternalProviderPluginIdsForEnv");
}

export function listOfficialExternalChannelCatalogEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: listOfficialExternalChannelCatalogEntries");
}

export function listOfficialExternalChannelEnvVars(...args: unknown[]): unknown {
  throw new Error("not implemented: listOfficialExternalChannelEnvVars");
}

export function listOfficialExternalProviderCatalogEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: listOfficialExternalProviderCatalogEntries");
}

export function getOfficialExternalPluginCatalogEntry(...args: unknown[]): unknown {
  throw new Error("not implemented: getOfficialExternalPluginCatalogEntry");
}

export function getOfficialExternalPluginCatalogEntryForPackage(...args: unknown[]): unknown {
  throw new Error("not implemented: getOfficialExternalPluginCatalogEntryForPackage");
}

