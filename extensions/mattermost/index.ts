/**
 * Mattermost 渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 Mattermost 渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/mattermost 的架构模式。
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
import { createMattermostChannel, type MattermostConfig } from "./api.js";

export const MATTERMOST_CHANNEL_ID = "mattermost" as ChannelId;

interface MattermostAccountConfig extends MattermostConfig {}

const manifest: ExtensionManifest = {
  id: "mattermost",
  name: "Mattermost Channel",
  description: "Mattermost self-hosted team communication channel extension",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

const mattermostChannelMeta: ChannelMeta = {
  id: MATTERMOST_CHANNEL_ID,
  label: "Mattermost",
  selectionLabel: "Mattermost (Self-hosted)",
  blurb: "Mattermost 自托管团队通信平台，支持频道、私信和集成",
  docsPath: "/channels/mattermost",
  aliases: ["mattermost", "mm"],
  markdownCapable: true,
};

const mattermostChannelCapabilities: ChannelCapabilities = {
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

const mattermostChannelConfig: ChannelConfigAdapter<MattermostAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const mattermostConfig = config.mattermost as Record<string, unknown> | undefined;
    if (mattermostConfig && mattermostConfig.serverUrl && mattermostConfig.accessToken) {
      return [MATTERMOST_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): MattermostAccountConfig | null => {
    if (accountId !== MATTERMOST_CHANNEL_ID) return null;
    const mattermostConfig = config.mattermost as Record<string, unknown> | undefined;
    if (mattermostConfig && mattermostConfig.serverUrl && mattermostConfig.accessToken) {
      return {
        serverUrl: String(mattermostConfig.serverUrl),
        accessToken: String(mattermostConfig.accessToken),
        botUserId: mattermostConfig.botUserId as string | undefined,
        teamId: mattermostConfig.teamId as string | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: MattermostAccountConfig): boolean => {
    return !!account.serverUrl && !!account.accessToken;
  },
  isConfigured: (account: MattermostAccountConfig): boolean => {
    return !!account.serverUrl && !!account.accessToken;
  },
};

function createMattermostChannelPlugin(): ChannelPlugin<MattermostAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = mattermostChannelConfig.resolveAccount(
          { mattermost: { serverUrl: process.env.MATTERMOST_SERVER_URL, accessToken: process.env.MATTERMOST_ACCESS_TOKEN } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Mattermost account not configured" };
        }

        try {
          const mattermost = createMattermostChannel(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const result = await mattermost.createPost(ctx.to, text);

          return { success: true, messageId: result.id };
        } catch (error) {
          return {
            success: false,
            error: `Mattermost send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: MATTERMOST_CHANNEL_ID,
    meta: mattermostChannelMeta,
    capabilities: mattermostChannelCapabilities,
    config: mattermostChannelConfig,
    message: messageAdapter,
  });
}

export default class MattermostChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering Mattermost channel extension");

    const serverUrl = context.secrets("MATTERMOST_SERVER_URL");
    const accessToken = context.secrets("MATTERMOST_ACCESS_TOKEN");
    if (!serverUrl || !accessToken) {
      context.logger.warn("MATTERMOST_SERVER_URL / MATTERMOST_ACCESS_TOKEN not found in environment");
    }

    const plugin = createMattermostChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("Mattermost channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(MATTERMOST_CHANNEL_ID);
    console.log("Unregistered Mattermost channel extension");
  }
}

export { createMattermostChannel };
export type {
  MattermostConfig,
  MattermostChannelApi,
  MattermostPost,
  MattermostChannel,
  MattermostUser,
  MattermostSendResult,
} from "./api.js";
