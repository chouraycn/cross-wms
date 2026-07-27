/**
 * Mattermost 渠道 API 封装
 *
 * 基于 Mattermost API 实现自托管团队通信平台的消息收发能力。
 * 参考 openclaw/extensions/mattermost 的核心 API 层。
 */

export interface MattermostConfig {
  serverUrl: string;
  accessToken: string;
  botUserId?: string;
  teamId?: string;
}

export interface MattermostUser {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  nickname: string;
  [key: string]: unknown;
}

export interface MattermostPost {
  id: string;
  create_at: number;
  update_at: number;
  edit_at: number;
  delete_at: number;
  is_pinned: boolean;
  user_id: string;
  channel_id: string;
  root_id: string;
  parent_id: string;
  original_id: string;
  message: string;
  type: string;
  props: Record<string, unknown>;
  hashtag: string;
  file_ids: string[];
  [key: string]: unknown;
}

export interface MattermostChannel {
  id: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  team_id: string;
  type: "O" | "P" | "D" | "G";
  display_name: string;
  name: string;
  header: string;
  purpose: string;
  [key: string]: unknown;
}

export interface MattermostSendResult {
  id: string;
  [key: string]: unknown;
}

export interface MattermostChannelApi {
  createPost(channelId: string, message: string, rootId?: string): Promise<MattermostPost>;
  getPost(postId: string): Promise<MattermostPost>;
  getPostsForChannel(channelId: string, page?: number, perPage?: number): Promise<MattermostPost[]>;
  getChannel(channelId: string): Promise<MattermostChannel>;
  getChannelsForTeam(teamId?: string): Promise<MattermostChannel[]>;
  getUser(userId: string): Promise<MattermostUser>;
  getMe(): Promise<MattermostUser>;
  searchChannels(term: string, teamId?: string): Promise<MattermostChannel[]>;
}

export function createMattermostChannel(config: MattermostConfig): MattermostChannelApi {
  const serverUrl = config.serverUrl.replace(/\/$/, "");

  const request = async (path: string, options: RequestInit = {}): Promise<unknown> => {
    const response = await fetch(`${serverUrl}/api/v4${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Mattermost API error (${path}): ${response.status} ${errorText}`);
    }

    if (response.status === 204) return undefined;
    return response.json();
  };

  const createPost = async (channelId: string, message: string, rootId?: string): Promise<MattermostPost> => {
    const body: Record<string, unknown> = {
      channel_id: channelId,
      message,
    };
    if (rootId) {
      body.root_id = rootId;
    }
    const result = await request("/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return result as MattermostPost;
  };

  const getPost = async (postId: string): Promise<MattermostPost> => {
    const result = await request(`/posts/${postId}`);
    return result as MattermostPost;
  };

  const getPostsForChannel = async (channelId: string, page: number = 0, perPage: number = 30): Promise<MattermostPost[]> => {
    const result = await request(`/channels/${channelId}/posts?page=${page}&per_page=${perPage}`);
    const data = result as { posts: Record<string, MattermostPost>; order: string[] };
    const posts: MattermostPost[] = [];
    if (data.order && data.posts) {
      for (const id of data.order) {
        if (data.posts[id]) {
          posts.push(data.posts[id]);
        }
      }
    }
    return posts;
  };

  const getChannel = async (channelId: string): Promise<MattermostChannel> => {
    const result = await request(`/channels/${channelId}`);
    return result as MattermostChannel;
  };

  const getChannelsForTeam = async (teamId?: string): Promise<MattermostChannel[]> => {
    const tid = teamId || config.teamId;
    if (!tid) {
      throw new Error("Team ID is required for getChannelsForTeam");
    }
    const result = await request(`/teams/${tid}/channels`);
    return result as MattermostChannel[];
  };

  const getUser = async (userId: string): Promise<MattermostUser> => {
    const result = await request(`/users/${userId}`);
    return result as MattermostUser;
  };

  const getMe = async (): Promise<MattermostUser> => {
    const result = await request("/users/me");
    return result as MattermostUser;
  };

  const searchChannels = async (term: string, teamId?: string): Promise<MattermostChannel[]> => {
    const tid = teamId || config.teamId;
    if (!tid) {
      throw new Error("Team ID is required for searchChannels");
    }
    const result = await request(`/teams/${tid}/channels/search`, {
      method: "POST",
      body: JSON.stringify({ term }),
    });
    return result as MattermostChannel[];
  };

  return {
    createPost,
    getPost,
    getPostsForChannel,
    getChannel,
    getChannelsForTeam,
    getUser,
    getMe,
    searchChannels,
  };
}
