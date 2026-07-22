/**
 * IRC 内置渠道插件
 *
 * 基于 IRC 协议实现消息收发：
 * - 通过 TCP/TLS 连接 IRC 服务器
 * - 支持 NickServ 身份验证
 * - 支持频道（群组）和私聊（直接）消息
 *
 * 参考 OpenClaw extensions/irc 的协议模式，使用 Node.js net/tls 模块。
 */
import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
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

export const IRC_CHANNEL_ID = "irc" as ChannelId;

/** IRC 消息最大长度（含 \r\n） */
const IRC_MESSAGE_LIMIT = 512;
/** IRC 消息正文建议上限 */
const IRC_TEXT_LIMIT = 400;

interface IrcAccountConfig {
  /** IRC 服务器主机名 */
  host: string;
  /** IRC 服务器端口 */
  port?: number;
  /** 是否使用 TLS */
  tls?: boolean;
  /** 昵称 */
  nick: string;
  /** 用户名 */
  username?: string;
  /** 真实姓名 */
  realname?: string;
  /** 服务器密码 */
  password?: string;
  /** NickServ 密码 */
  nickServPassword?: string;
  /** 默认频道列表（#channel 或 &channel） */
  channels?: string[];
}

export interface IrcWebhookResult {
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

/** 解析 IRC 配置中的频道列表 */
function parseChannels(channels: unknown): string[] {
  if (Array.isArray(channels)) {
    return channels.filter((c): c is string => typeof c === "string" && c.length > 0);
  }
  if (typeof channels === "string") {
    return channels
      .split(/[,\s]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }
  return [];
}

/** IRC 连接管理器 */
interface IrcConnection {
  socket: Socket | TLSSocket;
  connected: boolean;
}

const connections = new Map<string, IrcConnection>();

/** 创建 IRC 连接（net 或 tls） */
function createIrcConnection(account: IrcAccountConfig): Promise<Socket | TLSSocket> {
  return new Promise((resolve, reject) => {
    const useTls = account.tls ?? false;
    const port = account.port ?? (useTls ? 6697 : 6667);

    const socket: Socket | TLSSocket = useTls
      ? tlsConnect({ host: account.host, port, rejectUnauthorized: false })
      : createConnection({ host: account.host, port });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`IRC connection timeout to ${account.host}:${port}`));
    }, 15_000);

    socket.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect", () => {
      if (!useTls) {
        clearTimeout(timer);
        resolve(socket);
      }
    });
    socket.once("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** 发送 IRC 原始命令 */
function sendRaw(socket: Socket | TLSSocket, command: string): void {
  const line = command.length > IRC_MESSAGE_LIMIT - 2
    ? command.slice(0, IRC_MESSAGE_LIMIT - 2)
    : command;
  socket.write(`${line}\r\n`);
}

/** 注册 IRC 连接（NICK + USER + PASS） */
async function registerIrcConnection(
  socket: Socket | TLSSocket,
  account: IrcAccountConfig,
): Promise<void> {
  if (account.password) {
    sendRaw(socket, `PASS ${account.password}`);
  }
  sendRaw(socket, `NICK ${account.nick}`);
  sendRaw(
    socket,
    `USER ${account.username || account.nick} 0 * :${account.realname || account.nick}`,
  );

  // 等待 001 RPL_WELCOME 后加入频道
  await new Promise<void>((resolve) => {
    let welcomed = false;
    const onData = (data: Buffer) => {
      const lines = data.toString("utf-8").split("\r\n");
      for (const line of lines) {
        if (!line) continue;
        // 001 RPL_WELCOME
        if (line.startsWith(`:${account.host} 001`)) {
          welcomed = true;
          // NickServ 认证
          if (account.nickServPassword) {
            sendRaw(
              socket,
              `PRIVMSG NickServ :IDENTIFY ${account.nickServPassword}`,
            );
          }
          // 加入频道
          const channels = account.channels ?? [];
          if (channels.length > 0) {
            for (const ch of channels) {
              sendRaw(socket, `JOIN ${ch}`);
            }
          }
          socket.off("data", onData);
          resolve();
          break;
        }
      }
      if (!welcomed) {
        // 继续等待
      }
    };
    socket.on("data", onData);
    // 超时保护
    setTimeout(() => {
      if (!welcomed) {
        socket.off("data", onData);
        resolve();
      }
    }, 10_000);
  });
}

/** 获取或创建 IRC 连接 */
async function getOrCreateConnection(
  accountId: string,
  account: IrcAccountConfig,
): Promise<Socket | TLSSocket> {
  const existing = connections.get(accountId);
  if (existing && existing.connected && !existing.socket.destroyed) {
    return existing.socket;
  }

  const socket = await createIrcConnection(account);
  await registerIrcConnection(socket, account);
  connections.set(accountId, { socket, connected: true });

  socket.on("close", () => {
    connections.delete(accountId);
  });
  socket.on("error", () => {
    connections.delete(accountId);
  });

  return socket;
}

export function createIrcChannelPlugin(): ChannelPlugin {
  const ircMeta: ChannelMeta = {
    id: IRC_CHANNEL_ID,
    label: "IRC",
    selectionLabel: "IRC",
    blurb: "IRC 协议消息通道",
    docsPath: "/channels/irc",
    aliases: ["irc"],
    markdownCapable: false,
  };

  const ircCapabilities: ChannelCapabilities = {
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

  const ircConfig: ChannelConfigAdapter<IrcAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const ircConfig = config.irc as Record<string, unknown> | undefined;
      if (ircConfig && ircConfig.host && ircConfig.nick) {
        return [IRC_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (
      config: AppConfig,
      accountId: ChannelId,
    ): IrcAccountConfig | null => {
      if (accountId !== IRC_CHANNEL_ID) return null;
      const ircCfg = config.irc as Record<string, unknown> | undefined;
      if (ircCfg && ircCfg.host && ircCfg.nick) {
        return {
          host: String(ircCfg.host),
          port: ircCfg.port as number | undefined,
          tls: ircCfg.tls as boolean | undefined,
          nick: String(ircCfg.nick),
          username: ircCfg.username as string | undefined,
          realname: ircCfg.realname as string | undefined,
          password: ircCfg.password as string | undefined,
          nickServPassword: ircCfg.nickServPassword as string | undefined,
          channels: parseChannels(ircCfg.channels),
        };
      }
      return null;
    },
    isEnabled: (account: IrcAccountConfig): boolean => {
      return !!account.host && !!account.nick;
    },
    isConfigured: (account: IrcAccountConfig): boolean => {
      return !!account.host && !!account.nick;
    },
  };

  const ircMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = ircConfig.resolveAccount(
          { irc: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "IRC account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const target = ctx.to;
          if (!target) {
            return { success: false, error: "IRC target (channel/nick) not provided" };
          }

          const socket = await getOrCreateConnection(IRC_CHANNEL_ID, account);

          // IRC 按行发送多条消息
          const lines = text.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const chunk = trimmed.length > IRC_TEXT_LIMIT
              ? trimmed.slice(0, IRC_TEXT_LIMIT - 3) + "..."
              : trimmed;
            sendRaw(socket, `PRIVMSG ${target} :${chunk}`);
          }

          return {
            success: true,
            messageId: `irc-${Date.now()}`,
          };
        } catch (error) {
          return {
            success: false,
            error: `IRC send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: IRC_CHANNEL_ID,
    meta: ircMeta,
    capabilities: ircCapabilities,
    config: ircConfig,
    message: ircMessageAdapter,
  });
}

/**
 * 解析 IRC 协议行（RFC 2812 格式）。
 *
 * 将 `:nick!user@host PRIVMSG #channel :message text` 解析为结构化消息。
 */
export function parseIrcLine(line: string): IrcWebhookResult {
  if (!line || typeof line !== "string") {
    return { success: false, error: "Empty IRC line" };
  }

  // PING/PONG 处理
  if (line.startsWith("PING")) {
    return { success: false, type: "ping", error: "PING request" };
  }

  // 解析前缀和命令
  let prefix = "";
  let trailing = "";
  let workLine = line;

  if (workLine.startsWith(":")) {
    const spaceIdx = workLine.indexOf(" ");
    if (spaceIdx === -1) {
      return { success: false, error: "Malformed IRC line" };
    }
    prefix = workLine.slice(1, spaceIdx);
    workLine = workLine.slice(spaceIdx + 1);
  }

  // 提取 trailing 参数（: 之后的内容）
  const colonIdx = workLine.indexOf(" :");
  if (colonIdx !== -1) {
    trailing = workLine.slice(colonIdx + 2);
    workLine = workLine.slice(0, colonIdx);
  }

  const parts = workLine.split(" ");
  const command = parts[0];

  if (command !== "PRIVMSG") {
    return { success: false, error: `Unsupported IRC command: ${command}` };
  }

  const target = parts[1];
  if (!target || !trailing) {
    return { success: false, error: "Missing target or message text" };
  }

  // 从 prefix 提取 nick!user@host
  const nickMatch = prefix.match(/^([^!]+)!/);
  const nick = nickMatch ? nickMatch[1] : prefix;

  // 判断是频道消息还是私聊
  const isChannel = target.startsWith("#") || target.startsWith("&") || target.startsWith("+");

  return {
    success: true,
    type: "message",
    message: {
      channelId: target,
      userId: nick,
      messageId: `${nick}-${target}-${Date.now()}`,
      text: trailing,
      timestamp: Date.now(),
      chatType: isChannel ? "group" : "direct",
    },
  };
}

/** 关闭所有 IRC 连接 */
export function closeAllIrcConnections(): void {
  for (const [, conn] of connections) {
    try {
      if (!conn.socket.destroyed) {
        sendRaw(conn.socket, "QUIT :Connection closed");
        conn.socket.end();
      }
    } catch {
    }
  }
  connections.clear();
}
