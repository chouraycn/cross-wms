/**
 * Microsoft Teams 渠道 API 封装
 *
 * 基于 Microsoft Teams Bot Framework 和 Graph API 实现消息收发能力。
 * 参考 openclaw/extensions/msteams 的核心 API 层。
 */

const TEAMS_API_BASE = "https://graph.microsoft.com/v1.0";

export interface MSTeamsConfig {
  appId: string;
  appPassword: string;
  tenantId?: string;
  apiBase?: string;
}

export interface MSTeamsMessage {
  id: string;
  replyToId?: string;
  messageType: string;
  createdDateTime: string;
  from: {
    user?: {
      id: string;
      displayName: string;
    };
  };
  body: {
    contentType: string;
    content: string;
  };
  channelIdentity?: {
    teamId: string;
    channelId: string;
  };
  conversation: {
    id: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface MSTeamsSendMessageResult {
  id: string;
  [key: string]: unknown;
}

export interface MSTeamsChannel {
  sendMessage(chatId: string, content: string, contentType?: "text" | "html"): Promise<MSTeamsSendMessageResult>;
  sendMessageToChannel(teamId: string, channelId: string, content: string): Promise<MSTeamsSendMessageResult>;
  listChats(): Promise<Array<{ id: string; topic?: string }>>;
  getChatMessages(chatId: string, limit?: number): Promise<MSTeamsMessage[]>;
  replyToMessage(chatId: string, messageId: string, content: string): Promise<MSTeamsSendMessageResult>;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(config: MSTeamsConfig): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const tenantId = config.tenantId || "common";
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", config.appId);
  params.append("client_secret", config.appPassword);
  params.append("scope", "https://graph.microsoft.com/.default");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (data.access_token) {
    cachedAccessToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in || 3600) * 1000 - 60000;
    return cachedAccessToken;
  }
  throw new Error(`Microsoft Teams auth failed: ${JSON.stringify(data)}`);
}

export function createMSTeamsChannel(config: MSTeamsConfig): MSTeamsChannel {
  const apiBase = config.apiBase || TEAMS_API_BASE;

  const request = async (path: string, options: RequestInit = {}): Promise<unknown> => {
    const token = await getAccessToken(config);
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Microsoft Teams API error (${path}): ${response.status} ${errorText}`);
    }

    if (response.status === 204) return undefined;
    return response.json();
  };

  const sendMessage = async (
    chatId: string,
    content: string,
    contentType: "text" | "html" = "text"
  ): Promise<MSTeamsSendMessageResult> => {
    const result = await request(`/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        body: {
          contentType,
          content,
        },
      }),
    });
    return result as MSTeamsSendMessageResult;
  };

  const sendMessageToChannel = async (
    teamId: string,
    channelId: string,
    content: string
  ): Promise<MSTeamsSendMessageResult> => {
    const result = await request(`/teams/${teamId}/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        body: {
          contentType: "text",
          content,
        },
      }),
    });
    return result as MSTeamsSendMessageResult;
  };

  const listChats = async (): Promise<Array<{ id: string; topic?: string }>> => {
    const result = await request("/me/chats");
    const data = result as { value: Array<{ id: string; topic?: string }> };
    return data.value || [];
  };

  const getChatMessages = async (chatId: string, limit: number = 10): Promise<MSTeamsMessage[]> => {
    const result = await request(`/chats/${chatId}/messages?$top=${limit}`);
    const data = result as { value: MSTeamsMessage[] };
    return data.value || [];
  };

  const replyToMessage = async (
    chatId: string,
    messageId: string,
    content: string
  ): Promise<MSTeamsSendMessageResult> => {
    const result = await request(`/chats/${chatId}/messages/${messageId}/replies`, {
      method: "POST",
      body: JSON.stringify({
        body: {
          contentType: "text",
          content,
        },
      }),
    });
    return result as MSTeamsSendMessageResult;
  };

  return {
    sendMessage,
    sendMessageToChannel,
    listChats,
    getChatMessages,
    replyToMessage,
  };
}
