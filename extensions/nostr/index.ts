/**
 * Nostr 渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 Nostr 渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/nostr 的架构模式。
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
import { createNostrChannel, type NostrConfig } from "./api.js";

export const NOSTR_CHANNEL_ID = "nostr" as ChannelId;

interface NostrAccountConfig extends NostrConfig {}

const manifest: ExtensionManifest = {
  id: "nostr",
  name: "Nostr Channel",
  description: "Nostr decentralized protocol channel extension (Notes and Other Stuff Transmitted by Relays)",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

const nostrChannelMeta: ChannelMeta = {
  id: NOSTR_CHANNEL_ID,
  label: "Nostr",
  selectionLabel: "Nostr (Decentralized)",
  blurb: "Nostr 去中心化通信协议，通过中继器传输笔记和其他内容",
  docsPath: "/channels/nostr",
  aliases: ["nostr"],
  markdownCapable: false,
};

const nostrChannelCapabilities: ChannelCapabilities = {
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

const nostrChannelConfig: ChannelConfigAdapter<NostrAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const nostrConfig = config.nostr as Record<string, unknown> | undefined;
    if (nostrConfig && nostrConfig.privateKey) {
      return [NOSTR_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): NostrAccountConfig | null => {
    if (accountId !== NOSTR_CHANNEL_ID) return null;
    const nostrConfig = config.nostr as Record<string, unknown> | undefined;
    if (nostrConfig && nostrConfig.privateKey) {
      return {
        privateKey: String(nostrConfig.privateKey),
        publicKey: nostrConfig.publicKey as string | undefined,
        relays: nostrConfig.relays as string[] | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: NostrAccountConfig): boolean => {
    return !!account.privateKey;
  },
  isConfigured: (account: NostrAccountConfig): boolean => {
    return !!account.privateKey;
  },
};

function createNostrChannelPlugin(): ChannelPlugin<NostrAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = nostrChannelConfig.resolveAccount(
          { nostr: { privateKey: process.env.NOSTR_PRIVATE_KEY } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Nostr account not configured" };
        }

        try {
          const nostr = createNostrChannel(account);
          await nostr.connect();
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const isDirect = ctx.to.startsWith("npub") || ctx.to.length === 64;
          let messageId: string;
          if (isDirect) {
            messageId = await nostr.publishDirectMessage(ctx.to, text);
          } else {
            messageId = await nostr.publishNote(text);
          }

          nostr.disconnect();

          return { success: true, messageId };
        } catch (error) {
          return {
            success: false,
            error: `Nostr send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: NOSTR_CHANNEL_ID,
    meta: nostrChannelMeta,
    capabilities: nostrChannelCapabilities,
    config: nostrChannelConfig,
    message: messageAdapter,
  });
}

export default class NostrChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering Nostr channel extension");

    const privateKey = context.secrets("NOSTR_PRIVATE_KEY");
    if (!privateKey) {
      context.logger.warn("NOSTR_PRIVATE_KEY not found in environment");
    }

    const plugin = createNostrChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("Nostr channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(NOSTR_CHANNEL_ID);
    console.log("Unregistered Nostr channel extension");
  }
}

export { createNostrChannel };
export type {
  NostrConfig,
  NostrChannel,
  NostrEvent,
  NostrMessage,
} from "./api.js";
