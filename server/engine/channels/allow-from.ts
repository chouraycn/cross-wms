import { logger } from "../../logger.js";
import type { ChannelId } from "../../channels/types.js";

export type AllowFromSource = "dm" | "group" | "all";

export interface AllowFromConfig {
  channelId: ChannelId;
  source: AllowFromSource;
  allowedUsers?: string[];
  allowedGroups?: string[];
  allowedRoles?: string[];
  blockedUsers?: string[];
  enabled: boolean;
}

const allowFromConfigs = new Map<ChannelId, AllowFromConfig>();

export function configureAllowFrom(config: AllowFromConfig): void {
  allowFromConfigs.set(config.channelId, config);
  logger.debug(`[Channels:AllowFrom] Configured allow-from for ${config.channelId}`);
}

export function getAllowFromConfig(channelId: ChannelId): AllowFromConfig | undefined {
  return allowFromConfigs.get(channelId);
}

export function checkAllowFrom(params: {
  channelId: ChannelId;
  source: AllowFromSource;
  userId?: string;
  groupId?: string;
  role?: string;
}): boolean {
  const config = allowFromConfigs.get(params.channelId);

  if (!config || !config.enabled) {
    return true;
  }

  if (config.source === "all") {
    return true;
  }

  if (config.source === "dm" && params.source !== "dm") {
    return false;
  }

  if (config.source === "group" && params.source !== "group") {
    return false;
  }

  if (config.blockedUsers?.includes(params.userId ?? "")) {
    return false;
  }

  if (config.allowedUsers && config.allowedUsers.length > 0) {
    if (!params.userId || !config.allowedUsers.includes(params.userId)) {
      return false;
    }
  }

  if (config.allowedGroups && config.allowedGroups.length > 0) {
    if (!params.groupId || !config.allowedGroups.includes(params.groupId)) {
      return false;
    }
  }

  if (config.allowedRoles && config.allowedRoles.length > 0) {
    if (!params.role || !config.allowedRoles.includes(params.role)) {
      return false;
    }
  }

  return true;
}

export function allowFromDM(channelId: ChannelId): boolean {
  const config = allowFromConfigs.get(channelId);
  if (!config || !config.enabled) return true;
  return config.source === "dm" || config.source === "all";
}

export function allowFromGroup(channelId: ChannelId): boolean {
  const config = allowFromConfigs.get(channelId);
  if (!config || !config.enabled) return true;
  return config.source === "group" || config.source === "all";
}

export function isUserBlocked(channelId: ChannelId, userId: string): boolean {
  const config = allowFromConfigs.get(channelId);
  if (!config || !config.enabled) return false;
  return config.blockedUsers?.includes(userId) ?? false;
}

export function isUserAllowed(channelId: ChannelId, userId: string): boolean {
  const config = allowFromConfigs.get(channelId);
  if (!config || !config.enabled) return true;
  if (config.allowedUsers && config.allowedUsers.length > 0) {
    return config.allowedUsers.includes(userId);
  }
  return !isUserBlocked(channelId, userId);
}

export function removeAllowFromConfig(channelId: ChannelId): boolean {
  return allowFromConfigs.delete(channelId);
}

export function clearAllowFromConfigs(): void {
  allowFromConfigs.clear();
}
