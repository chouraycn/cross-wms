/**
 * SMS（Twilio）内置渠道插件
 *
 * 基于 Twilio SMS API 实现短信收发：
 * - 通过 Twilio REST API 发送 SMS
 * - 支持 Webhook 接收入站短信
 * - 使用 Basic Auth（Account SID + Auth Token）认证
 *
 * 参考 OpenClaw extensions/sms 的 API 模式。
 */
import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
} from "./types.js";
import type { MessageSendContext, ChannelMessageSendResult } from "./message/types.js";
import { createBuiltinChannelPlugin } from "./builtin.js";
import type { ChannelPlugin } from "./plugin.js";

export const SMS_CHANNEL_ID = "sms" as ChannelId;

/** Twilio API 端点 */
const TWILIO_API_BASE = "https://api.twilio.com";
/** Twilio API 版本 */
const TWILIO_API_VERSION = "2010-04-01";
/** SMS 单条消息文本上限（GSM 7-bit 编码） */
const SMS_TEXT_LIMIT = 1600;

interface SmsAccountConfig {
  /** Twilio Account SID */
  accountSid: string;
  /** Twilio Auth Token */
  authToken: string;
  /** 发送方号码（Twilio 电话号码） */
  fromNumber?: string;
  /** Messaging Service SID（替代 fromNumber） */
  messagingServiceSid?: string;
}

export interface SmsWebhookResult {
  success: boolean;
  type?: string;
  message?: {
    channelId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct" | "group";
  };
  error?: string;
}

/** 构建 Twilio Basic Auth 头 */
function buildAuthHeader(account: SmsAccountConfig): string {
  const credentials = `${account.accountSid}:${account.authToken}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

/** 构建 Twilio API 端点 URL */
function buildTwilioUrl(account: SmsAccountConfig, suffix: string): string {
  return `${TWILIO_API_BASE}/${TWILIO_API_VERSION}/Accounts/${account.accountSid}/${suffix}`;
}

export function createSmsChannelPlugin(): ChannelPlugin {
  const smsMeta: ChannelMeta = {
    id: SMS_CHANNEL_ID,
    label: "SMS",
    selectionLabel: "SMS (Twilio)",
    blurb: "Twilio SMS 短信消息通道",
    docsPath: "/channels/sms",
    aliases: ["sms", "twilio", "text"],
    markdownCapable: false,
  };

  const smsCapabilities: ChannelCapabilities = {
    chatTypes: ["direct"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    mentions: false,
    voice: false,
    video: false,
    typing: false,
  };

  const smsConfig: ChannelConfigAdapter<SmsAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const smsCfg = config.sms as Record<string, unknown> | undefined;
      if (smsCfg && smsCfg.accountSid && smsCfg.authToken) {
        return [SMS_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (
      config: AppConfig,
      accountId: ChannelId,
    ): SmsAccountConfig | null => {
      if (accountId !== SMS_CHANNEL_ID) return null;
      const smsCfg = config.sms as Record<string, unknown> | undefined;
      if (smsCfg && smsCfg.accountSid && smsCfg.authToken) {
        return {
          accountSid: String(smsCfg.accountSid),
          authToken: String(smsCfg.authToken),
          fromNumber: smsCfg.fromNumber as string | undefined,
          messagingServiceSid: smsCfg.messagingServiceSid as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: SmsAccountConfig): boolean => {
      return !!account.accountSid && !!account.authToken;
    },
    isConfigured: (account: SmsAccountConfig): boolean => {
      return !!account.accountSid && !!account.authToken;
    },
  };

  const smsMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = smsConfig.resolveAccount(
          { sms: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Twilio account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const to = ctx.to;
          if (!to) {
            return { success: false, error: "SMS recipient number not provided" };
          }

          // 发送方：优先使用 metadata 中的 from，然后是 messagingServiceSid，最后是 fromNumber
          const from = (ctx.metadata?.from as string | undefined) || account.fromNumber;
          const messagingServiceSid =
            (ctx.metadata?.messagingServiceSid as string | undefined) ||
            account.messagingServiceSid;

          if (!from && !messagingServiceSid) {
            return {
              success: false,
              error: "SMS sender not configured (need fromNumber or messagingServiceSid)",
            };
          }

          const params = new URLSearchParams({
            To: to,
            Body: text.length > SMS_TEXT_LIMIT
              ? text.slice(0, SMS_TEXT_LIMIT - 3) + "..."
              : text,
          });

          if (messagingServiceSid) {
            params.set("MessagingServiceSid", messagingServiceSid);
          } else if (from) {
            params.set("From", from);
          }

          const response = await fetch(buildTwilioUrl(account, "Messages.json"), {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: buildAuthHeader(account),
            },
            body: params,
          });

          if (response.ok) {
            const data = (await response.json()) as { sid?: string };
            return {
              success: true,
              messageId: data.sid || `sms-${Date.now()}`,
            };
          }
          const errorText = await response.text();
          return {
            success: false,
            error: `SMS send failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
          };
        } catch (error) {
          return {
            success: false,
            error: `SMS send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: SMS_CHANNEL_ID,
    meta: smsMeta,
    capabilities: smsCapabilities,
    config: smsConfig,
    message: smsMessageAdapter,
  });
}

/**
 * 解析 Twilio SMS Webhook 收到的入站短信。
 *
 * Twilio 在收到短信时会向配置的 Webhook URL POST form-encoded 数据。
 * 此函数接受已解析为对象的数据（键值对）。
 */
export function parseSmsWebhook(body: unknown): SmsWebhookResult {
  const data = body as Record<string, unknown>;
  if (!data || typeof data !== "object") {
    return { success: false, error: "Invalid SMS webhook payload" };
  }

  const text = String(data.Body || data.body || "");
  if (!text) {
    return { success: false, error: "Empty message body" };
  }

  const from = String(data.From || data.from || "");
  const to = String(data.To || data.to || "");
  const messageId = String(data.MessageSid || data.messageSid || "");

  return {
    success: true,
    type: "message",
    message: {
      channelId: from,
      userId: from,
      messageId,
      text,
      timestamp: Date.now(),
      chatType: "direct",
    },
  };
}
