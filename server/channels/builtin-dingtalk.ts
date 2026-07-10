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

export const DINGTALK_CHANNEL_ID = "dingtalk" as ChannelId;

interface DingTalkAccountConfig {
  appKey: string;
  appSecret: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(account: DingTalkAccountConfig): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const response = await fetch("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appKey: account.appKey,
      appSecret: account.appSecret,
    }),
  });

  const data = await response.json();
  if (data.accessToken) {
    cachedAccessToken = data.accessToken;
    tokenExpiresAt = now + (data.expireIn - 60) * 1000;
    return cachedAccessToken!;
  }
  throw new Error(`DingTalk auth failed: ${data.message || "Unknown error"}`);
}

export function createDingTalkChannelPlugin(): ChannelPlugin {
  const dingTalkChannelMeta: ChannelMeta = {
    id: DINGTALK_CHANNEL_ID,
    label: "钉钉",
    selectionLabel: "钉钉",
    blurb: "钉钉机器人消息通道",
    docsPath: "/channels/dingtalk",
    aliases: ["dingtalk", "ding"],
    markdownCapable: true,
  };

  const dingTalkChannelCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    mentions: true,
    voice: false,
    video: false,
    typing: false,
  };

  const dingTalkChannelConfig: ChannelConfigAdapter<DingTalkAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const dingTalkConfig = config.dingtalk as Record<string, unknown>;
      if (dingTalkConfig && dingTalkConfig.appKey && dingTalkConfig.appSecret) {
        return [DINGTALK_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): DingTalkAccountConfig | null => {
      if (accountId !== DINGTALK_CHANNEL_ID) return null;
      const dingTalkConfig = config.dingtalk as Record<string, unknown>;
      if (dingTalkConfig && dingTalkConfig.appKey && dingTalkConfig.appSecret) {
        return {
          appKey: String(dingTalkConfig.appKey),
          appSecret: String(dingTalkConfig.appSecret),
          accessToken: dingTalkConfig.accessToken as string | undefined,
          accessTokenExpiresAt: dingTalkConfig.accessTokenExpiresAt as number | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: DingTalkAccountConfig): boolean => {
      return !!account.appKey && !!account.appSecret;
    },
    isConfigured: (account: DingTalkAccountConfig): boolean => {
      return !!account.appKey && !!account.appSecret;
    },
  };

  const dingTalkChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = dingTalkChannelConfig.resolveAccount(
          { dingtalk: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "DingTalk account not configured" };
        }

        try {
          const token = await getAccessToken(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const response = await fetch("https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-acs-dingtalk-access-token": token,
            },
            body: JSON.stringify({
              robotCode: account.appKey,
              userIds: [ctx.to],
              msgParam: JSON.stringify({
                msgtype: "text",
                text: { content: text },
              }),
            }),
          });

          const data = await response.json();
          if (data.success) {
            return { success: true, messageId: String(data.result?.taskId || "") };
          }
          return { success: false, error: `DingTalk send failed: ${data.message || "Unknown error"}` };
        } catch (error) {
          return {
            success: false,
            error: `DingTalk send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: DINGTALK_CHANNEL_ID,
    meta: dingTalkChannelMeta,
    capabilities: dingTalkChannelCapabilities,
    config: dingTalkChannelConfig,
    message: dingTalkChannelMessageAdapter,
  });
}