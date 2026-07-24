// 移植自 openclaw/src/channels/plugins/catalog.ts
// 降级：channel plugin 依赖简化

export type ChannelUiMetaEntry = {
  provider: string;
  label?: string;
  description?: string;
  iconUrl?: string;
  [key: string]: unknown;
};

export type ChannelUiCatalog = {
  entries: ChannelUiMetaEntry[];
};

export type ChannelPluginCatalogInstall = {
  spec: string;
  version?: string;
  integrity?: string;
};

export type ChannelPluginCatalogEntry = {
  provider: string;
  label?: string;
  description?: string;
  install?: ChannelPluginCatalogInstall;
  bundled?: boolean;
  official?: boolean;
  [key: string]: unknown;
};

/** Builds a channel UI catalog from available entries. */
export function buildChannelUiCatalog(entries?: ChannelPluginCatalogEntry[]): ChannelUiCatalog {
  return {
    entries: (entries ?? []).map((entry) => ({
      provider: entry.provider,
      label: entry.label,
      description: entry.description,
      iconUrl: entry.iconUrl as string | undefined,
    })),
  };
}

/** Lists raw channel plugin catalog entries. Simplified without plugin discovery. */
export function listRawChannelPluginCatalogEntries(_params?: unknown): ChannelPluginCatalogEntry[] {
  return [];
}

/** Lists channel plugin catalog entries. Simplified without plugin discovery. */
export function listChannelPluginCatalogEntries(_params?: unknown): ChannelPluginCatalogEntry[] {
  return [];
}

/** Gets a single channel plugin catalog entry. */
export function getChannelPluginCatalogEntry(params: { provider: string }): ChannelPluginCatalogEntry | null {
  if (!params.provider?.trim()) return null;
  return null;
}
