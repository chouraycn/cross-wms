// @ts-nocheck

/**
 * IRC 渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 IRC 渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/irc 的架构模式。
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
import { createIrcChannel, type IrcChannelConfig } from "./api.js";

export const IRC_CHANNEL_ID = "irc" as ChannelId;

interface IrcAccountConfig extends IrcChannelConfig {}

const manifest: ExtensionManifest = {
  id: "irc",
  name: "IRC Channel",
  description: "IRC (Internet Relay Chat) channel extension",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

const ircChannelMeta: ChannelMeta = {
  id: IRC_CHANNEL_ID,
  label: "IRC",
  selectionLabel: "IRC (Internet Relay Chat)",
  blurb: "IRC 经典互联网中继聊天协议，支持频道和私信",
  docsPath: "/channels/irc",
  aliases: ["irc"],
  markdownCapable: false,
};

const ircChannelCapabilities: ChannelCapabilities = {
  chatTypes: ["direct", "group"],
  media: false,
  reactions: false,
  threads: false,
  polls: false,
  mentions: true,
  voice: false,
  video: false,
  typing: false,
};

const ircChannelConfig: ChannelConfigAdapter<IrcAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const ircConfig = config.irc as Record<string, unknown> | undefined;
    if (ircConfig && ircConfig.host && ircConfig.nick) {
      return [IRC_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): IrcAccountConfig | null => {
    if (accountId !== IRC_CHANNEL_ID) return null;
    const ircConfig = config.irc as Record<string, unknown> | undefined;
    if (ircConfig && ircConfig.host && ircConfig.nick) {
      return {
        host: String(ircConfig.host),
        port: ircConfig.port as number | undefined,
        tls: ircConfig.tls as boolean | undefined,
        nick: String(ircConfig.nick),
        user: ircConfig.user as string | undefined,
        realName: ircConfig.realName as string | undefined,
        password: ircConfig.password as string | undefined,
        channels: ircConfig.channels as string[] | undefined,
        connectTimeout: ircConfig.connectTimeout as number | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: IrcAccountConfig): boolean => {
    return !!account.host && !!account.nick;
  },
  isConfigured: (account: IrcAccountConfig): boolean => {
    return !!account.host && !!account.nick;
  },
};

function createIrcChannelPlugin(): ChannelPlugin<IrcAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = ircChannelConfig.resolveAccount(
          { irc: { host: process.env.IRC_HOST, nick: process.env.IRC_NICK } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "IRC account not configured" };
        }

        try {
          const irc = createIrcChannel(account);
          await irc.connect();
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          irc.send(ctx.to, text);

          setTimeout(() => {
            irc.disconnect().catch(() => {});
          }, 1000);

          return { success: true, messageId: `${ctx.to}-${Date.now()}` };
        } catch (error) {
          return {
            success: false,
            error: `IRC send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: IRC_CHANNEL_ID,
    meta: ircChannelMeta,
    capabilities: ircChannelCapabilities,
    config: ircChannelConfig,
    message: messageAdapter,
  });
}

export default class IrcChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering IRC channel extension");

    const host = context.secrets("IRC_HOST");
    const nick = context.secrets("IRC_NICK");
    if (!host || !nick) {
      context.logger.warn("IRC_HOST / IRC_NICK not found in environment");
    }

    const plugin = createIrcChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("IRC channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(IRC_CHANNEL_ID);
    console.log("Unregistered IRC channel extension");
  }
}

export { createIrcChannel };
export type {
  IrcChannelConfig,
  IrcChannel,
  IrcMessageEvent,
} from "./api.js";
