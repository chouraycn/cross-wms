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

export const MATRIX_CHANNEL_ID = "matrix" as ChannelId;

interface MatrixAccountConfig {
  homeserverUrl: string;
  accessToken: string;
  userId?: string;
}

export interface MatrixWebhookResult {
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

let cachedUserId: string | null = null;

async function getUserId(account: MatrixAccountConfig): Promise<string> {
  if (cachedUserId) return cachedUserId;

  try {
    const response = await fetch(`${account.homeserverUrl}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    const data = await response.json();
    if (data.user_id) {
      cachedUserId = data.user_id;
      return data.user_id;
    }
  } catch {
  }
  return account.userId || "@bot:matrix.org";
}

export function createMatrixChannelPlugin(): ChannelPlugin {
  const matrixChannelMeta: ChannelMeta = {
    id: MATRIX_CHANNEL_ID,
    label: "Matrix",
    selectionLabel: "Matrix",
    blurb: "Matrix 消息通道",
    docsPath: "/channels/matrix",
    aliases: ["matrix"],
    markdownCapable: true,
  };

  const matrixChannelCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: true,
    threads: true,
    polls: false,
    mentions: true,
    voice: false,
    video: false,
    typing: true,
  };

  const matrixChannelConfig: ChannelConfigAdapter<MatrixAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const matrixConfig = config.matrix as Record<string, unknown>;
      if (matrixConfig && matrixConfig.homeserverUrl && matrixConfig.accessToken) {
        return [MATRIX_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): MatrixAccountConfig | null => {
      if (accountId !== MATRIX_CHANNEL_ID) return null;
      const matrixConfig = config.matrix as Record<string, unknown>;
      if (matrixConfig && matrixConfig.homeserverUrl && matrixConfig.accessToken) {
        return {
          homeserverUrl: String(matrixConfig.homeserverUrl),
          accessToken: String(matrixConfig.accessToken),
          userId: matrixConfig.userId as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: MatrixAccountConfig): boolean => {
      return !!account.homeserverUrl && !!account.accessToken;
    },
    isConfigured: (account: MatrixAccountConfig): boolean => {
      return !!account.homeserverUrl && !!account.accessToken;
    },
  };

  const matrixChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = matrixChannelConfig.resolveAccount(
          { matrix: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Matrix account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const roomId = ctx.to;
          if (!roomId) {
            return { success: false, error: "Matrix room ID not provided" };
          }

          const body: Record<string, unknown> = {
            msgtype: "m.text",
            body: text,
            format: "org.matrix.custom.html",
            formatted_body: text.replace(/\n/g, "<br>"),
          };

          const response = await fetch(
            `${account.homeserverUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${account.accessToken}`,
              },
              body: JSON.stringify(body),
            },
          );

          if (response.ok) {
            const data = await response.json();
            return { success: true, messageId: data.event_id || `matrix-${Date.now()}` };
          }
          const errorText = await response.text();
          return { success: false, error: `Matrix send failed: ${errorText.slice(0, 200)}` };
        } catch (error) {
          return {
            success: false,
            error: `Matrix send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: MATRIX_CHANNEL_ID,
    meta: matrixChannelMeta,
    capabilities: matrixChannelCapabilities,
    config: matrixChannelConfig,
    message: matrixChannelMessageAdapter,
  });
}

export function parseMatrixWebhook(body: unknown): MatrixWebhookResult {
  const data = body as Record<string, unknown>;

  if (!data.type || !data.room_id || !data.content) {
    return { success: false, error: "Invalid Matrix event format" };
  }

  const type = String(data.type);
  if (type !== "m.room.message") {
    return { success: false, error: `Unsupported event type: ${type}` };
  }

  const content = data.content as Record<string, unknown>;
  const msgtype = String(content.msgtype || "");

  if (msgtype !== "m.text") {
    return { success: false, error: `Unsupported message type: ${msgtype}` };
  }

  const text = String(content.body || "");
  if (!text) {
    return { success: false, error: "Empty message" };
  }

  const sender = String(data.sender || "");
  const isDirect = sender.startsWith("@") && !String(data.room_id || "").startsWith("!");

  return {
    success: true,
    type: "message",
    message: {
      channelId: String(data.room_id || ""),
      userId: sender,
      messageId: String(data.event_id || ""),
      text,
      timestamp: Number(data.origin_server_ts || Date.now()),
      chatType: isDirect ? "direct" : "group",
    },
  };
}