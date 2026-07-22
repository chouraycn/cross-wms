/**
 * Google Chat 内置渠道插件
 *
 * 基于 Google Chat API 实现消息收发：
 * - 通过 Service Account JWT 认证
 * - 支持在 Spaces（空间）中发送消息
 * - 支持 Webhook 接收入站消息
 *
 * 参考 OpenClaw extensions/googlechat 的 API 模式。
 */
import { createSign } from "node:crypto";
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

export const GOOGLECHAT_CHANNEL_ID = "googlechat" as ChannelId;

/** Google Chat API 端点 */
const GOOGLE_CHAT_API_BASE = "https://chat.googleapis.com/v1";
/** Google OAuth 2.0 JWT 端点 */
const GOOGLE_OAUTH_URL = "https://oauth2.googleapis.com/token";
/** Google Chat API Scope */
const GOOGLE_CHAT_SCOPE = "https://www.googleapis.com/auth/chat.bot";
/** Google Chat 消息文本上限 */
const GOOGLE_CHAT_TEXT_LIMIT = 4096;

interface GoogleChatAccountConfig {
  /** Service Account 邮箱 */
  clientEmail: string;
  /** Service Account 私钥（PEM 格式） */
  privateKey: string;
  /** 默认 Space ID（如 spaces/AAAAAAAAAAA） */
  spaceId?: string;
}

export interface GoogleChatWebhookResult {
  success: boolean;
  type?: string;
  message?: {
    channelId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct" | "group";
    threadId?: string;
  };
  error?: string;
}

/** OAuth 令牌缓存 */
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

/**
 * 创建 Google Service Account JWT 并交换访问令牌。
 *
 * 使用 RS256 签名构造 JWT，通过 Google OAuth 2.0 token 端点交换 access_token。
 */
export async function fetchGoogleChatAccessToken(
  account: GoogleChatAccountConfig,
): Promise<string> {
  const cacheKey = account.clientEmail;
  const cached = tokenCache.get(cacheKey);
  const now = Math.floor(Date.now() / 1000);

  if (cached && cached.expiresAt > now + 60) {
    return cached.accessToken;
  }

  // 构造 JWT Header
  const header = { alg: "RS256", typ: "JWT" };
  // 构造 JWT Claim Set
  const claimSet = {
    iss: account.clientEmail,
    scope: GOOGLE_CHAT_SCOPE,
    aud: GOOGLE_OAUTH_URL,
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedClaim = Buffer.from(JSON.stringify(claimSet)).toString("base64url");
  const signInput = `${encodedHeader}.${encodedClaim}`;

  // 使用 Service Account 私钥签名
  const signer = createSign("RSA-SHA256");
  signer.update(signInput);
  // 规范化私钥格式（处理转义换行符）
  const normalizedKey = account.privateKey.replace(/\\n/g, "\n");
  const signature = signer.sign(normalizedKey, "base64url");

  const jwt = `${signInput}.${signature}`;

  // 交换 access_token
  const response = await fetch(GOOGLE_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Google Chat OAuth token request failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
    );
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  const expiresAt = now + tokenData.expires_in;
  tokenCache.set(cacheKey, {
    accessToken: tokenData.access_token,
    expiresAt,
  });

  return tokenData.access_token;
}

/** 解析目标地址为 Google Chat API 端点 */
function resolveMessageEndpoint(account: GoogleChatAccountConfig, to?: string): string {
  // `to` 可以是完整的 space 路径或纯 space ID
  if (to) {
    const spaceId = to.startsWith("spaces/") ? to : `spaces/${to}`;
    return `${GOOGLE_CHAT_API_BASE}/${spaceId}/messages`;
  }
  if (account.spaceId) {
    const spaceId = account.spaceId.startsWith("spaces/")
      ? account.spaceId
      : `spaces/${account.spaceId}`;
    return `${GOOGLE_CHAT_API_BASE}/${spaceId}/messages`;
  }
  throw new Error("Google Chat space ID not configured");
}

export function createGoogleChatChannelPlugin(): ChannelPlugin {
  const googleChatMeta: ChannelMeta = {
    id: GOOGLECHAT_CHANNEL_ID,
    label: "Google Chat",
    selectionLabel: "Google Chat",
    blurb: "Google Chat 消息通道（Service Account 认证）",
    docsPath: "/channels/googlechat",
    aliases: ["googlechat", "google-chat", "gchat"],
    markdownCapable: true,
  };

  const googleChatCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: true,
    threads: true,
    polls: false,
    mentions: true,
    voice: false,
    video: false,
    typing: false,
  };

  const googleChatConfig: ChannelConfigAdapter<GoogleChatAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const gcConfig = config.googlechat as Record<string, unknown> | undefined;
      if (gcConfig && gcConfig.clientEmail && gcConfig.privateKey) {
        return [GOOGLECHAT_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (
      config: AppConfig,
      accountId: ChannelId,
    ): GoogleChatAccountConfig | null => {
      if (accountId !== GOOGLECHAT_CHANNEL_ID) return null;
      const gcCfg = config.googlechat as Record<string, unknown> | undefined;
      if (gcCfg && gcCfg.clientEmail && gcCfg.privateKey) {
        return {
          clientEmail: String(gcCfg.clientEmail),
          privateKey: String(gcCfg.privateKey),
          spaceId: gcCfg.spaceId as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: GoogleChatAccountConfig): boolean => {
      return !!account.clientEmail && !!account.privateKey;
    },
    isConfigured: (account: GoogleChatAccountConfig): boolean => {
      return !!account.clientEmail && !!account.privateKey;
    },
  };

  const googleChatMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = googleChatConfig.resolveAccount(
          { googlechat: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Google Chat account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const endpoint = resolveMessageEndpoint(account, ctx.to);
          const accessToken = await fetchGoogleChatAccessToken(account);

          const messageText = text.length > GOOGLE_CHAT_TEXT_LIMIT
            ? text.slice(0, GOOGLE_CHAT_TEXT_LIMIT - 3) + "..."
            : text;

          const body: Record<string, unknown> = {
            text: messageText,
          };

          // 线程回复
          const threadId = ctx.metadata?.threadId as string | undefined;
          if (threadId) {
            body.thread = { name: threadId };
          }

          // 请求参数：threadKey 用于幂等性
          const params = new URLSearchParams();
          if (ctx.metadata?.threadKey) {
            params.set("threadKey", String(ctx.metadata.threadKey));
          }
          if (ctx.metadata?.messageReplyOption) {
            params.set("messageReplyOption", String(ctx.metadata.messageReplyOption));
          }

          const url = params.toString()
            ? `${endpoint}?${params}`
            : endpoint;

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(body),
          });

          if (response.ok) {
            const data = (await response.json()) as { name?: string };
            return {
              success: true,
              messageId: data.name || `googlechat-${Date.now()}`,
            };
          }
          const errorText = await response.text();
          return {
            success: false,
            error: `Google Chat send failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
          };
        } catch (error) {
          return {
            success: false,
            error: `Google Chat send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: GOOGLECHAT_CHANNEL_ID,
    meta: googleChatMeta,
    capabilities: googleChatCapabilities,
    config: googleChatConfig,
    message: googleChatMessageAdapter,
  });
}

/**
 * 解析 Google Chat Webhook 收到的入站事件。
 *
 * Google Chat 在用户发消息时会向配置的 Webhook URL POST JSON 载荷。
 */
export function parseGoogleChatWebhook(body: unknown): GoogleChatWebhookResult {
  const data = body as Record<string, unknown>;
  if (!data || typeof data !== "object") {
    return { success: false, error: "Invalid Google Chat webhook payload" };
  }

  const type = String(data.type || "");

  if (type !== "MESSAGE") {
    return { success: false, error: `Unsupported Google Chat event type: ${type}` };
  }

  const message = data.message as Record<string, unknown> | undefined;
  if (!message) {
    return { success: false, error: "No message in Google Chat event" };
  }

  const text = String(message.text || "");
  if (!text) {
    return { success: false, error: "Empty message text" };
  }

  const space = message.space as Record<string, unknown> | undefined;
  const sender = message.sender as Record<string, unknown> | undefined;
  const thread = message.thread as Record<string, unknown> | undefined;
  const spaceType = String(space?.type || "");

  return {
    success: true,
    type: "message",
    message: {
      channelId: String(space?.name || ""),
      userId: String(sender?.name || ""),
      messageId: String(message.name || ""),
      text,
      timestamp: String(message.createTime || "")
        ? Date.parse(String(message.createTime))
        : Date.now(),
      chatType: spaceType === "DIRECT_MESSAGE" ? "direct" : "group",
      threadId: String(thread?.name || ""),
    },
  };
}
