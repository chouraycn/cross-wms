/**
 * SMS 渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 SMS 渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/sms 的架构模式。
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
import { createSmsChannel, type SmsChannelConfig } from "./api.js";

export const SMS_CHANNEL_ID = "sms" as ChannelId;

interface SmsAccountConfig extends SmsChannelConfig {}

const manifest: ExtensionManifest = {
  id: "sms",
  name: "SMS Channel",
  description: "SMS text messaging channel extension with pluggable providers",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

const smsChannelMeta: ChannelMeta = {
  id: SMS_CHANNEL_ID,
  label: "SMS",
  selectionLabel: "SMS (Text Message)",
  blurb: "短信渠道，支持 Twilio / Vonage / 阿里云短信等多种服务商",
  docsPath: "/channels/sms",
  aliases: ["sms", "text", "text-message"],
  markdownCapable: false,
};

const smsChannelCapabilities: ChannelCapabilities = {
  chatTypes: ["direct"],
  media: false,
  reactions: false,
  threads: false,
  polls: false,
  mentions: false,
  voice: false,
  video: false,
  typing: false,
};

const smsChannelConfig: ChannelConfigAdapter<SmsAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const smsConfig = config.sms as Record<string, unknown> | undefined;
    if (smsConfig && (smsConfig.endpoint || smsConfig.transport)) {
      return [SMS_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): SmsAccountConfig | null => {
    if (accountId !== SMS_CHANNEL_ID) return null;
    const smsConfig = config.sms as Record<string, unknown> | undefined;
    if (smsConfig && (smsConfig.endpoint || smsConfig.transport)) {
      return {
        from: smsConfig.from as string | undefined,
        provider: smsConfig.provider as string | undefined,
        endpoint: smsConfig.endpoint as string | undefined,
        credentials: smsConfig.credentials as Record<string, string> | undefined,
        timeout: smsConfig.timeout as number | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: SmsAccountConfig): boolean => {
    return !!account.endpoint || !!account.transport;
  },
  isConfigured: (account: SmsAccountConfig): boolean => {
    return !!account.endpoint || !!account.transport;
  },
};

function createSmsChannelPlugin(): ChannelPlugin<SmsAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = smsChannelConfig.resolveAccount(
          { sms: { endpoint: process.env.SMS_ENDPOINT } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "SMS account not configured" };
        }

        try {
          const sms = createSmsChannel(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const result = await sms.send({
            to: ctx.to,
            text,
          });

          return { success: result.success, messageId: result.messageId, error: result.error };
        } catch (error) {
          return {
            success: false,
            error: `SMS send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: SMS_CHANNEL_ID,
    meta: smsChannelMeta,
    capabilities: smsChannelCapabilities,
    config: smsChannelConfig,
    message: messageAdapter,
  });
}

export default class SmsChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering SMS channel extension");

    const endpoint = context.secrets("SMS_ENDPOINT");
    if (!endpoint) {
      context.logger.warn("SMS_ENDPOINT not found in environment");
    }

    const plugin = createSmsChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("SMS channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(SMS_CHANNEL_ID);
    console.log("Unregistered SMS channel extension");
  }
}

export { createSmsChannel };
export type {
  SmsChannelConfig,
  SmsChannel,
  SmsSendResult,
  SmsSendOptions,
  SmsTransport,
} from "./api.js";
