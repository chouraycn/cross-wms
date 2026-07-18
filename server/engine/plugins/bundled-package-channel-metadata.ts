// Collects bundled package channel metadata from plugin catalogs.
//
// 移植自 openclaw/src/plugins/bundled-package-channel-metadata.ts。
//
// 降级策略：
//  - 原文件依赖 ./channel-catalog-registry.js 的 listChannelCatalogEntries。
//    cross-wms 尚未移植该模块。这里内联降级实现：通过进程级单例存储已注册的
//    bundled 通道元数据，listChannelCatalogEntries 降级为读取该单例；
//    registerBundledPackageChannel 提供 cross-wms 专有的注册入口，供未来其他
//    模块注册 bundled 通道时使用。
//  - 原文件依赖 ./manifest.js 的 PluginPackageChannel。cross-wms 的
//    manifest-types.js 未导出该类型，这里定义本地最小结构占位。

import { resolveGlobalSingleton } from "../infra/_openclaw-stubs.js";

// ============================================================================
// 内联降级类型占位：./manifest.js —— PluginPackageChannel
// ============================================================================

/**
 * 插件包通道元数据的最小结构占位。
 *
 * 降级原因：cross-wms 的 manifest.js 尚未移植。这里定义与 openclaw
 * PluginPackageChannel 结构兼容的最小类型，仅含
 * listBundledPackageChannelMetadata 与 findBundledPackageChannelMetadata
 * 实际访问的字段。
 */
export type PluginPackageChannel = {
  id?: string;
  label?: string;
  aliases?: readonly string[];
  [key: string]: unknown;
};

// ============================================================================
// 内联降级：./channel-catalog-registry.js —— listChannelCatalogEntries
// ============================================================================

type ChannelCatalogEntry = {
  origin: string;
  channel: PluginPackageChannel;
};

type BundledPackageChannelCatalogState = {
  entries: ChannelCatalogEntry[];
};

const BUNDLED_PACKAGE_CHANNEL_CATALOG_KEY = Symbol.for(
  "openclaw.bundledPackageChannelCatalog",
);

function getBundledPackageChannelCatalogState(): BundledPackageChannelCatalogState {
  return resolveGlobalSingleton<BundledPackageChannelCatalogState>(
    BUNDLED_PACKAGE_CHANNEL_CATALOG_KEY,
    () => ({ entries: [] }),
  );
}

/**
 * 列出通道目录条目（降级占位）。
 *
 * 降级说明：cross-wms 的 channel-catalog-registry.js 尚未移植。这里降级为
 * 读取进程级单例中存储的条目，按 origin 过滤。当未注册任何通道时返回空数组。
 */
function listChannelCatalogEntries(params: { origin: string }): ChannelCatalogEntry[] {
  const state = getBundledPackageChannelCatalogState();
  return state.entries.filter((entry) => entry.origin === params.origin);
}

/**
 * 注册 bundled 通道元数据（cross-wms 专有入口）。
 *
 * 降级说明：openclaw 通过 manifest 加载流程自动填充 channel-catalog-registry。
 * cross-wms 尚未移植 manifest 加载流程，这里提供显式注册入口供未来模块使用。
 */
export function registerBundledPackageChannel(channel: PluginPackageChannel): void {
  if (!channel?.id) {
    return;
  }
  const state = getBundledPackageChannelCatalogState();
  const existing = state.entries.find(
    (entry) => entry.origin === "bundled" && entry.channel.id === channel.id,
  );
  if (existing) {
    existing.channel = channel;
    return;
  }
  state.entries.push({ origin: "bundled", channel });
}

/** 清空 bundled 通道目录（测试辅助）。 */
export function clearBundledPackageChannelCatalog(): void {
  getBundledPackageChannelCatalogState().entries.length = 0;
}

// ============================================================================
// bundled-package-channel-metadata 实现
// ============================================================================

/** Lists channel metadata contributed by bundled package manifests. */
export function listBundledPackageChannelMetadata(): readonly PluginPackageChannel[] {
  return listChannelCatalogEntries({ origin: "bundled" }).map((entry) => entry.channel);
}

/** Finds bundled package channel metadata by id or alias. */
export function findBundledPackageChannelMetadata(
  channelId: string,
): PluginPackageChannel | undefined {
  return listBundledPackageChannelMetadata().find(
    (channel) => channel.id === channelId || channel.aliases?.includes(channelId),
  );
}
