/**
 * Slack 渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 Slack 渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/slack 的架构模式。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from "../extension-types.js";
import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
  ChannelPlugin,
} from "../../server/channels/types.js";
import type {
  MessageSendContext,
  ChannelMessageSendResult,
} from "../../server/channels/message/types.js";
import { createChannelPlugin, getGlobalChannelRegistry } from "../../server/channels/registry.js";
import { SlackApi } from "./api.js";

export const SLACK_CHANNEL_ID = "slack" as ChannelId;

interface SlackAccountConfig {
  botToken: string;
  appToken?: string;
  userToken?: string;
}

const manifest: ExtensionManifest = {
  id: "slack",
  name: "Slack Channel",
  description: "Slack Bot channel extension with Socket Mode support",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

const slackChannelMeta: ChannelMeta = {
  id: SLACK_CHANNEL_ID,
  label: "Slack",
  selectionLabel: "Slack (Socket Mode)",
  blurb: "Slack 机器人消息通道，支持频道、私信、线程和斜杠命令",
  docsPath: "/channels/slack",
  aliases: ["slack", "slack-bot"],
  markdownCapable: true,
};

const slackChannelCapabilities: ChannelCapabilities = {
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

const slackChannelConfig: ChannelConfigAdapter<SlackAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const slackConfig = config.slack as Record<string, unknown> | undefined;
    if (slackConfig && (slackConfig.botToken || slackConfig.userToken)) {
      return [SLACK_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): SlackAccountConfig | null => {
    if (accountId !== SLACK_CHANNEL_ID) return null;
    const slackConfig = config.slack as Record<string, unknown> | undefined;
    if (slackConfig && (slackConfig.botToken || slackConfig.userToken)) {
      return {
        botToken: String(slackConfig.botToken || ""),
        appToken: slackConfig.appToken as string | undefined,
        userToken: slackConfig.userToken as string | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: SlackAccountConfig): boolean => {
    return !!account.botToken || !!account.userToken;
  },
  isConfigured: (account: SlackAccountConfig): boolean => {
    return !!account.botToken || !!account.userToken;
  },
};

function createSlackChannelPlugin(): ChannelPlugin<SlackAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = slackChannelConfig.resolveAccount(
          { slack: { botToken: process.env.SLACK_BOT_TOKEN } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Slack account not configured" };
        }

        const token = account.botToken || account.userToken;
        if (!token) {
          return { success: false, error: "No Slack token available" };
        }

        try {
          const api = new SlackApi(token);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const result = await api.postMessage(ctx.to, text, {
            mrkdwn: true,
            unfurlLinks: true,
          });

          return { success: true, messageId: result.ts };
        } catch (error) {
          return {
            success: false,
            error: `Slack send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: SLACK_CHANNEL_ID,
    meta: slackChannelMeta,
    capabilities: slackChannelCapabilities,
    config: slackChannelConfig,
    message: messageAdapter,
  });
}

export default class SlackChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering Slack channel extension");

    const botToken = context.secrets("SLACK_BOT_TOKEN");
    const appToken = context.secrets("SLACK_APP_TOKEN");
    if (!botToken && !appToken) {
      context.logger.warn("SLACK_BOT_TOKEN / SLACK_APP_TOKEN not found in environment");
    }

    const plugin = createSlackChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("Slack channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(SLACK_CHANNEL_ID);
    console.log("Unregistered Slack channel extension");
  }
}

export { SlackApi };
export type {
  SlackAuthTestResponse,
  SlackChannel,
  SlackMessage,
  SlackFile,
  SlackReaction,
  SlackPostMessageResult,
};
