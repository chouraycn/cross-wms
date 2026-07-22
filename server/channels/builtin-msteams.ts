/**
 * Microsoft Teams 内置渠道插件
 *
 * 基于 Microsoft Graph API 实现 Teams 频道/聊天的消息收发：
 * - OAuth 2.0 客户端凭据认证（Azure AD 应用）
 * - 频道消息发送与接收（Graph API）
 * - 线程消息回复
 * - Adaptive Cards 发送
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

export const MSTEAMS_CHANNEL_ID = "msteams" as ChannelId;

/** Microsoft Graph API 默认端点 */
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
/** Azure AD OAuth 2.0 token 端点模板 */
const OAUTH_TOKEN_URL_TEMPLATE =
  "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token";
/** 默认 Graph API 范围 */
const DEFAULT_GRAPH_SCOPE = "https://api.botframework.com/.default";

/** MS Teams 账户配置 */
export interface MsTeamsAccountConfig {
  /** Azure AD 租户 ID（或 "common"） */
  tenantId: string;
  /** Azure AD 应用（客户端）ID */
  clientId: string;
  /** Azure AD 应用客户端密钥 */
  clientSecret: string;
  /** 默认团队 ID（用于频道消息） */
  teamId?: string;
  /** 默认频道 ID（用于频道消息） */
  channelId?: string;
  /** 聊天 ID（用于 1:1/群组聊天消息） */
  chatId?: string;
  /** 已缓存的访问令牌 */
  accessToken?: string;
  /** 令牌过期时间（毫秒时间戳） */
  expiresAt?: number;
}

/** MS Teams OAuth 令牌响应 */
export interface MsTeamsOAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/** MS Teams Adaptive Card 附件 */
export interface MsTeamsAttachment {
  contentType: string;
  contentUrl?: string;
  content?: Record<string, unknown>;
}

/** MS Teams webhook 入站解析结果 */
export interface MsTeamsWebhookResult {
  success: boolean;
  type?: string;
  message?: {
    channelId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct" | "group";
    conversationId?: string;
    threadId?: string;
  };
  error?: string;
}

/** OAuth 令牌缓存（按租户+应用键） */
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

function tokenCacheKey(account: MsTeamsAccountConfig): string {
  return `${account.tenantId}:${account.clientId}`;
}

/**
 * 通过 OAuth 2.0 客户端凭据流获取 Microsoft Graph 访问令牌。
 *
 * 使用缓存的令牌直至接近过期，过期后自动刷新。
 */
export async function fetchMsTeamsAccessToken(
  account: MsTeamsAccountConfig,
): Promise<string> {
  const key = tokenCacheKey(account);
  const cached = tokenCache.get(key);
  const now = Date.now();
  // 提前 60 秒刷新以避免边界过期
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.accessToken;
  }

  const tokenUrl = OAUTH_TOKEN_URL_TEMPLATE.replace("{tenant}", account.tenantId);
  const body = new URLSearchParams({
    client_id: account.clientId,
    client_secret: account.clientSecret,
    scope: DEFAULT_GRAPH_SCOPE,
    grant_type: "client_credentials",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `MS Teams OAuth token request failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
    );
  }

  const token = (await response.json()) as MsTeamsOAuthToken;
  const expiresAt = now + token.expires_in * 1000;
  tokenCache.set(key, { accessToken: token.access_token, expiresAt });
  return token.access_token;
}

/** 构建带 Bearer 令牌的 Graph 请求头 */
async function buildGraphHeaders(
  account: MsTeamsAccountConfig,
  contentType = "application/json",
): Promise<HeadersInit> {
  const accessToken = await fetchMsTeamsAccessToken(account);
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": contentType,
  };
}

/** 解析目标地址为 Graph 消息端点 */
function resolveMessageEndpoint(
  account: MsTeamsAccountConfig,
  to?: string,
): { endpoint: string; isChat: boolean } {
  // `to` 优先：可以是 chatId 或 "teamId/channelId"
  if (to) {
    if (to.includes("/")) {
      const [teamId, channelId] = to.split("/");
      return {
        endpoint: `${GRAPH_BASE_URL}/teams/${teamId}/channels/${channelId}/messages`,
        isChat: false,
      };
    }
    // 形如 "19:..." 的聊天 ID
    return { endpoint: `${GRAPH_BASE_URL}/chats/${to}/messages`, isChat: true };
  }

  if (account.chatId) {
    return { endpoint: `${GRAPH_BASE_URL}/chats/${account.chatId}/messages`, isChat: true };
  }
  if (account.teamId && account.channelId) {
    return {
      endpoint: `${GRAPH_BASE_URL}/teams/${account.teamId}/channels/${account.channelId}/messages`,
      isChat: false,
    };
  }
  throw new Error("MS Teams target not configured: provide chatId or teamId/channelId");
}

/**
 * 发送一条 Teams 频道/聊天消息。
 *
 * @param account 账户配置
 * @param body  消息体（包含 body.content 等字段）
 * @param to    可选目标（chatId 或 "teamId/channelId"）
 */
export async function sendMsTeamsMessage(
  account: MsTeamsAccountConfig,
  body: Record<string, unknown>,
  to?: string,
): Promise<{ messageId: string; endpoint: string }> {
  const { endpoint } = resolveMessageEndpoint(account, to);
  const headers = await buildGraphHeaders(account);
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `MS Teams send failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as { id?: string };
  return { messageId: data.id || `msteams-${Date.now()}`, endpoint };
}

/**
 * 在已有消息下回复（线程消息）。
 *
 * @param account      账户配置
 * @param teamId       团队 ID
 * @param channelId    频道 ID
 * @param parentMessageId 父消息 ID（线程根）
 * @param body         回复消息体
 */
export async function replyMsTeamsThread(
  account: MsTeamsAccountConfig,
  teamId: string,
  channelId: string,
  parentMessageId: string,
  body: Record<string, unknown>,
): Promise<{ messageId: string }> {
  const endpoint = `${GRAPH_BASE_URL}/teams/${teamId}/channels/${channelId}/messages/${parentMessageId}/replies`;
  const headers = await buildGraphHeaders(account);
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `MS Teams thread reply failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as { id?: string };
  return { messageId: data.id || `msteams-${Date.now()}` };
}

/**
 * 发送一条 Adaptive Card 消息。
 *
 * @param account 账户配置
 * @param card    Adaptive Card JSON 对象
 * @param to      可选目标
 */
export async function sendMsTeamsAdaptiveCard(
  account: MsTeamsAccountConfig,
  card: Record<string, unknown>,
  to?: string,
): Promise<{ messageId: string }> {
  const attachment: MsTeamsAttachment = {
    contentType: "application/vnd.microsoft.card.adaptive",
    content: card,
  };
  const body = {
    body: { content: "" },
    attachments: [attachment],
  };
  return sendMsTeamsMessage(account, body, to);
}

/** 构建 Graph 消息体 */
function buildGraphMessageBody(text: string): Record<string, unknown> {
  return {
    body: {
      contentType: "text",
      content: text,
    },
  };
}

/** 从渲染上下文提取文本 */
function extractTextFromRendered(parts: { content: unknown }[]): string {
  const text = parts.map((p) => String(p.content)).join("\n");
  // Teams 单条消息较长，截断保护
  return text.length > 4000 ? text.slice(0, 3997) + "..." : text;
}

export function createMsTeamsChannelPlugin(): ChannelPlugin {
  const msteamsMeta: ChannelMeta = {
    id: MSTEAMS_CHANNEL_ID,
    label: "Microsoft Teams",
    selectionLabel: "Microsoft Teams",
    blurb: "Microsoft Teams 消息通道",
    docsPath: "/channels/msteams",
    aliases: ["msteams", "teams", "ms-teams"],
    markdownCapable: true,
  };

  const msteamsCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: true,
    threads: true,
    polls: true,
    mentions: true,
    voice: false,
    video: false,
    typing: true,
  };

  const msteamsConfig: ChannelConfigAdapter<MsTeamsAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const teamsConfig = config.msteams as Record<string, unknown> | undefined;
      if (
        teamsConfig &&
        teamsConfig.tenantId &&
        teamsConfig.clientId &&
        teamsConfig.clientSecret
      ) {
        return [MSTEAMS_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (
      config: AppConfig,
      accountId: ChannelId,
    ): MsTeamsAccountConfig | null => {
      if (accountId !== MSTEAMS_CHANNEL_ID) return null;
      const teamsConfig = config.msteams as Record<string, unknown> | undefined;
      if (
        teamsConfig &&
        teamsConfig.tenantId &&
        teamsConfig.clientId &&
        teamsConfig.clientSecret
      ) {
        return {
          tenantId: String(teamsConfig.tenantId),
          clientId: String(teamsConfig.clientId),
          clientSecret: String(teamsConfig.clientSecret),
          teamId: teamsConfig.teamId as string | undefined,
          channelId: teamsConfig.channelId as string | undefined,
          chatId: teamsConfig.chatId as string | undefined,
          accessToken: teamsConfig.accessToken as string | undefined,
          expiresAt: teamsConfig.expiresAt as number | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: MsTeamsAccountConfig): boolean => {
      return !!(account.tenantId && account.clientId && account.clientSecret);
    },
    isConfigured: (account: MsTeamsAccountConfig): boolean => {
      return !!(account.tenantId && account.clientId && account.clientSecret);
    },
  };

  const msteamsMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = msteamsConfig.resolveAccount(
          { msteams: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "MS Teams account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = extractTextFromRendered(rendered.parts);

          // 线程回复：当存在 parentMessageId 时回复到线程
          const threadParent = ctx.metadata?.parentMessageId as string | undefined;
          const teamId = (ctx.metadata?.teamId as string | undefined) || account.teamId;
          const channelId =
            (ctx.metadata?.channelId as string | undefined) || account.channelId;

          if (threadParent && teamId && channelId) {
            const result = await replyMsTeamsThread(
              account,
              teamId,
              channelId,
              threadParent,
              buildGraphMessageBody(text),
            );
            return { success: true, messageId: result.messageId };
          }

          // Adaptive Card：当 metadata 中存在 adaptiveCard 时发送卡片
          const adaptiveCard = ctx.metadata?.adaptiveCard as
            | Record<string, unknown>
            | undefined;
          if (adaptiveCard) {
            const result = await sendMsTeamsAdaptiveCard(account, adaptiveCard, ctx.to);
            return { success: true, messageId: result.messageId };
          }

          const result = await sendMsTeamsMessage(
            account,
            buildGraphMessageBody(text),
            ctx.to,
          );
          return { success: true, messageId: result.messageId };
        } catch (error) {
          return {
            success: false,
            error: `MS Teams send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: MSTEAMS_CHANNEL_ID,
    meta: msteamsMeta,
    capabilities: msteamsCapabilities,
    config: msteamsConfig,
    message: msteamsMessageAdapter,
  });
}

/**
 * 解析 MS Teams 出站 webhook 入站消息。
 *
 * Teams 频道可通过 "Outgoing Webhook" 将消息以 JSON 形式 POST 到指定端点。
 */
export function parseMsTeamsWebhook(body: unknown): MsTeamsWebhookResult {
  const data = body as Record<string, unknown>;
  if (!data || typeof data !== "object") {
    return { success: false, error: "Invalid MS Teams webhook payload" };
  }

  const text = String(data.text || "");
  if (!text) {
    return { success: false, error: "Empty message text" };
  }

  const conversation = data.conversation as Record<string, unknown> | undefined;
  const channel = data.channel as Record<string, unknown> | undefined;
  const from = data.from as Record<string, unknown> | undefined;
  const isGroup =
    String(conversation?.conversationType || data.conversationType || "") === "channel";

  return {
    success: true,
    type: "message",
    message: {
      channelId: String(channel?.id || conversation?.id || ""),
      userId: String(from?.id || data.userId || ""),
      messageId: String(data.id || ""),
      text,
      timestamp: Date.now(),
      chatType: isGroup ? "group" : "direct",
      conversationId: String(conversation?.id || ""),
      threadId: String(conversation?.threadId || data.threadId || ""),
    },
  };
}
