/**
 * Discord Bot API 封装
 *
 * 基于 Discord REST API v10: https://discord.com/developers/docs/reference
 */

const DISCORD_API_BASE = "https://discord.com/api/v10";

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string;
  avatar?: string;
  bot?: boolean;
  system?: boolean;
}

export interface DiscordChannel {
  id: string;
  type: number;
  guild_id?: string;
  name?: string;
  topic?: string;
  nsfw?: boolean;
  last_message_id?: string;
  bitrate?: number;
  user_limit?: number;
  rate_limit_per_user?: number;
  recipients?: DiscordUser[];
  icon?: string;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  tts: boolean;
  mention_everyone: boolean;
  mentions: DiscordUser[];
  mention_roles: string[];
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  pinned: boolean;
  type: number;
  referenced_message?: DiscordMessage;
  thread?: DiscordChannel;
}

export interface DiscordAttachment {
  id: string;
  filename: string;
  size: number;
  url: string;
  proxy_url: string;
  content_type?: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string; icon_url?: string };
  thumbnail?: { url: string };
  image?: { url: string };
}

export interface DiscordGatewayBot {
  url: string;
  shards: number;
  session_start_limit: {
    total: number;
    remaining: number;
    reset_after: number;
    max_concurrency: number;
  };
}

export class DiscordApi {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${DISCORD_API_BASE}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bot ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Discord API error (${method} ${path}): ${response.status} ${errorText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async getCurrentUser(): Promise<DiscordUser> {
    return this.request<DiscordUser>("GET", "/users/@me");
  }

  async getUser(userId: string): Promise<DiscordUser> {
    return this.request<DiscordUser>("GET", `/users/${userId}`);
  }

  async getGatewayBot(): Promise<DiscordGatewayBot> {
    return this.request<DiscordGatewayBot>("GET", "/gateway/bot");
  }

  async getChannel(channelId: string): Promise<DiscordChannel> {
    return this.request<DiscordChannel>("GET", `/channels/${channelId}`);
  }

  async createMessage(
    channelId: string,
    options: {
      content?: string;
      embeds?: DiscordEmbed[];
      tts?: boolean;
      messageReference?: { message_id: string; channel_id?: string; guild_id?: string };
      allowedMentions?: { parse?: string[]; roles?: string[]; users?: string[]; repliedUser?: boolean };
    },
  ): Promise<DiscordMessage> {
    return this.request<DiscordMessage>("POST", `/channels/${channelId}/messages`, {
      content: options.content,
      embeds: options.embeds,
      tts: options.tts,
      message_reference: options.messageReference,
      allowed_mentions: options.allowedMentions,
    });
  }

  async editMessage(
    channelId: string,
    messageId: string,
    options: { content?: string; embeds?: DiscordEmbed[] },
  ): Promise<DiscordMessage> {
    return this.request<DiscordMessage>("PATCH", `/channels/${channelId}/messages/${messageId}`, {
      content: options.content,
      embeds: options.embeds,
    });
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    await this.request<void>("DELETE", `/channels/${channelId}/messages/${messageId}`);
  }

  async getChannelMessages(
    channelId: string,
    options?: { limit?: number; before?: string; after?: string; around?: string },
  ): Promise<DiscordMessage[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.before) params.set("before", options.before);
    if (options?.after) params.set("after", options.after);
    if (options?.around) params.set("around", options.around);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<DiscordMessage[]>("GET", `/channels/${channelId}/messages${query}`);
  }

  async createReaction(
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    await this.request<void>(
      "PUT",
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    );
  }

  async deleteOwnReaction(
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    await this.request<void>(
      "DELETE",
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    );
  }

  async deleteAllReactions(
    channelId: string,
    messageId: string,
    emoji?: string,
  ): Promise<void> {
    const basePath = `/channels/${channelId}/messages/${messageId}/reactions`;
    const path = emoji ? `${basePath}/${encodeURIComponent(emoji)}` : basePath;
    await this.request<void>("DELETE", path);
  }

  async getGuild(guildId: string): Promise<{
    id: string;
    name: string;
    icon?: string;
    owner_id: string;
    member_count?: number;
  }> {
    return this.request("GET", `/guilds/${guildId}`);
  }

  async getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    return this.request<DiscordChannel[]>("GET", `/guilds/${guildId}/channels`);
  }

  async triggerTypingIndicator(channelId: string): Promise<void> {
    await this.request<void>("POST", `/channels/${channelId}/typing`);
  }
}
