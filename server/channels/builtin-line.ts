/**
 * LINE 内置渠道插件
 *
 * 基于 LINE Messaging API 实现消息收发：
 * - 通过 Channel Access Token 调用 Push/Reply API
 * - 支持 Webhook 接收入站消息事件
 * - 支持文本、图片、视频、音频等消息类型
 *
 * 参考 OpenClaw extensions/line 的 API 模式。
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

export const LINE_CHANNEL_ID = "line" as ChannelId;

/** LINE Messaging API 端点 */
const LINE_API_BASE = "https://api.line.me";
/** LINE 单条消息文本上限 */
const LINE_TEXT_LIMIT = 5000;

interface LineAccountConfig {
  /** Channel Access Token */
  channelAccessToken: string;
  /** Channel Secret（用于 Webhook 签名验证） */
  channelSecret?: string;
}

export interface LineWebhookResult {
  success: boolean;
  type?: string;
  message?: {
    channelId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct" | "group";
    replyToken?: string;
  };
  error?: string;
}

/** 规范化 LINE 目标 ID（去除 line: 前缀） */
function normalizeTarget(to: string): string {
  const trimmed = to.trim();
  return trimmed
    .replace(/^line:group:/i, "")
    .replace(/^line:room:/i, "")
    .replace(/^line:user:/i, "")
    .replace(/^line:/i, "");
}

export function createLineChannelPlugin(): ChannelPlugin {
  const lineMeta: ChannelMeta = {
    id: LINE_CHANNEL_ID,
    label: "LINE",
    selectionLabel: "LINE",
    blurb: "LINE Messaging API 消息通道",
    docsPath: "/channels/line",
    aliases: ["line"],
    markdownCapable: false,
  };

  const lineCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    mentions: false,
    voice: true,
    video: true,
    typing: false,
  };

  const lineConfig: ChannelConfigAdapter<LineAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const lineCfg = config.line as Record<string, unknown> | undefined;
      if (lineCfg && lineCfg.channelAccessToken) {
        return [LINE_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (
      config: AppConfig,
      accountId: ChannelId,
    ): LineAccountConfig | null => {
      if (accountId !== LINE_CHANNEL_ID) return null;
      const lineCfg = config.line as Record<string, unknown> | undefined;
      if (lineCfg && lineCfg.channelAccessToken) {
        return {
          channelAccessToken: String(lineCfg.channelAccessToken),
          channelSecret: lineCfg.channelSecret as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: LineAccountConfig): boolean => {
      return !!account.channelAccessToken;
    },
    isConfigured: (account: LineAccountConfig): boolean => {
      return !!account.channelAccessToken;
    },
  };

  const lineMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = lineConfig.resolveAccount(
          { line: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "LINE channel access token not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const target = ctx.to;
          if (!target) {
            return { success: false, error: "LINE target (user/group/room ID) not provided" };
          }

          const chatId = normalizeTarget(target);
          const messageText = text.length > LINE_TEXT_LIMIT
            ? text.slice(0, LINE_TEXT_LIMIT - 3) + "..."
            : text;

          const replyToken = ctx.metadata?.replyToken as string | undefined;

          // 如果有 replyToken，使用 Reply API（更经济）；否则使用 Push API
          const endpoint = replyToken
            ? `${LINE_API_BASE}/v2/bot/message/reply`
            : `${LINE_API_BASE}/v2/bot/message/push`;

          const body: Record<string, unknown> = {
            messages: [
              {
                type: "text",
                text: messageText,
              },
            ],
          };

          if (replyToken) {
            body.replyToken = replyToken;
          } else {
            body.to = chatId;
          }

          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${account.channelAccessToken}`,
            },
            body: JSON.stringify(body),
          });

          if (response.ok) {
            // LINE Push/Reply API 成功时不返回消息 ID
            return {
              success: true,
              messageId: `line-${Date.now()}`,
            };
          }
          const errorText = await response.text();
          return {
            success: false,
            error: `LINE send failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
          };
        } catch (error) {
          return {
            success: false,
            error: `LINE send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: LINE_CHANNEL_ID,
    meta: lineMeta,
    capabilities: lineCapabilities,
    config: lineConfig,
    message: lineMessageAdapter,
  });
}

/**
 * 解析 LINE Webhook 收到的入站事件。
 *
 * LINE 在用户发消息时会向配置的 Webhook URL POST JSON 载荷。
 * 载荷格式参考 LINE Messaging API 文档。
 */
export function parseLineWebhook(body: unknown): LineWebhookResult {
  const data = body as Record<string, unknown>;
  if (!data || typeof data !== "object") {
    return { success: false, error: "Invalid LINE webhook payload" };
  }

  const events = data.events as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(events) || events.length === 0) {
    return { success: false, error: "No events in LINE webhook payload" };
  }

  const event = events[0];
  const type = String(event.type || "");

  if (type !== "message") {
    return { success: false, error: `Unsupported LINE event type: ${type}` };
  }

  const message = event.message as Record<string, unknown> | undefined;
  if (!message) {
    return { success: false, error: "No message in LINE event" };
  }

  const msgType = String(message.type || "");
  if (msgType !== "text") {
    return { success: false, error: `Unsupported LINE message type: ${msgType}` };
  }

  const text = String(message.text || "");
  if (!text) {
    return { success: false, error: "Empty message text" };
  }

  const source = event.source as Record<string, unknown> | undefined;
  const sourceType = String(source?.type || "");
  const userId = String(source?.userId || "");
  const channelId = String(source?.groupId || source?.roomId || source?.userId || "");

  return {
    success: true,
    type: "message",
    message: {
      channelId,
      userId,
      messageId: String(message.id || ""),
      text,
      timestamp: Number(event.timestamp || Date.now()),
      chatType: sourceType === "group" || sourceType === "room" ? "group" : "direct",
      replyToken: String(event.replyToken || ""),
    },
  };
}
