import { logger } from "../../logger.js";
import type { ChannelId, AccountId } from "../../channels/types.js";
import type { ChannelTarget } from "./targets.js";

export interface DirectDmConfig {
  channelId: ChannelId;
  enabled: boolean;
  requirePairing: boolean;
  allowBotInitiated: boolean;
  autoCreateThread: boolean;
}

const dmConfigs = new Map<ChannelId, DirectDmConfig>();
const dmSessions = new Map<string, {
  userId: string;
  channelId: ChannelId;
  accountId?: AccountId;
  target?: ChannelTarget;
  lastMessageAt: number;
}>();

export function configureDirectDm(config: DirectDmConfig): void {
  dmConfigs.set(config.channelId, config);
  logger.debug(`[Channels:DirectDM] Configured DM for ${config.channelId}`);
}

export function getDirectDmConfig(channelId: ChannelId): DirectDmConfig {
  return dmConfigs.get(channelId) ?? {
    channelId,
    enabled: true,
    requirePairing: false,
    allowBotInitiated: false,
    autoCreateThread: false,
  };
}

export function isDirectDmEnabled(channelId: ChannelId): boolean {
  return getDirectDmConfig(channelId).enabled;
}

export function canInitiateDm(channelId: ChannelId, isBot: boolean): boolean {
  const config = getDirectDmConfig(channelId);
  if (!config.enabled) return false;
  if (isBot && !config.allowBotInitiated) return false;
  return true;
}

export function trackDmSession(params: {
  userId: string;
  channelId: ChannelId;
  accountId?: AccountId;
  target?: ChannelTarget;
}): void {
  const key = `${params.channelId}:${params.userId}`;
  dmSessions.set(key, {
    userId: params.userId,
    channelId: params.channelId,
    accountId: params.accountId,
    target: params.target,
    lastMessageAt: Date.now(),
  });
}

export function getDmSession(channelId: ChannelId, userId: string) {
  const key = `${channelId}:${userId}`;
  return dmSessions.get(key);
}

export function updateDmActivity(channelId: ChannelId, userId: string): void {
  const key = `${channelId}:${userId}`;
  const session = dmSessions.get(key);
  if (session) {
    session.lastMessageAt = Date.now();
  }
}

export function getActiveDmSessions(channelId: ChannelId) {
  const sessions: typeof dmSessions extends Map<string, infer T> ? T[] : never[] = [];
  for (const session of dmSessions.values()) {
    if (session.channelId === channelId) {
      sessions.push(session);
    }
  }
  return sessions;
}

export function isDmTarget(target: ChannelTarget): boolean {
  return target.type === "direct";
}

export function removeDmSession(channelId: ChannelId, userId: string): boolean {
  const key = `${channelId}:${userId}`;
  return dmSessions.delete(key);
}

export function clearDmSessions(channelId?: ChannelId): void {
  if (channelId) {
    for (const [key, session] of dmSessions) {
      if (session.channelId === channelId) {
        dmSessions.delete(key);
      }
    }
  } else {
    dmSessions.clear();
  }
}

export function getDmStats(): {
  totalSessions: number;
  byChannel: Record<string, number>;
} {
  const byChannel: Record<string, number> = {};
  for (const session of dmSessions.values()) {
    byChannel[session.channelId] = (byChannel[session.channelId] ?? 0) + 1;
  }
  return {
    totalSessions: dmSessions.size,
    byChannel,
  };
}
