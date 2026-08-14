/**
 * 微信公众号（Official Account）渠道扩展入口
 *
 * 官方 API：https://developers.weixin.qq.com/doc/offiaccount/
 * - 发消息：cgi-bin/message/custom/send（客服消息）+ cgi-bin/message/template/send（模板消息）
 * - 回调：signature 验签（明文/安全模式）+ AES-256-CBC 解密（EncodingAESKey）
 */
import type {
  ExtensionProvider,
  ExtensionContext,
  ExtensionManifest,
} from "../extension-types.js";
import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
} from "../../server/channels/types.js";
import type { ChannelPlugin } from "../../server/channels/plugin.js";
import type { MessageSendContext, ChannelMessageSendResult } from "../../server/channels/message/types.js";
import { getGlobalChannelRegistry } from "../../server/channels/registry.js";
import { sendWeChatCustomerMessage } from "./src/send.js";
import { probeWeChat } from "./src/probe.js";
import { handleWeChatCallback } from "./src/callback.js";
import type { WeChatAccountConfig, WeChatProbeResult, WeChatWebhookResult } from "./src/types.js";

export const WECHAT_CHANNEL_ID = "wechat" as ChannelId;

const manifest: ExtensionManifest = {
  id: WECHAT_CHANNEL_ID,
  name: "WeChat Channel",
  description: "微信公众号官方 API 渠道扩展（客服消息/模板消息/回调验签+AES 解密）",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

/** 从 AppConfig 中解析公众号账号 */
export function resolveWeChatAccountFromConfig(config: AppConfig, accountId: ChannelId): WeChatAccountConfig | null {
  if (accountId !== WECHAT_CHANNEL_ID) return null;
  const wechatConfig = (config.wechat ?? config.wechat_mp ?? {}) as Record<string, unknown>;
  const appId = String(wechatConfig.appId ?? wechatConfig.app_id ?? "");
  const appSecret = String(wechatConfig.appSecret ?? wechatConfig.app_secret ?? "");
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    token: wechatConfig.token !== undefined ? String(wechatConfig.token) : undefined,
    encodingAesKey: wechatConfig.encodingAesKey !== undefined ? String(wechatConfig.encodingAesKey) : undefined,
    accessToken: wechatConfig.accessToken !== undefined ? String(wechatConfig.accessToken) : undefined,
    accessTokenExpiresAt:
      wechatConfig.accessTokenExpiresAt !== undefined ? Number(wechatConfig.accessTokenExpiresAt) : undefined,
  };
}

export function createWeChatChannelPlugin(): ChannelPlugin<WeChatAccountConfig, WeChatProbeResult> {
  const wechatChannelMeta: ChannelMeta = {
    id: WECHAT_CHANNEL_ID,
    label: "微信",
    selectionLabel: "微信公众号",
    blurb: "微信公众号官方 API 渠道（客服消息/模板消息/回调）",
    docsPath: "/channels/wechat",
    aliases: ["wechat", "weixin", "mp", "公众号"],
    markdownCapable: true,
  };

  const wechatChannelCapabilities: ChannelCapabilities = {
    chatTypes: ["direct"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    mentions: false,
    voice: true,
    video: false,
    typing: false,
  };

  const wechatChannelConfig: ChannelConfigAdapter<WeChatAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const cfg = (config.wechat ?? config.wechat_mp ?? {}) as Record<string, unknown>;
      return cfg.appId || cfg.app_id ? [WECHAT_CHANNEL_ID] : [];
    },
    resolveAccount: resolveWeChatAccountFromConfig,
    isEnabled: (account: WeChatAccountConfig): boolean => !!account.appId && !!account.appSecret,
    isConfigured: (account: WeChatAccountConfig): boolean => !!account.appId && !!account.appSecret,
  };

  const wechatChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        // 注：ChannelMessageSendContext 不含 AppConfig，DB 绑定配置由
        // deliverToChannel 等调用方解析后直调 sendWeChatCustomerMessage。
        return { success: false, error: "公众号账号配置需经 deliverToChannel 注入（见 extensions/wechat/src/send.ts）" };
      },
    },
  };

  return {
    id: WECHAT_CHANNEL_ID,
    meta: wechatChannelMeta,
    capabilities: wechatChannelCapabilities,
    config: wechatChannelConfig,
    message: wechatChannelMessageAdapter,
    status: {
      probe: async (account: WeChatAccountConfig): Promise<WeChatProbeResult> => probeWeChat(account),
    },
  };
}

export { handleWeChatCallback, parseWeChatDecrypted } from "./src/callback.js";
export { sendWeChatCustomerMessage, sendWeChatTemplateMessage } from "./src/send.js";
export { probeWeChat } from "./src/probe.js";
export {
  verifyWeChatSignature,
  decryptWeChatMessage,
  encryptWeChatMessage,
  verifyAndDecryptWeChatCallback,
} from "./src/crypto.js";
export type {
  WeChatAccountConfig,
  WeChatMsgType,
  WeChatSendResult,
  WeChatProbeResult,
  WeChatWebhookResult,
  WeChatMessageInfo,
} from "./src/types.js";

export default class WeChatChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering WeChat channel extension");

    const appId = context.secrets("WECHAT_APP_ID");
    const appSecret = context.secrets("WECHAT_APP_SECRET");
    if (!appId || !appSecret) {
      context.logger.warn("WECHAT_APP_ID / WECHAT_APP_SECRET not found in environment");
    }

    const plugin = createWeChatChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);
    context.logger.info("WeChat channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(WECHAT_CHANNEL_ID);
    console.log("Unregistered WeChat channel extension");
  }
}
