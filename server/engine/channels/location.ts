import { logger } from "../../logger.js";
import type { ChannelId } from "../../channels/types.js";

export interface ChannelLocation {
  channelId: ChannelId;
  guildId?: string;
  serverId?: string;
  workspaceId?: string;
  teamId?: string;
  channelName?: string;
  guildName?: string;
  serverName?: string;
  workspaceName?: string;
  teamName?: string;
  isPublic?: boolean;
  isPrivate?: boolean;
  isArchived?: boolean;
  metadata?: Record<string, unknown>;
}

export interface LocationResolutionResult {
  resolved: boolean;
  location?: ChannelLocation;
  reason?: string;
}

const locationCache = new Map<string, ChannelLocation>();

export function cacheChannelLocation(location: ChannelLocation): void {
  const key = buildCacheKey(location.channelId, location);
  locationCache.set(key, location);
  logger.debug(`[Channels:Location] Cached location for ${location.channelId}`);
}

export function getChannelLocation(params: {
  channelId: ChannelId;
  guildId?: string;
  channelName?: string;
}): ChannelLocation | undefined {
  for (const location of locationCache.values()) {
    if (location.channelId !== params.channelId) continue;
    if (params.guildId && location.guildId !== params.guildId) continue;
    if (params.channelName && location.channelName !== params.channelName) continue;
    return location;
  }
  return undefined;
}

export function resolveLocation(params: {
  channelId: ChannelId;
  rawLocation: Record<string, unknown>;
}): LocationResolutionResult {
  const { channelId, rawLocation } = params;

  const location: ChannelLocation = {
    channelId,
    guildId: rawLocation.guildId as string | undefined,
    serverId: rawLocation.serverId as string | undefined,
    workspaceId: rawLocation.workspaceId as string | undefined,
    teamId: rawLocation.teamId as string | undefined,
    channelName: rawLocation.channelName as string | undefined,
    guildName: rawLocation.guildName as string | undefined,
    serverName: rawLocation.serverName as string | undefined,
    workspaceName: rawLocation.workspaceName as string | undefined,
    teamName: rawLocation.teamName as string | undefined,
    isPublic: rawLocation.isPublic as boolean | undefined,
    isPrivate: rawLocation.isPrivate as boolean | undefined,
    isArchived: rawLocation.isArchived as boolean | undefined,
    metadata: rawLocation.metadata as Record<string, unknown> | undefined,
  };

  cacheChannelLocation(location);

  return {
    resolved: true,
    location,
  };
}

export function getLocationDisplayName(location: ChannelLocation): string {
  const parts: string[] = [];

  if (location.guildName || location.serverName || location.workspaceName || location.teamName) {
    parts.push(
      location.guildName ?? location.serverName ?? location.workspaceName ?? location.teamName ?? ""
    );
  }

  if (location.channelName) {
    parts.push(location.channelName);
  }

  return parts.length > 0 ? parts.join(" / ") : location.channelId;
}

export function isPublicChannel(location: ChannelLocation): boolean {
  return location.isPublic === true;
}

export function isPrivateChannel(location: ChannelLocation): boolean {
  return location.isPrivate === true || location.isPublic === false;
}

export function isArchivedChannel(location: ChannelLocation): boolean {
  return location.isArchived === true;
}

function buildCacheKey(channelId: ChannelId, location: ChannelLocation): string {
  const parts = [channelId];
  if (location.guildId) parts.push(location.guildId);
  if (location.workspaceId) parts.push(location.workspaceId);
  if (location.teamId) parts.push(location.teamId);
  return parts.join(":");
}

export function listCachedLocations(channelId?: ChannelId): ChannelLocation[] {
  let locations = Array.from(locationCache.values());
  if (channelId) {
    locations = locations.filter((l) => l.channelId === channelId);
  }
  return locations;
}

export function clearLocationCache(): void {
  locationCache.clear();
}
