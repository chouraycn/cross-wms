import { logger } from "../../../logger.js";
import type { ChannelId, AccountId, AppConfig } from "../../../channels/types.js";

export interface ChannelDirectoryEntry {
  id: string;
  channelId: ChannelId;
  accountId: AccountId;
  name: string;
  type: "user" | "channel" | "group" | "team";
  parentId?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelDirectoryAdapter {
  listEntries?(params: {
    channelId: ChannelId;
    accountId: AccountId;
    type?: ChannelDirectoryEntry["type"];
    query?: string;
    limit?: number;
  }): Promise<ChannelDirectoryEntry[]>;

  getEntry?(params: {
    channelId: ChannelId;
    accountId: AccountId;
    entryId: string;
  }): Promise<ChannelDirectoryEntry | null>;

  searchEntries?(params: {
    channelId: ChannelId;
    accountId: AccountId;
    query: string;
    type?: ChannelDirectoryEntry["type"];
    limit?: number;
  }): Promise<ChannelDirectoryEntry[]>;

  getEntryMembers?(params: {
    channelId: ChannelId;
    accountId: AccountId;
    entryId: string;
  }): Promise<ChannelDirectoryEntry[]>;
}

const directoryAdapters = new Map<ChannelId, ChannelDirectoryAdapter>();

export function registerDirectoryAdapter(
  channelId: ChannelId,
  adapter: ChannelDirectoryAdapter
): void {
  directoryAdapters.set(channelId, adapter);
  logger.debug(`[Plugins:DirectoryAdapters] Registered directory adapter for ${channelId}`);
}

export function unregisterDirectoryAdapter(channelId: ChannelId): void {
  directoryAdapters.delete(channelId);
}

export function getDirectoryAdapter(channelId: ChannelId): ChannelDirectoryAdapter | undefined {
  return directoryAdapters.get(channelId);
}

export async function listDirectoryEntries(params: {
  channelId: ChannelId;
  accountId: AccountId;
  type?: ChannelDirectoryEntry["type"];
  query?: string;
  limit?: number;
}): Promise<ChannelDirectoryEntry[]> {
  const adapter = directoryAdapters.get(params.channelId);
  if (!adapter?.listEntries) {
    return [];
  }
  return adapter.listEntries(params);
}

export async function getDirectoryEntry(params: {
  channelId: ChannelId;
  accountId: AccountId;
  entryId: string;
}): Promise<ChannelDirectoryEntry | null> {
  const adapter = directoryAdapters.get(params.channelId);
  if (!adapter?.getEntry) {
    return null;
  }
  return adapter.getEntry(params);
}

export async function searchDirectory(params: {
  channelId: ChannelId;
  accountId: AccountId;
  query: string;
  type?: ChannelDirectoryEntry["type"];
  limit?: number;
}): Promise<ChannelDirectoryEntry[]> {
  const adapter = directoryAdapters.get(params.channelId);
  if (!adapter?.searchEntries) {
    const entries = await listDirectoryEntries({
      channelId: params.channelId,
      accountId: params.accountId,
      type: params.type,
      limit: params.limit,
    });
    const q = params.query.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }
  return adapter.searchEntries(params);
}

export async function getEntryMembers(params: {
  channelId: ChannelId;
  accountId: AccountId;
  entryId: string;
}): Promise<ChannelDirectoryEntry[]> {
  const adapter = directoryAdapters.get(params.channelId);
  if (!adapter?.getEntryMembers) {
    return [];
  }
  return adapter.getEntryMembers(params);
}

export function hasDirectorySupport(channelId: ChannelId): boolean {
  return directoryAdapters.has(channelId);
}
