/**
 * Tlon/Urbit 内置渠道插件
 *
 * 基于 Urbit HTTP API 实现 Tlon 消息通道：
 * - 通过 /~/login 获取认证 cookie
 * - 通过 poke 到 /~/channel/{channelId} 发送消息
 * - DM 消息：app="chat", mark="chat-dm-action"
 * - 群组消息：app="channels", mark="channel-action-1"
 * - 通过 SSE 或轮询 /~/channel/{channelId} 接收消息
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

export const TLON_CHANNEL_ID = "tlon" as ChannelId;

/** Tlon/Urbit 账户配置 */
export interface TlonAccountConfig {
  /** Urbit ship URL（如 https://ship.tlon.network） */
  shipUrl: string;
  /** Ship 名称（如 ~zod 或 zod） */
  shipName: string;
  /** 认证密码/code */
  code: string;
  /** Urbit 通道 ID（用于 poke 和 SSE） */
  channelId?: string;
}

/** Tlon webhook/事件解析结果 */
export interface TlonWebhookResult {
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

/** Tlon 消息长度限制 */
const TLON_TEXT_LIMIT = 4096;

/** 缓存的认证 cookie（按 shipUrl 键） */
const cookieCache = new Map<string, { cookie: string; expiresAt: number }>();
const COOKIE_TTL_MS = 50 * 60 * 1000;

function normalizeShipName(shipName: string): string {
  return shipName.replace(/^~/, "");
}

/**
 * 向 Urbit ship 认证并获取 auth cookie。
 *
 * POST /~/login with password=code → set-cookie header
 */
export async function authenticateTlon(
  shipUrl: string,
  code: string,
): Promise<string> {
  const cacheKey = shipUrl;
  const cached = cookieCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.cookie;
  }

  const response = await fetch(`${shipUrl.replace(/\/$/, "")}/~/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: code }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Tlon authentication failed (HTTP ${response.status})`);
  }

  await response.text().catch(() => {});
  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("Tlon authentication: no cookie received");
  }

  cookieCache.set(cacheKey, { cookie, expiresAt: now + COOKIE_TTL_MS });
  return cookie;
}

/**
 * 向 Urbit ship 发送 poke 请求。
 *
 * PUT /~/channel/{channelId} with [{ id, action: "poke", ship, app, mark, json }]
 */
export async function pokeTlon(
  account: TlonAccountConfig,
  app: string,
  mark: string,
  json: unknown,
): Promise<number> {
  const cookie = await authenticateTlon(account.shipUrl, account.code);
  const channelId = account.channelId || `cross-wms-${Date.now()}`;
  const pokeId = Date.now();
  const pokeData = [
    {
      id: pokeId,
      action: "poke",
      ship: normalizeShipName(account.shipName),
      app,
      mark,
      json,
    },
  ];

  const response = await fetch(
    `${account.shipUrl.replace(/\/$/, "")}/~/channel/${encodeURIComponent(channelId)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(pokeData),
    },
  );

  if (!response.ok && response.status !== 204) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Tlon poke failed (HTTP ${response.status})${errorText ? `: ${errorText.slice(0, 200)}` : ""}`,
    );
  }

  return pokeId;
}

/**
 * 发送 Tlon DM（直接消息）。
 *
 * 使用 chat app + chat-dm-action mark。
 */
export async function sendTlonDm(
  account: TlonAccountConfig,
  toShip: string,
  text: string,
): Promise<{ messageId: string }> {
  const fromShip = normalizeShipName(account.shipName);
  const sentAt = Date.now();
  const id = `${fromShip}/${sentAt}`;

  const action = {
    ship: normalizeShipName(toShip),
    diff: {
      id,
      delta: {
        add: {
          memo: {
            content: [{ inline: [text.slice(0, TLON_TEXT_LIMIT)] }],
            author: fromShip,
            sent: sentAt,
          },
          kind: null,
          time: null,
        },
      },
    },
  };

  await pokeTlon(account, "chat", "chat-dm-action", action);
  return { messageId: id };
}

/**
 * 发送 Tlon 群组消息。
 *
 * 使用 channels app + channel-action-1 mark。
 */
export async function sendTlonGroupMessage(
  account: TlonAccountConfig,
  hostShip: string,
  channelName: string,
  text: string,
  replyToId?: string,
): Promise<{ messageId: string }> {
  const fromShip = normalizeShipName(account.shipName);
  const sentAt = Date.now();

  const action = {
    channel: {
      nest: `chat/${normalizeShipName(hostShip)}/${channelName}`,
      action: replyToId
        ? {
            post: {
              reply: {
                id: replyToId,
                action: {
                  add: {
                    content: [{ inline: [text.slice(0, TLON_TEXT_LIMIT)] }],
                    author: fromShip,
                    sent: sentAt,
                  },
                },
              },
            },
          }
        : {
            post: {
              add: {
                content: [{ inline: [text.slice(0, TLON_TEXT_LIMIT)] }],
                author: fromShip,
                sent: sentAt,
                kind: "/chat",
                blob: null,
                meta: null,
              },
            },
          },
    },
  };

  await pokeTlon(account, "channels", "channel-action-1", action);
  const messageId = `${fromShip}/${sentAt}`;
  return { messageId };
}

export function createTlonChannelPlugin(): ChannelPlugin {
  const tlonMeta: ChannelMeta = {
    id: TLON_CHANNEL_ID,
    label: "Tlon/Urbit",
    selectionLabel: "Tlon/Urbit",
    blurb: "Tlon/Urbit 消息通道",
    docsPath: "/channels/tlon",
    aliases: ["tlon", "urbit"],
    markdownCapable: true,
  };

  const tlonCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: true,
    polls: false,
    mentions: true,
    voice: false,
    video: false,
    typing: false,
  };

  const tlonConfig: ChannelConfigAdapter<TlonAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const tlonConfig = config.tlon as Record<string, unknown>;
      if (tlonConfig && tlonConfig.shipUrl && tlonConfig.code) {
        return [TLON_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (
      config: AppConfig,
      accountId: ChannelId,
    ): TlonAccountConfig | null => {
      if (accountId !== TLON_CHANNEL_ID) return null;
      const tlonConfig = config.tlon as Record<string, unknown>;
      if (tlonConfig && tlonConfig.shipUrl && tlonConfig.code) {
        return {
          shipUrl: String(tlonConfig.shipUrl),
          shipName: String(tlonConfig.shipName || ""),
          code: String(tlonConfig.code),
          channelId: tlonConfig.channelId as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: TlonAccountConfig): boolean => {
      return !!account.shipUrl && !!account.code && !!account.shipName;
    },
    isConfigured: (account: TlonAccountConfig): boolean => {
      return !!account.shipUrl && !!account.code && !!account.shipName;
    },
  };

  const tlonMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = tlonConfig.resolveAccount(
          { tlon: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Tlon account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          if (!ctx.to) {
            return { success: false, error: "Tlon target ship not provided" };
          }

          const replyToId = ctx.metadata?.replyToId as string | undefined;

          // 判断是群组消息还是 DM
          // 群组目标格式: "hostShip/channelName"
          if (ctx.to.includes("/")) {
            const [hostShip, channelName] = ctx.to.split("/");
            const result = await sendTlonGroupMessage(
              account,
              hostShip,
              channelName,
              text,
              replyToId,
            );
            return { success: true, messageId: result.messageId };
          }

          // DM 消息
          const result = await sendTlonDm(account, ctx.to, text);
          return { success: true, messageId: result.messageId };
        } catch (error) {
          return {
            success: false,
            error: `Tlon send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: TLON_CHANNEL_ID,
    meta: tlonMeta,
    capabilities: tlonCapabilities,
    config: tlonConfig,
    message: tlonMessageAdapter,
  });
}

/**
 * 解析 Tlon/Urbit 入站事件。
 *
 * Urbit 通过 SSE 推送事件到 /~/channel/{channelId} 端点。
 * 事件格式为 JSON 数组，每个元素包含 action 和相关数据。
 */
export function parseTlonEvent(body: unknown): TlonWebhookResult {
  const data = body as Record<string, unknown>;

  if (!data || typeof data !== "object") {
    return { success: false, error: "Invalid Tlon event payload" };
  }

  const action = String(data.action || "");

  // Urbit poke 响应或 heartbeat
  if (action === "ping" || action === "poke") {
    return { success: true, type: action };
  }

  // 消息事件
  const json = data.json as Record<string, unknown> | undefined;
  if (!json) {
    return { success: false, error: "No json payload in Tlon event" };
  }

  // 检查是否是聊天消息
  const diff = json.diff as Record<string, unknown> | undefined;
  if (diff && diff.delta) {
    const delta = diff.delta as Record<string, unknown>;
    const add = delta.add as Record<string, unknown> | undefined;
    if (add && add.memo) {
      const memo = add.memo as Record<string, unknown>;
      const content = memo.content as Array<{ inline: string[] }> | undefined;
      if (content && content.length > 0) {
        const text = content.map((c) => c.inline.join("")).join("\n");
        const author = String(memo.author || "");
        const sent = Number(memo.sent || Date.now());
        const id = String(diff.id || `${author}/${sent}`);
        const isGroup = !!json.channel;

        return {
          success: true,
          type: "message",
          message: {
            channelId: isGroup
              ? String((json.channel as Record<string, unknown>)?.nest || "")
              : author,
            userId: author,
            messageId: id,
            text,
            timestamp: sent,
            chatType: isGroup ? "group" : "direct",
          },
        };
      }
    }
  }

  return { success: false, error: `Unsupported Tlon event action: ${action}` };
}
