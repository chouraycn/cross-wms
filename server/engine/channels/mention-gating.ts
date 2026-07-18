import { logger } from "../../logger.js";
import type { ChannelId } from "../../channels/types.js";

export type MentionType = "direct" | "everyone" | "here" | "role" | "channel";

export interface MentionInfo {
  type: MentionType;
  id?: string;
  label?: string;
  text: string;
  start: number;
  end: number;
}

export interface MentionGatingConfig {
  channelId: ChannelId;
  requireMentionInGroups: boolean;
  allowEveryoneMention: boolean;
  allowHereMention: boolean;
  allowRoleMention: boolean;
  botUserId?: string;
  botMentionPatterns: string[];
}

const gatingConfigs = new Map<ChannelId, MentionGatingConfig>();

const defaultConfig: Omit<MentionGatingConfig, "channelId"> = {
  requireMentionInGroups: true,
  allowEveryoneMention: false,
  allowHereMention: false,
  allowRoleMention: false,
  botMentionPatterns: [],
};

export function configureMentionGating(config: MentionGatingConfig): void {
  gatingConfigs.set(config.channelId, config);
  logger.debug(`[Channels:MentionGating] Configured gating for ${config.channelId}`);
}

export function getMentionGatingConfig(channelId: ChannelId): MentionGatingConfig {
  return gatingConfigs.get(channelId) ?? {
    channelId,
    ...defaultConfig,
  };
}

export function parseMentions(
  content: string,
  channelId: ChannelId
): MentionInfo[] {
  const mentions: MentionInfo[] = [];
  const config = getMentionGatingConfig(channelId);

  const directMentionRegex = /<@!?(\w+)>/g;
  let match: RegExpExecArray | null;

  while ((match = directMentionRegex.exec(content)) !== null) {
    mentions.push({
      type: "direct",
      id: match[1],
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (config.allowEveryoneMention) {
    const everyoneRegex = /@everyone/g;
    while ((match = everyoneRegex.exec(content)) !== null) {
      mentions.push({
        type: "everyone",
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  if (config.allowHereMention) {
    const hereRegex = /@here/g;
    while ((match = hereRegex.exec(content)) !== null) {
      mentions.push({
        type: "here",
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return mentions;
}

export function isBotMentioned(content: string, channelId: ChannelId): boolean {
  const config = getMentionGatingConfig(channelId);
  const mentions = parseMentions(content, channelId);

  if (config.botUserId) {
    for (const mention of mentions) {
      if (mention.type === "direct" && mention.id === config.botUserId) {
        return true;
      }
    }
  }

  for (const pattern of config.botMentionPatterns) {
    if (content.toLowerCase().includes(pattern.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export function shouldProcessMessage(params: {
  content: string;
  channelId: ChannelId;
  isDM: boolean;
  isThread?: boolean;
  senderIsBot?: boolean;
}): boolean {
  const { content, channelId, isDM, isThread, senderIsBot } = params;
  const config = getMentionGatingConfig(channelId);

  if (senderIsBot) {
    return false;
  }

  if (isDM) {
    return true;
  }

  if (isThread) {
    return true;
  }

  if (!config.requireMentionInGroups) {
    return true;
  }

  return isBotMentioned(content, channelId);
}

export function stripBotMention(content: string, channelId: ChannelId): string {
  const config = getMentionGatingConfig(channelId);
  let result = content;

  if (config.botUserId) {
    result = result.replace(new RegExp(`<@!?${config.botUserId}>\\s*`, "g"), "");
  }

  for (const pattern of config.botMentionPatterns) {
    result = result.replace(new RegExp(pattern + "\\s*", "gi"), "");
  }

  return result.trim();
}

export function hasEveryoneMention(content: string): boolean {
  return /@everyone/i.test(content);
}

export function hasHereMention(content: string): boolean {
  return /@here/i.test(content);
}

export function clearMentionGatingConfig(channelId?: ChannelId): void {
  if (channelId) {
    gatingConfigs.delete(channelId);
  } else {
    gatingConfigs.clear();
  }
}
