/**
 * 企业微信（WeCom）渠道扩展入口
 *
 * 官方 API：https://developer.work.weixin.qq.com
 * - 发消息：cgi-bin/message/send（自建应用）+ cgi-bin/webhook/send（群机器人）
 * - 回调：msg_signature 校验 + AES-256-CBC 解密（EncodingAESKey）
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
import { sendWeComMessage, sendWeComWebhook } from "./src/send.js";
import { probeWeCom } from "./src/probe.js";
import { handleWeComCallback } from "./src/callback.js";
import type { WeComAccountConfig, WeComProbeResult, WeComWebhookResult } from "./src/types.js";

export const WECOM_CHANNEL_ID = "wecom" as ChannelId;

const manifest: ExtensionManifest = {
  id: WECOM_CHANNEL_ID,
  name: "WeCom Channel",
  description: "企业微信官方 API 渠道扩展（自建应用消息/群机器人 webhook/回调验签+AES 解密）",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

/** 从 AppConfig 中解析企业微信账号 */
export function resolveWeComAccountFromConfig(config: AppConfig, accountId: ChannelId): WeComAccountConfig | null {
  if (accountId !== WECOM_CHANNEL_ID) return null;
  const wecomConfig = (config.wecom ?? config.wecom_channels ?? {}) as Record<string, unknown>;
  const corpId = String(wecomConfig.corpId ?? wecomConfig.corp_id ?? "");
  const corpSecret = String(wecomConfig.corpSecret ?? wecomConfig.corp_secret ?? "");
  if (!corpId || !corpSecret) return null;
  return {
    corpId,
    corpSecret,
    agentId: wecomConfig.agentId !== undefined ? String(wecomConfig.agentId) : undefined,
    token: wecomConfig.token !== undefined ? String(wecomConfig.token) : undefined,
    encodingAesKey: wecomConfig.encodingAesKey !== undefined ? String(wecomConfig.encodingAesKey) : undefined,
    webhookUrl: wecomConfig.webhookUrl !== undefined ? String(wecomConfig.webhookUrl) : undefined,
    accessToken: wecomConfig.accessToken !== undefined ? String(wecomConfig.accessToken) : undefined,
    accessTokenExpiresAt:
      wecomConfig.accessTokenExpiresAt !== undefined ? Number(wecomConfig.accessTokenExpiresAt) : undefined,
  };
}

export function createWeComChannelPlugin(): ChannelPlugin<WeComAccountConfig, WeComProbeResult> {
  const wecomChannelMeta: ChannelMeta = {
    id: WECOM_CHANNEL_ID,
    label: "企业微信",
    selectionLabel: "企业微信",
    blurb: "企业微信官方 API 渠道（自建应用 + 群机器人 webhook）",
    docsPath: "/channels/wecom",
    aliases: ["wecom", "workweixin", "wxwork", "企业微信"],
    markdownCapable: true,
  };

  const wecomChannelCapabilities: ChannelCapabilities = {
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

  const wecomChannelConfig: ChannelConfigAdapter<WeComAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const cfg = (config.wecom ?? config.wecom_channels ?? {}) as Record<string, unknown>;
      return cfg.corpId || cfg.corp_id ? [WECOM_CHANNEL_ID] : [];
    },
    resolveAccount: resolveWeComAccountFromConfig,
    isEnabled: (account: WeComAccountConfig): boolean => !!account.corpId && !!account.corpSecret,
    isConfigured: (account: WeComAccountConfig): boolean => !!account.corpId && !!account.corpSecret,
  };

  const wecomChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        // 注：ChannelMessageSendContext 不含 AppConfig，DB 绑定配置由
        // deliverToChannel 等调用方解析后直调 sendWeComMessage / sendWeComWebhook。
        // 此适配器保留契约形态，配置缺失时给出明确指引。
        const account = null as WeComAccountConfig | null;
        if (!account) {
          return { success: false, error: "企业微信账号配置需经 deliverToChannel 注入（见 extensions/wecom/src/send.ts）" };
        }
        try {
          const rendered = await ctx.render();
          const text = rendered.parts.map((p: { content: unknown }) => String(p.content)).join("\n");
          if (account.webhookUrl) {
            return await sendWeComWebhook(account.webhookUrl, { msgtype: "text", content: text });
          }
          return await sendWeComMessage({ account, toUser: ctx.to, msgtype: "markdown", markdown: text });
        } catch (error) {
          return {
            success: false,
            error: `企业微信发送失败: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return {
    id: WECOM_CHANNEL_ID,
    meta: wecomChannelMeta,
    capabilities: wecomChannelCapabilities,
    config: wecomChannelConfig,
    message: wecomChannelMessageAdapter,
    status: {
      probe: async (account: WeComAccountConfig): Promise<WeComProbeResult> => probeWeCom(account),
    },
  };
}

export { handleWeComCallback, parseWeComDecrypted } from "./src/callback.js";
export { sendWeComMessage, sendWeComWebhook } from "./src/send.js";
export { probeWeCom } from "./src/probe.js";
export { verifyWeComSignature, decryptWeComMessage, encryptWeComMessage, verifyAndDecryptWeComCallback } from "./src/crypto.js";
export type {
  WeComAccountConfig,
  WeComMsgType,
  WeComSendResult,
  WeComProbeResult,
  WeComWebhookResult,
  WeComMessageInfo,
} from "./src/types.js";

export default class WeComChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering WeCom channel extension");

    const corpId = context.secrets("WECOM_CORP_ID");
    const corpSecret = context.secrets("WECOM_CORP_SECRET");
    if (!corpId || !corpSecret) {
      context.logger.warn("WECOM_CORP_ID / WECOM_CORP_SECRET not found in environment");
    }

    const plugin = createWeComChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);
    context.logger.info("WeCom channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(WECOM_CHANNEL_ID);
    console.log("Unregistered WeCom channel extension");
  }
}
