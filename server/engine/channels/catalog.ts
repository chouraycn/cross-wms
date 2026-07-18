// 移植自 openclaw/src/channels/plugins/catalog.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelUiMetaEntry = unknown;

export type ChannelUiCatalog = unknown;

export type ChannelPluginCatalogInstall = unknown;

export type ChannelPluginCatalogEntry = unknown;

export function buildChannelUiCatalog(..._args: unknown[]): unknown {
  throw new Error("not implemented: buildChannelUiCatalog");
}

export function listRawChannelPluginCatalogEntries(..._args: unknown[]): unknown {
  throw new Error("not implemented: listRawChannelPluginCatalogEntries");
}

export function listChannelPluginCatalogEntries(..._args: unknown[]): unknown {
  throw new Error("not implemented: listChannelPluginCatalogEntries");
}

export function getChannelPluginCatalogEntry(..._args: unknown[]): unknown {
  throw new Error("not implemented: getChannelPluginCatalogEntry");
}
