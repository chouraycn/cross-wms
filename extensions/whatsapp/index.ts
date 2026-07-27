/**
 * WhatsApp 渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 WhatsApp 渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/whatsapp 的架构模式。
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
import { createWhatsAppChannel, type WhatsAppConfig } from "./api.js";

export const WHATSAPP_CHANNEL_ID = "whatsapp" as ChannelId;

interface WhatsAppAccountConfig extends WhatsAppConfig {}

const manifest: ExtensionManifest = {
  id: "whatsapp",
  name: "WhatsApp Channel",
  description: "WhatsApp Business API channel extension",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

const whatsappChannelMeta: ChannelMeta = {
  id: WHATSAPP_CHANNEL_ID,
  label: "WhatsApp",
  selectionLabel: "WhatsApp (Business API)",
  blurb: "WhatsApp 商业消息通道，支持文本、模板消息和媒体",
  docsPath: "/channels/whatsapp",
  aliases: ["whatsapp", "wa"],
  markdownCapable: false,
};

const whatsappChannelCapabilities: ChannelCapabilities = {
  chatTypes: ["direct"],
  media: true,
  reactions: false,
  threads: false,
  polls: false,
  mentions: false,
  voice: true,
  video: true,
  typing: false,
};

const whatsappChannelConfig: ChannelConfigAdapter<WhatsAppAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const whatsappConfig = config.whatsapp as Record<string, unknown> | undefined;
    if (whatsappConfig && whatsappConfig.phoneNumberId && whatsappConfig.accessToken) {
      return [WHATSAPP_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): WhatsAppAccountConfig | null => {
    if (accountId !== WHATSAPP_CHANNEL_ID) return null;
    const whatsappConfig = config.whatsapp as Record<string, unknown> | undefined;
    if (whatsappConfig && whatsappConfig.phoneNumberId && whatsappConfig.accessToken) {
      return {
        phoneNumberId: String(whatsappConfig.phoneNumberId),
        accessToken: String(whatsappConfig.accessToken),
        businessAccountId: whatsappConfig.businessAccountId as string | undefined,
        apiBase: whatsappConfig.apiBase as string | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: WhatsAppAccountConfig): boolean => {
    return !!account.phoneNumberId && !!account.accessToken;
  },
  isConfigured: (account: WhatsAppAccountConfig): boolean => {
    return !!account.phoneNumberId && !!account.accessToken;
  },
};

function createWhatsAppChannelPlugin(): ChannelPlugin<WhatsAppAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = whatsappChannelConfig.resolveAccount(
          { whatsapp: { phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID, accessToken: process.env.WHATSAPP_ACCESS_TOKEN } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "WhatsApp account not configured" };
        }

        try {
          const whatsapp = createWhatsAppChannel(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const result = await whatsapp.sendTextMessage(ctx.to, text);

          const messageId = result.messages?.[0]?.id;
          return { success: true, messageId };
        } catch (error) {
          return {
            success: false,
            error: `WhatsApp send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: WHATSAPP_CHANNEL_ID,
    meta: whatsappChannelMeta,
    capabilities: whatsappChannelCapabilities,
    config: whatsappChannelConfig,
    message: messageAdapter,
  });
}

export default class WhatsAppChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering WhatsApp channel extension");

    const phoneNumberId = context.secrets("WHATSAPP_PHONE_NUMBER_ID");
    const accessToken = context.secrets("WHATSAPP_ACCESS_TOKEN");
    if (!phoneNumberId || !accessToken) {
      context.logger.warn("WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not found in environment");
    }

    const plugin = createWhatsAppChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("WhatsApp channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(WHATSAPP_CHANNEL_ID);
    console.log("Unregistered WhatsApp channel extension");
  }
}

export { createWhatsAppChannel };
export type {
  WhatsAppConfig,
  WhatsAppChannel,
  WhatsAppMessage,
  WhatsAppSendMessageResult,
  WhatsAppWebhookEvent,
} from "./api.js";
