/**
 * Slack Web API 封装
 *
 * 基于 Slack Web API: https://api.slack.com/web
 */

const SLACK_API_BASE = "https://slack.com/api";

export interface SlackAuthTestResponse {
  ok: boolean;
  url: string;
  team: string;
  user: string;
  team_id: string;
  user_id: string;
  bot_id?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_private: boolean;
  is_mpim: boolean;
  created: number;
  creator?: string;
  num_members?: number;
}

export interface SlackMessage {
  type: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
  username?: string;
  channel?: string;
  files?: SlackFile[];
  reply_count?: number;
  reactions?: SlackReaction[];
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private?: string;
  url_private_download?: string;
}

export interface SlackReaction {
  name: string;
  users: string[];
  count: number;
}

export interface SlackPostMessageResult {
  ok: boolean;
  channel: string;
  ts: string;
  message: SlackMessage;
}

export class SlackApi {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${SLACK_API_BASE}/${method}`;
    const body = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          body.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
        }
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = (await response.json()) as { ok: boolean } & T;

    if (!data.ok) {
      const error = (data as { error?: string }).error || "Unknown error";
      throw new Error(`Slack API error (${method}): ${error}`);
    }

    return data;
  }

  async authTest(): Promise<SlackAuthTestResponse> {
    return this.request<SlackAuthTestResponse>("auth.test");
  }

  async postMessage(
    channel: string,
    text: string,
    options?: {
      threadTs?: string;
      blocks?: unknown[];
      replyBroadcast?: boolean;
      unfurlLinks?: boolean;
      mrkdwn?: boolean;
    },
  ): Promise<SlackPostMessageResult> {
    return this.request<SlackPostMessageResult>("chat.postMessage", {
      channel,
      text,
      thread_ts: options?.threadTs,
      blocks: options?.blocks,
      reply_broadcast: options?.replyBroadcast,
      unfurl_links: options?.unfurlLinks,
      mrkdwn: options?.mrkdwn ?? true,
    });
  }

  async updateMessage(
    channel: string,
    ts: string,
    text: string,
    options?: { blocks?: unknown[] },
  ): Promise<{ ok: boolean; channel: string; ts: string; text: string }> {
    return this.request("chat.update", {
      channel,
      ts,
      text,
      blocks: options?.blocks,
    });
  }

  async deleteMessage(channel: string, ts: string): Promise<{ ok: boolean }> {
    return this.request("chat.delete", {
      channel,
      ts,
    });
  }

  async conversationsList(
    options?: { types?: string; limit?: number; cursor?: string },
  ): Promise<{
    ok: boolean;
    channels: SlackChannel[];
    response_metadata?: { next_cursor?: string };
  }> {
    return this.request("conversations.list", {
      types: options?.types,
      limit: options?.limit,
      cursor: options?.cursor,
    });
  }

  async conversationsHistory(
    channel: string,
    options?: { limit?: number; oldest?: string; latest?: string },
  ): Promise<{ ok: boolean; messages: SlackMessage[]; has_more?: boolean }> {
    return this.request("conversations.history", {
      channel,
      limit: options?.limit,
      oldest: options?.oldest,
      latest: options?.latest,
    });
  }

  async conversationsReplies(
    channel: string,
    ts: string,
    options?: { limit?: number },
  ): Promise<{ ok: boolean; messages: SlackMessage[]; has_more?: boolean }> {
    return this.request("conversations.replies", {
      channel,
      ts,
      limit: options?.limit,
    });
  }

  async reactionsAdd(channel: string, timestamp: string, name: string): Promise<{ ok: boolean }> {
    return this.request("reactions.add", {
      channel,
      timestamp,
      name,
    });
  }

  async reactionsRemove(channel: string, timestamp: string, name: string): Promise<{ ok: boolean }> {
    return this.request("reactions.remove", {
      channel,
      timestamp,
      name,
    });
  }

  async filesUpload(
    channels: string[],
    filename: string,
    content?: string,
    options?: { title?: string; filetype?: string },
  ): Promise<{ ok: boolean; file: SlackFile }> {
    return this.request("files.upload", {
      channels: channels.join(","),
      filename,
      content,
      title: options?.title,
      filetype: options?.filetype,
    });
  }

  async usersInfo(user: string): Promise<{
    ok: boolean;
    user: {
      id: string;
      name: string;
      real_name?: string;
      profile?: { display_name?: string; email?: string; image_512?: string };
    };
  }> {
    return this.request("users.info", { user });
  }

  async pinsAdd(channel: string, timestamp: string): Promise<{ ok: boolean }> {
    return this.request("pins.add", { channel, timestamp });
  }

  async pinsRemove(channel: string, timestamp: string): Promise<{ ok: boolean }> {
    return this.request("pins.remove", { channel, timestamp });
  }
}
