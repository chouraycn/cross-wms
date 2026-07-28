// @ts-nocheck

/**
 * Microsoft Teams 渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 Microsoft Teams 渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/msteams 的架构模式。
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
import { createMSTeamsChannel, type MSTeamsConfig } from "./api.js";

export const MSTEAMS_CHANNEL_ID = "msteams" as ChannelId;

interface MSTeamsAccountConfig extends MSTeamsConfig {}

const manifest: ExtensionManifest = {
  id: "msteams",
  name: "Microsoft Teams Channel",
  description: "Microsoft Teams channel extension for enterprise collaboration",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "oauth",
};

const msteamsChannelMeta: ChannelMeta = {
  id: MSTEAMS_CHANNEL_ID,
  label: "Microsoft Teams",
  selectionLabel: "Microsoft Teams",
  blurb: "Microsoft Teams 企业协作平台，支持聊天、团队频道和会议",
  docsPath: "/channels/msteams",
  aliases: ["msteams", "teams", "microsoft-teams"],
  markdownCapable: false,
};

const msteamsChannelCapabilities: ChannelCapabilities = {
  chatTypes: ["direct", "group"],
  media: true,
  reactions: true,
  threads: true,
  polls: false,
  mentions: true,
  voice: true,
  video: true,
  typing: true,
};

const msteamsChannelConfig: ChannelConfigAdapter<MSTeamsAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const msteamsConfig = config.msteams as Record<string, unknown> | undefined;
    if (msteamsConfig && msteamsConfig.appId && msteamsConfig.appPassword) {
      return [MSTEAMS_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): MSTeamsAccountConfig | null => {
    if (accountId !== MSTEAMS_CHANNEL_ID) return null;
    const msteamsConfig = config.msteams as Record<string, unknown> | undefined;
    if (msteamsConfig && msteamsConfig.appId && msteamsConfig.appPassword) {
      return {
        appId: String(msteamsConfig.appId),
        appPassword: String(msteamsConfig.appPassword),
        tenantId: msteamsConfig.tenantId as string | undefined,
        apiBase: msteamsConfig.apiBase as string | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: MSTeamsAccountConfig): boolean => {
    return !!account.appId && !!account.appPassword;
  },
  isConfigured: (account: MSTeamsAccountConfig): boolean => {
    return !!account.appId && !!account.appPassword;
  },
};

function createMSTeamsChannelPlugin(): ChannelPlugin<MSTeamsAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = msteamsChannelConfig.resolveAccount(
          { msteams: { appId: process.env.MSTEAMS_APP_ID, appPassword: process.env.MSTEAMS_APP_PASSWORD } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Microsoft Teams account not configured" };
        }

        try {
          const msteams = createMSTeamsChannel(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const result = await msteams.sendMessage(ctx.to, text);

          return { success: true, messageId: result.id };
        } catch (error) {
          return {
            success: false,
            error: `Microsoft Teams send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: MSTEAMS_CHANNEL_ID,
    meta: msteamsChannelMeta,
    capabilities: msteamsChannelCapabilities,
    config: msteamsChannelConfig,
    message: messageAdapter,
  });
}

export default class MSTeamsChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering Microsoft Teams channel extension");

    const appId = context.secrets("MSTEAMS_APP_ID");
    const appPassword = context.secrets("MSTEAMS_APP_PASSWORD");
    if (!appId || !appPassword) {
      context.logger.warn("MSTEAMS_APP_ID / MSTEAMS_APP_PASSWORD not found in environment");
    }

    const plugin = createMSTeamsChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("Microsoft Teams channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(MSTEAMS_CHANNEL_ID);
    console.log("Unregistered Microsoft Teams channel extension");
  }
}

export { createMSTeamsChannel };
export type {
  MSTeamsConfig,
  MSTeamsChannel,
  MSTeamsMessage,
  MSTeamsSendMessageResult,
} from "./api.js";
