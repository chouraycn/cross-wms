import { logger } from "../../logger.js";
import type { ChannelId } from "../../channels/types.js";

export type CommandScope = "dm" | "group" | "all";

export interface CommandGatingConfig {
  channelId: ChannelId;
  enabled: boolean;
  allowedCommands: string[];
  blockedCommands: string[];
  scope: CommandScope;
  requireAdmin: boolean;
  adminUsers: string[];
  prefix: string;
}

const gatingConfigs = new Map<ChannelId, CommandGatingConfig>();

const defaultConfig: Omit<CommandGatingConfig, "channelId"> = {
  enabled: true,
  allowedCommands: [],
  blockedCommands: [],
  scope: "all",
  requireAdmin: false,
  adminUsers: [],
  prefix: "/",
};

export function configureCommandGating(config: CommandGatingConfig): void {
  gatingConfigs.set(config.channelId, config);
  logger.debug(`[Channels:CommandGating] Configured for ${config.channelId}`);
}

export function getCommandGatingConfig(channelId: ChannelId): CommandGatingConfig {
  return gatingConfigs.get(channelId) ?? {
    channelId,
    ...defaultConfig,
  };
}

export function isCommand(content: string, channelId: ChannelId): boolean {
  const config = getCommandGatingConfig(channelId);
  return content.startsWith(config.prefix);
}

export function extractCommandName(content: string, channelId: ChannelId): string | null {
  const config = getCommandGatingConfig(channelId);
  if (!content.startsWith(config.prefix)) return null;

  const rest = content.slice(config.prefix.length);
  const match = rest.match(/^(\w+)/);
  return match ? match[1] : null;
}

export function canExecuteCommand(params: {
  channelId: ChannelId;
  command: string;
  isDM: boolean;
  userId?: string;
  isAdmin?: boolean;
}): {
  allowed: boolean;
  reason?: string;
} {
  const { channelId, command, isDM, userId, isAdmin } = params;
  const config = getCommandGatingConfig(channelId);

  if (!config.enabled) {
    return { allowed: false, reason: "Commands are disabled" };
  }

  if (config.scope === "dm" && !isDM) {
    return { allowed: false, reason: "Commands only allowed in DM" };
  }

  if (config.scope === "group" && isDM) {
    return { allowed: false, reason: "Commands only allowed in groups" };
  }

  if (config.requireAdmin && !isAdmin) {
    if (!userId || !config.adminUsers.includes(userId)) {
      return { allowed: false, reason: "Admin privileges required" };
    }
  }

  if (config.allowedCommands.length > 0 && !config.allowedCommands.includes(command)) {
    return { allowed: false, reason: `Command "${command}" not in allowlist` };
  }

  if (config.blockedCommands.includes(command)) {
    return { allowed: false, reason: `Command "${command}" is blocked` };
  }

  return { allowed: true };
}

export function addAllowedCommand(channelId: ChannelId, command: string): void {
  const config = getCommandGatingConfig(channelId);
  if (!config.allowedCommands.includes(command)) {
    config.allowedCommands.push(command);
  }
}

export function addBlockedCommand(channelId: ChannelId, command: string): void {
  const config = getCommandGatingConfig(channelId);
  if (!config.blockedCommands.includes(command)) {
    config.blockedCommands.push(command);
  }
}

export function addAdminUser(channelId: ChannelId, userId: string): void {
  const config = getCommandGatingConfig(channelId);
  if (!config.adminUsers.includes(userId)) {
    config.adminUsers.push(userId);
  }
}

export function isAdminUser(channelId: ChannelId, userId: string): boolean {
  const config = getCommandGatingConfig(channelId);
  return config.adminUsers.includes(userId);
}

export function removeCommandGatingConfig(channelId: ChannelId): boolean {
  return gatingConfigs.delete(channelId);
}

export function clearCommandGatingConfigs(): void {
  gatingConfigs.clear();
}
