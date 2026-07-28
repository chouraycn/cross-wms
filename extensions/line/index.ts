// @ts-nocheck

/**
 * LINE 渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 LINE 渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/line 的架构模式。
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
import { createLineChannel, type LineChannelConfig } from "./api.js";

export const LINE_CHANNEL_ID = "line" as ChannelId;

interface LineAccountConfig extends LineChannelConfig {}

const manifest: ExtensionManifest = {
  id: "line",
  name: "LINE Channel",
  description: "LINE Messaging API channel extension",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

const lineChannelMeta: ChannelMeta = {
  id: LINE_CHANNEL_ID,
  label: "LINE",
  selectionLabel: "LINE (Messaging API)",
  blurb: "LINE 机器人消息通道，支持文本、图片、模板消息和 Flex Message",
  docsPath: "/channels/line",
  aliases: ["line"],
  markdownCapable: false,
};

const lineChannelCapabilities: ChannelCapabilities = {
  chatTypes: ["direct", "group"],
  media: true,
  reactions: false,
  threads: false,
  polls: false,
  mentions: false,
  voice: true,
  video: true,
  typing: false,
};

const lineChannelConfig: ChannelConfigAdapter<LineAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const lineConfig = config.line as Record<string, unknown> | undefined;
    if (lineConfig && lineConfig.channelAccessToken && lineConfig.channelSecret) {
      return [LINE_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): LineAccountConfig | null => {
    if (accountId !== LINE_CHANNEL_ID) return null;
    const lineConfig = config.line as Record<string, unknown> | undefined;
    if (lineConfig && lineConfig.channelAccessToken && lineConfig.channelSecret) {
      return {
        channelAccessToken: String(lineConfig.channelAccessToken),
        channelSecret: String(lineConfig.channelSecret),
        apiBase: lineConfig.apiBase as string | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: LineAccountConfig): boolean => {
    return !!account.channelAccessToken && !!account.channelSecret;
  },
  isConfigured: (account: LineAccountConfig): boolean => {
    return !!account.channelAccessToken && !!account.channelSecret;
  },
};

function createLineChannelPlugin(): ChannelPlugin<LineAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = lineChannelConfig.resolveAccount(
          { line: { channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN, channelSecret: process.env.LINE_CHANNEL_SECRET } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "LINE account not configured" };
        }

        try {
          const line = createLineChannel(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          await line.sendText(ctx.to, text);

          return { success: true, messageId: `${ctx.to}-${Date.now()}` };
        } catch (error) {
          return {
            success: false,
            error: `LINE send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: LINE_CHANNEL_ID,
    meta: lineChannelMeta,
    capabilities: lineChannelCapabilities,
    config: lineChannelConfig,
    message: messageAdapter,
  });
}

export default class LineChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering LINE channel extension");

    const channelAccessToken = context.secrets("LINE_CHANNEL_ACCESS_TOKEN");
    const channelSecret = context.secrets("LINE_CHANNEL_SECRET");
    if (!channelAccessToken || !channelSecret) {
      context.logger.warn("LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET not found in environment");
    }

    const plugin = createLineChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("LINE channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(LINE_CHANNEL_ID);
    console.log("Unregistered LINE channel extension");
  }
}

export { createLineChannel };
export type {
  LineChannelConfig,
  LineChannel,
  LineMessage,
  WebhookEvent,
  WebhookRequestBody,
  LineEventSource,
} from "./api.js";
