/**
 * Twitch 内置渠道插件
 *
 * 基于 Twitch IRC over WebSocket 协议实现消息收发：
 * - 通过 wss://irc-ws.chat.twitch.tv 连接 Twitch IRC
 * - 使用 OAuth Token 认证（oauth: 前缀或纯 Token）
 * - 支持频道（直播间）聊天消息
 *
 * 参考 OpenClaw extensions/twitch 的 IRC 模式。
 */
import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
} from "./types.js";
import type { MessageSendContext, ChannelMessageSendResult } from "./message/types.js";
import { createBuiltinChannelPlugin } from "./builtin.js";
import type { ChannelPlugin } from "./plugin.js";

export const TWITCH_CHANNEL_ID = "twitch" as ChannelId;

/** Twitch IRC WebSocket 端点 */
const TWITCH_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
/** Twitch IRC 消息长度上限 */
const TWITCH_TEXT_LIMIT = 500;

interface TwitchAccountConfig {
  /** Twitch OAuth 访问令牌 */
  accessToken: string;
  /** Twitch 用户名（小写） */
  username: string;
  /** 默认频道列表（不带 #） */
  channels?: string[];
}

export interface TwitchWebhookResult {
  success: boolean;
  type?: string;
  message?: {
    channelId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct" | "group";
  };
  error?: string;
}

/** Twitch IRC 连接管理器 */
interface TwitchConnection {
  ws: WebSocket;
  connected: boolean;
}

const twitchConnections = new Map<string, TwitchConnection>();

/** 解析频道配置 */
function parseChannels(channels: unknown): string[] {
  if (Array.isArray(channels)) {
    return channels
      .filter((c): c is string => typeof c === "string" && c.length > 0)
      .map((c) => c.replace(/^#/, "").toLowerCase());
  }
  if (typeof channels === "string") {
    return channels
      .split(/[,\s]+/)
      .map((c) => c.replace(/^#/, "").trim().toLowerCase())
      .filter((c) => c.length > 0);
  }
  return [];
}

/** 获取或创建 Twitch IRC WebSocket 连接 */
async function getOrCreateTwitchConnection(
  accountId: string,
  account: TwitchAccountConfig,
): Promise<WebSocket> {
  const existing = twitchConnections.get(accountId);
  if (existing && existing.connected && existing.ws.readyState === WebSocket.OPEN) {
    return existing.ws;
  }

  const ws = new WebSocket(TWITCH_IRC_URL);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Twitch IRC connection timeout"));
    }, 15_000);

    ws.onopen = () => {
      clearTimeout(timer);
      // Twitch IRC 认证流程
      const token = account.accessToken.startsWith("oauth:")
        ? account.accessToken
        : `oauth:${account.accessToken}`;
      ws.send(`PASS ${token}`);
      ws.send(`NICK ${account.username.toLowerCase()}`);
      // 请求 IRCv3 capabilities（消息 ID 等）
      ws.send("CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands");
      resolve();
    };

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Twitch IRC connection error"));
    };
  });

  // 加入默认频道
  const channels = account.channels ?? [];
  for (const ch of channels) {
    ws.send(`JOIN #${ch}`);
  }

  twitchConnections.set(accountId, { ws, connected: true });

  ws.onclose = () => {
    twitchConnections.delete(accountId);
  };
  ws.onerror = () => {
    twitchConnections.delete(accountId);
  };

  return ws;
}

export function createTwitchChannelPlugin(): ChannelPlugin {
  const twitchMeta: ChannelMeta = {
    id: TWITCH_CHANNEL_ID,
    label: "Twitch",
    selectionLabel: "Twitch",
    blurb: "Twitch 直播间聊天消息通道（IRC over WebSocket）",
    docsPath: "/channels/twitch",
    aliases: ["twitch", "tw"],
    markdownCapable: false,
  };

  const twitchCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: false,
    reactions: false,
    threads: false,
    polls: false,
    mentions: true,
    voice: false,
    video: false,
    typing: false,
  };

  const twitchConfig: ChannelConfigAdapter<TwitchAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const twConfig = config.twitch as Record<string, unknown> | undefined;
      if (twConfig && twConfig.accessToken && twConfig.username) {
        return [TWITCH_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (
      config: AppConfig,
      accountId: ChannelId,
    ): TwitchAccountConfig | null => {
      if (accountId !== TWITCH_CHANNEL_ID) return null;
      const twCfg = config.twitch as Record<string, unknown> | undefined;
      if (twCfg && twCfg.accessToken && twCfg.username) {
        return {
          accessToken: String(twCfg.accessToken),
          username: String(twCfg.username),
          channels: parseChannels(twCfg.channels),
        };
      }
      return null;
    },
    isEnabled: (account: TwitchAccountConfig): boolean => {
      return !!account.accessToken && !!account.username;
    },
    isConfigured: (account: TwitchAccountConfig): boolean => {
      return !!account.accessToken && !!account.username;
    },
  };

  const twitchMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = twitchConfig.resolveAccount(
          { twitch: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Twitch account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const target = ctx.to;
          if (!target) {
            return { success: false, error: "Twitch target channel not provided" };
          }

          // 规范化频道名（确保带 # 前缀，小写）
          const channel = target.startsWith("#")
            ? target.toLowerCase()
            : `#${target.toLowerCase()}`;

          const ws = await getOrCreateTwitchConnection(TWITCH_CHANNEL_ID, account);

          // 按行发送
          const lines = text.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const chunk = trimmed.length > TWITCH_TEXT_LIMIT
              ? trimmed.slice(0, TWITCH_TEXT_LIMIT - 3) + "..."
              : trimmed;
            ws.send(`PRIVMSG ${channel} :${chunk}`);
          }

          return {
            success: true,
            messageId: `twitch-${Date.now()}`,
          };
        } catch (error) {
          return {
            success: false,
            error: `Twitch send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: TWITCH_CHANNEL_ID,
    meta: twitchMeta,
    capabilities: twitchCapabilities,
    config: twitchConfig,
    message: twitchMessageAdapter,
  });
}

/**
 * 解析 Twitch IRC 协议消息行。
 *
 * Twitch IRC 使用标准 IRC 格式，但带 IRCv3 tags（如 @id=...;display-name=...）。
 */
export function parseTwitchIrcLine(line: string): TwitchWebhookResult {
  if (!line || typeof line !== "string") {
    return { success: false, error: "Empty Twitch IRC line" };
  }

  // PING/PONG 处理
  if (line.startsWith("PING")) {
    return { success: false, type: "ping", error: "PING request" };
  }

  // 提取 IRCv3 tags（@key=value;key=value 前缀）
  let tags: Record<string, string> = {};
  let workLine = line;

  if (workLine.startsWith("@")) {
    const spaceIdx = workLine.indexOf(" ");
    if (spaceIdx === -1) {
      return { success: false, error: "Malformed Twitch IRC tag line" };
    }
    const tagStr = workLine.slice(1, spaceIdx);
    workLine = workLine.slice(spaceIdx + 1);
    for (const pair of tagStr.split(";")) {
      const [key, value] = pair.split("=", 2);
      if (key) {
        tags[key] = value || "";
      }
    }
  }

  // 解析前缀和命令
  let prefix = "";
  let trailing = "";

  if (workLine.startsWith(":")) {
    const spaceIdx = workLine.indexOf(" ");
    if (spaceIdx === -1) {
      return { success: false, error: "Malformed Twitch IRC line" };
    }
    prefix = workLine.slice(1, spaceIdx);
    workLine = workLine.slice(spaceIdx + 1);
  }

  // 提取 trailing 参数
  const colonIdx = workLine.indexOf(" :");
  if (colonIdx !== -1) {
    trailing = workLine.slice(colonIdx + 2);
    workLine = workLine.slice(0, colonIdx);
  }

  const parts = workLine.split(" ");
  const command = parts[0];

  if (command !== "PRIVMSG") {
    return { success: false, error: `Unsupported Twitch IRC command: ${command}` };
  }

  const target = parts[1];
  if (!target || !trailing) {
    return { success: false, error: "Missing target or message text" };
  }

  // 从 prefix 提取用户名（nick!user@host 或 nick.tmi.twitch.tv）
  const nickMatch = prefix.match(/^([^!]+)!/);
  const nick = nickMatch ? nickMatch[1] : prefix;
  // 优先使用 tag 中的 display-name
  const displayName = tags["display-name"] || nick;
  // 优先使用 tag 中的 id 作为消息 ID
  const messageId = tags["id"] || `${nick}-${target}-${Date.now()}`;
  // user-id tag
  const userId = tags["user-id"] || nick;

  return {
    success: true,
    type: "message",
    message: {
      channelId: target,
      userId,
      messageId,
      text: trailing,
      timestamp: tags["tmi-sent-ts"] ? Number(tags["tmi-sent-ts"]) : Date.now(),
      chatType: "group",
    },
  };
}

/** 关闭所有 Twitch 连接 */
export function closeAllTwitchConnections(): void {
  for (const [, conn] of twitchConnections) {
    try {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send("QUIT :Connection closed");
        conn.ws.close();
      }
    } catch {
    }
  }
  twitchConnections.clear();
}
