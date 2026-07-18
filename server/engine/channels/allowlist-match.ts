import { logger } from "../../logger.js";
import type { ChannelId } from "../../channels/types.js";

export type AllowlistEntryType = "user" | "email" | "domain" | "group" | "role" | "phone";

export interface AllowlistEntry {
  type: AllowlistEntryType;
  value: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelAllowlist {
  channelId: ChannelId;
  dmEntries: AllowlistEntry[];
  groupEntries: AllowlistEntry[];
  enabled: boolean;
  defaultAllow: boolean;
}

const allowlists = new Map<ChannelId, ChannelAllowlist>();

export function setChannelAllowlist(allowlist: ChannelAllowlist): void {
  allowlists.set(allowlist.channelId, allowlist);
  logger.debug(`[Channels:AllowlistMatch] Set allowlist for ${allowlist.channelId}`);
}

export function getChannelAllowlist(channelId: ChannelId): ChannelAllowlist | undefined {
  return allowlists.get(channelId);
}

export function addAllowlistEntry(
  channelId: ChannelId,
  scope: "dm" | "group",
  entry: AllowlistEntry
): void {
  const allowlist = getOrCreateAllowlist(channelId);
  const entries = scope === "dm" ? allowlist.dmEntries : allowlist.groupEntries;

  const exists = entries.some(
    (e) => e.type === entry.type && e.value === entry.value
  );

  if (!exists) {
    entries.push(entry);
  }
}

export function removeAllowlistEntry(
  channelId: ChannelId,
  scope: "dm" | "group",
  entry: AllowlistEntry
): boolean {
  const allowlist = allowlists.get(channelId);
  if (!allowlist) return false;

  const entries = scope === "dm" ? allowlist.dmEntries : allowlist.groupEntries;
  const idx = entries.findIndex(
    (e) => e.type === entry.type && e.value === entry.value
  );

  if (idx >= 0) {
    entries.splice(idx, 1);
    return true;
  }

  return false;
}

export function matchAllowlist(params: {
  channelId: ChannelId;
  scope: "dm" | "group";
  userId?: string;
  email?: string;
  domain?: string;
  groupId?: string;
  role?: string;
  phone?: string;
}): boolean {
  const allowlist = allowlists.get(params.channelId);

  if (!allowlist || !allowlist.enabled) {
    return allowlist?.defaultAllow ?? true;
  }

  const entries =
    params.scope === "dm" ? allowlist.dmEntries : allowlist.groupEntries;

  if (entries.length === 0) {
    return allowlist.defaultAllow;
  }

  const values: Partial<Record<AllowlistEntryType, string | undefined>> = {
    user: params.userId,
    email: params.email,
    domain: params.domain,
    group: params.groupId,
    role: params.role,
    phone: params.phone,
  };

  for (const entry of entries) {
    const value = values[entry.type];
    if (value && matchEntry(entry, value)) {
      return true;
    }
  }

  return false;
}

function matchEntry(entry: AllowlistEntry, value: string): boolean {
  if (entry.type === "domain") {
    return value.toLowerCase().endsWith(`@${entry.value.toLowerCase()}`);
  }
  return entry.value.toLowerCase() === value.toLowerCase();
}

function getOrCreateAllowlist(channelId: ChannelId): ChannelAllowlist {
  let allowlist = allowlists.get(channelId);
  if (!allowlist) {
    allowlist = {
      channelId,
      dmEntries: [],
      groupEntries: [],
      enabled: false,
      defaultAllow: true,
    };
    allowlists.set(channelId, allowlist);
  }
  return allowlist;
}

export function enableAllowlist(channelId: ChannelId, enabled: boolean): void {
  const allowlist = getOrCreateAllowlist(channelId);
  allowlist.enabled = enabled;
}

export function setDefaultAllow(channelId: ChannelId, defaultAllow: boolean): void {
  const allowlist = getOrCreateAllowlist(channelId);
  allowlist.defaultAllow = defaultAllow;
}

export function clearAllowlist(channelId: ChannelId): void {
  allowlists.delete(channelId);
}

export function clearAllAllowlists(): void {
  allowlists.clear();
}
