/**
 * Signal 内置渠道插件
 *
 * 基于 signal-cli-rest-api 实现 Signal 消息收发：
 * - 通过 signal-cli REST API 发送加密消息
 * - 支持 Webhook 接收入站消息
 * - 需要本地或远程运行 signal-cli-rest-api 服务
 *
 * 参考 OpenClaw extensions/signal 的 API 模式。
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

export const SIGNAL_CHANNEL_ID = "signal" as ChannelId;

/** signal-cli-rest-api 默认端点 */
const SIGNAL_CLI_DEFAULT_URL = "http://localhost:8080";
/** Signal 单条消息文本上限（signal-cli 建议） */
const SIGNAL_TEXT_LIMIT = 2000;

interface SignalAccountConfig {
  /** signal-cli-rest-api 服务地址 */
  serviceUrl: string;
  /** Signal 电话号码（带国家代码，如 +1234567890） */
  phoneNumber: string;
  /** API 访问令牌（如果 signal-cli 配置了认证） */
  apiToken?: string;
}

export interface SignalWebhookResult {
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

/** 构建带认证的请求头 */
function buildHeaders(account: SignalAccountConfig): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (account.apiToken) {
    headers.Authorization = `Bearer ${account.apiToken}`;
  }
  return headers;
}

export function createSignalChannelPlugin(): ChannelPlugin {
  const signalMeta: ChannelMeta = {
    id: SIGNAL_CHANNEL_ID,
    label: "Signal",
    selectionLabel: "Signal",
    blurb: "Signal 加密消息通道（基于 signal-cli-rest-api）",
    docsPath: "/channels/signal",
    aliases: ["signal"],
    markdownCapable: false,
  };

  const signalCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    mentions: false,
    voice: false,
    video: false,
    typing: false,
  };

  const signalConfig: ChannelConfigAdapter<SignalAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const sigConfig = config.signal as Record<string, unknown> | undefined;
      if (sigConfig && sigConfig.serviceUrl && sigConfig.phoneNumber) {
        return [SIGNAL_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (
      config: AppConfig,
      accountId: ChannelId,
    ): SignalAccountConfig | null => {
      if (accountId !== SIGNAL_CHANNEL_ID) return null;
      const sigConfig = config.signal as Record<string, unknown> | undefined;
      if (sigConfig && sigConfig.serviceUrl && sigConfig.phoneNumber) {
        return {
          serviceUrl: String(sigConfig.serviceUrl),
          phoneNumber: String(sigConfig.phoneNumber),
          apiToken: sigConfig.apiToken as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: SignalAccountConfig): boolean => {
      return !!account.serviceUrl && !!account.phoneNumber;
    },
    isConfigured: (account: SignalAccountConfig): boolean => {
      return !!account.serviceUrl && !!account.phoneNumber;
    },
  };

  const signalMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = signalConfig.resolveAccount(
          { signal: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Signal account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const recipient = ctx.to;
          if (!recipient) {
            return { success: false, error: "Signal recipient not provided" };
          }

          // signal-cli v2 API: POST /v2/send
          const body: Record<string, unknown> = {
            number: account.phoneNumber,
            recipients: [recipient],
            message: text.length > SIGNAL_TEXT_LIMIT
              ? text.slice(0, SIGNAL_TEXT_LIMIT - 3) + "..."
              : text,
          };

          // 群组消息：以 group: 前缀标识
          if (recipient.startsWith("group.")) {
            body.recipients = [recipient];
          }

          const response = await fetch(
            `${account.serviceUrl}/v2/send`,
            {
              method: "POST",
              headers: buildHeaders(account),
              body: JSON.stringify(body),
            },
          );

          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            return {
              success: true,
              messageId: data.id || `signal-${Date.now()}`,
            };
          }
          const errorText = await response.text();
          return {
            success: false,
            error: `Signal send failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
          };
        } catch (error) {
          return {
            success: false,
            error: `Signal send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: SIGNAL_CHANNEL_ID,
    meta: signalMeta,
    capabilities: signalCapabilities,
    config: signalConfig,
    message: signalMessageAdapter,
  });
}

/**
 * 解析 signal-cli-rest-api Webhook 收到的入站消息。
 *
 * signal-cli 在收到消息时会向配置的 Webhook URL POST JSON 载荷。
 */
export function parseSignalWebhook(body: unknown): SignalWebhookResult {
  const data = body as Record<string, unknown>;
  if (!data || typeof data !== "object") {
    return { success: false, error: "Invalid Signal webhook payload" };
  }

  const envelope = (data.envelope as Record<string, unknown> | undefined) ?? data;
  const dataMsg = envelope.data as Record<string, unknown> | undefined;
  const syncMsg = envelope.sync_message as Record<string, unknown> | undefined;
  const syncSent = syncMsg?.sent as Record<string, unknown> | undefined;

  const messageSource = (dataMsg ?? syncSent?.message) as Record<string, unknown> | undefined;
  if (!messageSource) {
    return { success: false, error: "No message data in Signal envelope" };
  }

  const text = String(messageSource.message || "");
  if (!text) {
    return { success: false, error: "Empty message text" };
  }

  const sourceNumber = String(envelope.source || dataMsg?.source || syncSent?.destination || "");
  const isGroup = !!(envelope.source_uuid && String(envelope.source_uuid).includes("group"))
    || !!(messageSource.group_v2 || messageSource.groupV2);

  return {
    success: true,
    type: "message",
    message: {
      channelId: String(envelope.source_uuid || sourceNumber || ""),
      userId: sourceNumber,
      messageId: String(envelope.timestamp || Date.now()) + "-" + sourceNumber,
      text,
      timestamp: Number(envelope.timestamp || Date.now()),
      chatType: isGroup ? "group" : "direct",
    },
  };
}

/**
 * 通过 signal-cli REST API 注册 Webhook。
 *
 * @param account      账户配置
 * @param webhookUrl   Webhook 回调地址
 */
export async function registerSignalWebhook(
  account: SignalAccountConfig,
  webhookUrl: string,
): Promise<boolean> {
  const body: Record<string, unknown> = {
    url: webhookUrl,
  };

  const response = await fetch(
    `${account.serviceUrl}/v1/register/${encodeURIComponent(account.phoneNumber)}`,
    {
      method: "POST",
      headers: buildHeaders(account),
      body: JSON.stringify(body),
    },
  );

  return response.ok;
}
