/**
 * QQ 机器人渠道 API 封装
 *
 * 基于腾讯 QQ 官方机器人 API 实现消息收发能力。
 * 参考 openclaw/extensions/qqbot 的核心 API 层。
 */

const QQ_API_BASE = "https://api.sgroup.qq.com";

export interface QQBotConfig {
  appId: string;
  clientSecret: string;
  sandbox?: boolean;
  apiBase?: string;
}

export interface QQMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  content: string;
  author: {
    id: string;
    username: string;
    avatar?: string;
  };
  timestamp: string;
  message_type?: number;
  attachments?: Array<{
    url: string;
    filename?: string;
    height?: number;
    width?: number;
    size?: number;
  }>;
  [key: string]: unknown;
}

export interface QQSendMessageResult {
  id: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface QQBotChannel {
  getAccessToken(): Promise<string>;
  sendMessage(channelId: string, content: string): Promise<QQSendMessageResult>;
  sendPrivateMessage(userId: string, content: string): Promise<QQSendMessageResult>;
  getMessage(channelId: string, messageId: string): Promise<QQMessage>;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(config: QQBotConfig): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const apiBase = config.apiBase || QQ_API_BASE;
  const response = await fetch(`${apiBase}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appId: config.appId,
      clientSecret: config.clientSecret,
    }),
  });

  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (data.access_token) {
    cachedAccessToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in || 7200) * 1000 - 60000;
    return cachedAccessToken;
  }
  throw new Error(`QQ Bot auth failed: ${JSON.stringify(data)}`);
}

export function createQQBotChannel(config: QQBotConfig): QQBotChannel {
  const apiBase = config.apiBase || QQ_API_BASE;

  const request = async (path: string, options: RequestInit = {}): Promise<unknown> => {
    const token = await getAccessToken(config);
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Authorization": `QQBot ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`QQ Bot API error (${path}): ${response.status} ${errorText}`);
    }

    return response.json();
  };

  const sendMessage = async (channelId: string, content: string): Promise<QQSendMessageResult> => {
    const result = await request(`/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    return result as QQSendMessageResult;
  };

  const sendPrivateMessage = async (userId: string, content: string): Promise<QQSendMessageResult> => {
    const result = await request(`/users/${userId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    return result as QQSendMessageResult;
  };

  const getMessage = async (channelId: string, messageId: string): Promise<QQMessage> => {
    const result = await request(`/channels/${channelId}/messages/${messageId}`);
    return result as QQMessage;
  };

  return {
    getAccessToken: () => getAccessToken(config),
    sendMessage,
    sendPrivateMessage,
    getMessage,
  };
}
