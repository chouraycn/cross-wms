/**
 * Bundled channel catalog reader. — 移植自 openclaw/src/channels/bundled-channel-catalog-read.ts
 *
 * 降级策略：
 *  - @openclaw/normalization-core/{string-coerce,string-normalization} →
 *    cross-wms ../infra/{string-coerce,string-normalization}.js
 *  - import.meta.url → __filename（CommonJS 模块，无 import.meta）
 *  - ../infra/json-files.js (tryReadJsonSync) → ./_openclaw-stubs.js
 *  - ../infra/openclaw-root.js (resolveOpenClawPackageRootSync) → ./_openclaw-stubs.js
 *  - ../plugins/bundled-dir.js (resolveBundledPluginsDir) → ./_openclaw-stubs.js
 *  - ../plugins/manifest.js (PluginPackageChannel) → ./_openclaw-stubs.js
 *
 * 降级行为：stub 中 resolveBundledPluginsDir / resolveOpenClawPackageRootSync 返回 null，
 * 故 listBundledChannelCatalogEntries 始终返回空数组。调用方需在空目录时优雅降级。
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeOptionalLowercaseString } from "../infra/string-coerce.js";
import { uniqueStrings } from "../infra/string-normalization.js";
import {
  resolveOpenClawPackageRootSync,
  resolveBundledPluginsDir,
  tryReadJsonSync,
  type PluginPackageChannel,
} from "./_openclaw-stubs.js";

type ChannelCatalogEntryLike = {
  openclaw?: {
    channel?: PluginPackageChannel;
  };
};

type BundledChannelCatalogEntry = {
  id: string;
  channel: PluginPackageChannel;
  aliases: readonly string[];
  order: number;
};

const OFFICIAL_CHANNEL_CATALOG_RELATIVE_PATH = path.join("dist", "channel-catalog.json");
const officialCatalogFileCache = new Map<string, ChannelCatalogEntryLike[] | null>();
const bundledPackageCatalogCache = new Map<string, ChannelCatalogEntryLike[] | null>();

function listPackageRoots(): string[] {
  // Source checkouts and packaged installs can resolve OpenClaw from different roots; scan both
  // once so channel metadata works in dev, linked packages, and published CLI layouts.
  return uniqueStrings(
    [
      resolveOpenClawPackageRootSync({ cwd: process.cwd() }),
      // openclaw 使用 import.meta.url；CommonJS 改用 __filename。
      resolveOpenClawPackageRootSync({ moduleUrl: __filename }),
    ].filter((entry): entry is string => Boolean(entry)),
  );
}

function readBundledExtensionCatalogEntriesSync(): ChannelCatalogEntryLike[] {
  const pluginsDir = resolveBundledPluginsDir();
  if (!pluginsDir) {
    return [];
  }
  const cached = bundledPackageCatalogCache.get(pluginsDir);
  if (cached !== undefined) {
    return cached ?? [];
  }
  try {
    const entries = fs
      .readdirSync(pluginsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry): ChannelCatalogEntryLike[] => {
        const packageJsonPath = path.join(pluginsDir, entry.name, "package.json");
        const parsed = tryReadJsonSync<ChannelCatalogEntryLike>(packageJsonPath);
        return parsed ? [parsed] : [];
      });
    bundledPackageCatalogCache.set(pluginsDir, entries);
    return entries;
  } catch {
    bundledPackageCatalogCache.set(pluginsDir, null);
    return [];
  }
}

function readOfficialCatalogFileSync(): ChannelCatalogEntryLike[] {
  for (const packageRoot of listPackageRoots()) {
    const candidate = path.join(packageRoot, OFFICIAL_CHANNEL_CATALOG_RELATIVE_PATH);
    const cached = officialCatalogFileCache.get(candidate);
    if (cached !== undefined) {
      if (cached) {
        return cached;
      }
      continue;
    }
    if (!fs.existsSync(candidate)) {
      officialCatalogFileCache.set(candidate, null);
      continue;
    }
    const payload = tryReadJsonSync<{ entries?: unknown }>(candidate);
    if (payload) {
      const entries = Array.isArray(payload.entries)
        ? (payload.entries as ChannelCatalogEntryLike[])
        : [];
      officialCatalogFileCache.set(candidate, entries);
      return entries;
    }
    officialCatalogFileCache.set(candidate, null);
  }
  return [];
}

function isChannelCatalogEntryLike(
  entry: ChannelCatalogEntryLike | PluginPackageChannel,
): entry is ChannelCatalogEntryLike {
  return "openclaw" in entry;
}

function toBundledChannelEntry(
  entry: ChannelCatalogEntryLike | PluginPackageChannel,
): BundledChannelCatalogEntry | null {
  const channel: PluginPackageChannel | undefined = isChannelCatalogEntryLike(entry)
    ? entry.openclaw?.channel
    : entry;
  const id = normalizeOptionalLowercaseString(channel?.id);
  if (!id || !channel) {
    return null;
  }
  const aliases = Array.isArray(channel.aliases)
    ? channel.aliases
        .map((alias) => normalizeOptionalLowercaseString(alias))
        .filter((alias): alias is string => Boolean(alias))
    : [];
  const order =
    typeof channel.order === "number" && Number.isFinite(channel.order)
      ? channel.order
      : Number.MAX_SAFE_INTEGER;
  return {
    id,
    channel,
    aliases,
    order,
  };
}

/**
 * Lists bundled channel catalog entries from package manifests and generated catalog files.
 */
export function listBundledChannelCatalogEntries(): BundledChannelCatalogEntry[] {
  const entries = new Map<string, BundledChannelCatalogEntry>();
  for (const entry of readBundledExtensionCatalogEntriesSync()) {
    const channelEntry = toBundledChannelEntry(entry);
    if (channelEntry) {
      entries.set(channelEntry.id, channelEntry);
    }
  }
  for (const entry of readOfficialCatalogFileSync()) {
    const channelEntry = toBundledChannelEntry(entry);
    if (channelEntry) {
      // Package manifests win over the generated catalog when both describe the same id.
      entries.set(channelEntry.id, entries.get(channelEntry.id) ?? channelEntry);
    }
  }
  if (entries.size === 0) {
    return [];
  }
  return Array.from(entries.values()).toSorted(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}
