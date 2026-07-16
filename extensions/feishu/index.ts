// Feishu plugin entrypoint registers its cross-wms integration.
import type { ChannelPlugin, ChannelId, ChannelMeta, ChannelCapabilities, ChannelConfigAdapter, AppConfig } from "../../server/channels/types.js";
import type { ChannelMessageSendResult, MessageSendContext } from "../../server/channels/message/types.js";
import { createFeishuClient, clearClientCache } from "./src/client.js";
import { probeFeishu, type ProbeFeishuOptions } from "./src/probe.js";
import { sendMessageFeishu, sendMarkdownCardFeishu, sendStructuredCardFeishu, sendMediaFeishu, editMessageFeishu, buildMarkdownCard, buildStructuredCard } from "./src/send.js";
import { addTypingIndicator, removeTypingIndicator, type TypingIndicatorState, isFeishuBackoffError, FeishuBackoffError } from "./src/typing.js";
import { parsePostContent } from "./src/post.js";
import { createPinFeishu, removePinFeishu, listPinsFeishu } from "./src/pins.js";
import type { FeishuConfig, FeishuDomain, ResolvedFeishuAccount, FeishuChatType, FeishuMessageInfo, FeishuSendResult, FeishuMediaInfo, FeishuToolsConfig, FeishuProbeResult, FeishuMessageContext } from "./src/types.js";
import { isFeishuGroupChatType } from "./src/types.js";
import { handleFeishuMessage, parseFeishuMessageEvent, buildFeishuAgentBody, resolveGroupName, clearGroupNameCache, resolveBroadcastAgents, buildBroadcastSessionKey, toMessageResourceType } from "./src/bot.js";
import { getChatInfo, getChatMembers, getFeishuMemberInfo } from "./src/chat.js";
import { saveMessageResourceFeishu, uploadImageFeishu, uploadFileFeishu, sendImageFeishu, sendFileFeishu, sendMediaFeishu as sendMediaFeishuFull, detectFileType, sanitizeFileNameForUpload } from "./src/media.js";
import { resolveFeishuDmIngressAccess, resolveFeishuGroupConversationIngressAccess, resolveFeishuGroupSenderActivationIngressAccess, resolveFeishuGroupConfig, hasExplicitFeishuGroupConfig, resolveFeishuGroupToolPolicy, resolveFeishuReplyPolicy, normalizeFeishuAllowEntry } from "./src/policy.js";
import { probeFeishu as probeFeishuHealth } from "./src/probe.js";
import { runFeishuDoctorSequence, inspectFeishuDoctorState, feishuDoctor, type FeishuDoctorInspection, type FeishuDoctorRepairReport } from "./src/doctor.js";
import { claimUnprocessedFeishuMessage, finalizeFeishuMessageProcessing, recordProcessedFeishuMessage, forgetProcessedFeishuMessage, hasProcessedFeishuMessage, tryRecordMessagePersistent, warmupDedupFromPluginState, testing as dedupTesting } from "./src/dedup.js";
import { registerFeishuDocTools } from "./src/docx.js";
import { registerFeishuChatTools } from "./src/chat.js";
import { registerFeishuWikiTools } from "./src/wiki.js";
import { registerFeishuDriveTools, deliverCommentThreadText } from "./src/drive.js";
import { registerFeishuPermTools } from "./src/perm.js";

export const FEISHU_CHANNEL_ID = "feishu" as ChannelId;

export interface FeishuAccountConfig {
  appId: string;
  appSecret: string;
  tenantAccessToken?: string;
  accessTokenExpiresAt?: number;
  verificationToken?: string;
  encryptKey?: string;
  domain?: FeishuDomain;
  mediaMaxMb?: number;
  httpTimeoutMs?: number;
  resolveSenderNames?: boolean;
  dmPolicy?: "open" | "pairing" | "allowlist" | "disabled";
  groupPolicy?: "open" | "allowlist" | "disabled" | "allowall";
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  groupSenderAllowFrom?: Array<string | number>;
  requireMention?: boolean;
  historyLimit?: number;
  tools?: FeishuToolsConfig;
  replyInThread?: "enabled" | "disabled";
  groups?: Record<string, Partial<FeishuConfig>>;
}

/** 飞书 webhook 事件解析结果 */
export interface FeishuWebhookResult {
  success: boolean;
  type?: string;
  message?: {
    chatId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct" | "group";
  };
  error?: string;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getTenantAccessToken(account: FeishuAccountConfig): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const domain = account.domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
  const response = await fetch(`${domain}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: account.appId,
      app_secret: account.appSecret,
    }),
  });

  const data = await response.json();
  if (data.code === 0 && data.tenant_access_token) {
    cachedAccessToken = data.tenant_access_token;
    tokenExpiresAt = now + (data.expire - 60) * 1000;
    return cachedAccessToken!;
  }
  throw new Error(`Feishu auth failed: ${data.msg || "Unknown error"}`);
}

export function createFeishuChannelPlugin(): ChannelPlugin {
  const feishuChannelMeta: ChannelMeta = {
    id: FEISHU_CHANNEL_ID,
    label: "飞书",
    selectionLabel: "飞书",
    blurb: "飞书机器人消息通道（完整版：含文档/知识库/云盘/权限等 16 个子模块）",
    docsPath: "/channels/feishu",
    aliases: ["feishu", "lark"],
    markdownCapable: true,
  };

  const feishuChannelCapabilities: ChannelCapabilities = {
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

  const feishuChannelConfig: ChannelConfigAdapter<FeishuAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const feishuConfig = config.feishu as Record<string, unknown>;
      if (feishuConfig && feishuConfig.appId && feishuConfig.appSecret) {
        return [FEISHU_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): FeishuAccountConfig | null => {
      if (accountId !== FEISHU_CHANNEL_ID) return null;
      const feishuConfig = config.feishu as Record<string, unknown>;
      if (feishuConfig && feishuConfig.appId && feishuConfig.appSecret) {
        return {
          appId: String(feishuConfig.appId),
          appSecret: String(feishuConfig.appSecret),
          tenantAccessToken: feishuConfig.tenantAccessToken as string | undefined,
          accessTokenExpiresAt: feishuConfig.accessTokenExpiresAt as number | undefined,
          verificationToken: feishuConfig.verificationToken as string | undefined,
          encryptKey: feishuConfig.encryptKey as string | undefined,
          domain: (feishuConfig.domain as FeishuDomain) ?? undefined,
          mediaMaxMb: feishuConfig.mediaMaxMb as number | undefined,
          httpTimeoutMs: feishuConfig.httpTimeoutMs as number | undefined,
          resolveSenderNames: feishuConfig.resolveSenderNames as boolean | undefined,
          dmPolicy: feishuConfig.dmPolicy as FeishuAccountConfig["dmPolicy"] | undefined,
          groupPolicy: feishuConfig.groupPolicy as FeishuAccountConfig["groupPolicy"] | undefined,
          allowFrom: feishuConfig.allowFrom as Array<string | number> | undefined,
          groupAllowFrom: feishuConfig.groupAllowFrom as Array<string | number> | undefined,
          groupSenderAllowFrom: feishuConfig.groupSenderAllowFrom as Array<string | number> | undefined,
          requireMention: feishuConfig.requireMention as boolean | undefined,
          historyLimit: feishuConfig.historyLimit as number | undefined,
          tools: feishuConfig.tools as FeishuToolsConfig | undefined,
          replyInThread: feishuConfig.replyInThread as "enabled" | "disabled" | undefined,
          groups: feishuConfig.groups as Record<string, Partial<FeishuConfig>> | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: FeishuAccountConfig): boolean => {
      return !!account.appId && !!account.appSecret;
    },
    isConfigured: (account: FeishuAccountConfig): boolean => {
      return !!account.appId && !!account.appSecret;
    },
  };

  const feishuChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = feishuChannelConfig.resolveAccount(
          { feishu: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Feishu account not configured" };
        }

        try {
          const token = await getTenantAccessToken(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const cfg = { feishu: account } as unknown as import("./src/types.js").FeishuConfig & { feishu: FeishuAccountConfig };

          const sendResult = await sendMessageFeishu({
            cfg: cfg as any,
            to: ctx.to.startsWith("chat:") || ctx.to.startsWith("user:") ? ctx.to : `chat:${ctx.to}`,
            text,
            accountId: account.appId,
          });

          return { success: true, messageId: sendResult.messageId };
        } catch (error) {
          return {
            success: false,
            error: `Feishu send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return {
    id: FEISHU_CHANNEL_ID,
    meta: feishuChannelMeta,
    capabilities: feishuChannelCapabilities,
    config: feishuChannelConfig,
    message: feishuChannelMessageAdapter,
    status: {
      probe: async (account: FeishuAccountConfig, _config: AppConfig) => {
        return probeFeishu(account);
      },
    },
  };
}

/**
 * 解析飞书 webhook 事件（独立函数，供 webhook 路由调用）
 */
export function parseFeishuWebhook(body: unknown, account: FeishuAccountConfig): FeishuWebhookResult {
  const data = body as Record<string, unknown>;

  // 验证 verificationToken
  if (account.verificationToken) {
    const token = data.token as string;
    if (token !== account.verificationToken) {
      return { success: false, error: "Invalid verification token" };
    }
  }

  // URL 验证挑战
  if (data.type === "url_verification" && data.challenge) {
    return { success: true, type: "url_verification" };
  }

  const type = String(data.type || "");
  const event = data.event as Record<string, unknown>;

  if (type === "message" && event) {
    const message = event.message as Record<string, unknown>;
    const sender = event.sender as Record<string, unknown>;
    const chat = event.chat as Record<string, unknown>;

    if (!message) return { success: false, error: "Missing message field" };

    let text = "";
    try {
      const content = String(message.content || "");
      text = JSON.parse(content).text || "";
    } catch {
      text = String(message.content || "");
    }

    return {
      success: true,
      type: "message",
      message: {
        chatId: String(chat?.chat_id || ""),
        userId: (() => {
          const senderId = sender?.sender_id as Record<string, unknown> || {};
          return String(senderId.user_id || senderId.open_id || "");
        })(),
        messageId: String(message.message_id || ""),
        text,
        timestamp: Number(message.create_time) * 1000,
        chatType: String(chat?.chat_type || "") === "p2p" ? "direct" : "group",
      },
    };
  }

  return { success: false, error: `Unsupported event type: ${type}` };
}

// Re-export all sub-module public APIs
export {
  // Client
  createFeishuClient,
  clearClientCache,
  createFeishuWSClient,
  createEventDispatcher,
  FEISHU_HTTP_TIMEOUT_ENV_VAR,
  FEISHU_HTTP_TIMEOUT_MAX_MS,
  FEISHU_HTTP_TIMEOUT_MS,
  getFeishuUserAgent,
  pluginVersion,
  type FeishuClientCredentials,
  type FeishuWsClientCallbacks,
} from "./src/client.js";

export {
  // Bot
  handleFeishuMessage,
  parseFeishuMessageEvent,
  buildFeishuAgentBody,
  resolveGroupName,
  clearGroupNameCache,
  resolveBroadcastAgents,
  buildBroadcastSessionKey,
  toMessageResourceType,
  type FeishuBotAddedEvent,
  type FeishuMessageEvent,
} from "./src/bot.js";

export {
  // Chat
  getChatInfo,
  getChatMembers,
  getFeishuMemberInfo,
  registerFeishuChatTools,
} from "./src/chat.js";

export {
  // Send
  sendMessageFeishu,
  sendCardFeishu,
  sendMarkdownCardFeishu,
  sendStructuredCardFeishu,
  editMessageFeishu,
  buildMarkdownCard,
  buildStructuredCard,
  buildFeishuPostMessagePayload,
  type SendFeishuMessageParams,
  type SendFeishuCardParams,
  type CardHeaderConfig,
} from "./src/send.js";

export {
  // Media
  saveMessageResourceFeishu,
  uploadImageFeishu,
  uploadFileFeishu,
  sendImageFeishu,
  sendFileFeishu,
  sendMediaFeishu,
  detectFileType,
  sanitizeFileNameForUpload,
  shouldSuppressFeishuTextForVoiceMedia,
  type SaveMessageResourceResult,
  type UploadImageResult,
  type UploadFileResult,
  type SendMediaResult,
} from "./src/media.js";

export {
  // Perm
  registerFeishuPermTools,
} from "./src/perm.js";

export {
  // Policy
  resolveFeishuDmIngressAccess,
  resolveFeishuGroupConversationIngressAccess,
  resolveFeishuGroupSenderActivationIngressAccess,
  resolveFeishuGroupConfig,
  hasExplicitFeishuGroupConfig,
  resolveFeishuGroupToolPolicy,
  resolveFeishuReplyPolicy,
  normalizeFeishuAllowEntry,
} from "./src/policy.js";

export {
  // Types
  isFeishuGroupChatType,
  type FeishuConfig,
  type FeishuAccountConfig as FeishuAccountConfigType,
  type FeishuDomain,
  type FeishuDefaultAccountSelectionSource,
  type ResolvedFeishuAccount,
  type FeishuIdType,
  type FeishuMessageContext,
  type FeishuSendResult,
  type FeishuChatType,
  type FeishuMessageInfo,
  type FeishuProbeResult,
  type FeishuMediaInfo,
  type FeishuToolsConfig,
  type DynamicAgentCreationConfig,
} from "./src/types.js";

export {
  // Typing
  addTypingIndicator,
  removeTypingIndicator,
  isFeishuBackoffError,
  FeishuBackoffError,
  type TypingIndicatorState,
} from "./src/typing.js";

export {
  // Probe
  probeFeishu,
  clearProbeCache,
  FEISHU_PROBE_REQUEST_TIMEOUT_MS,
  type ProbeFeishuOptions,
} from "./src/probe.js";

export {
  // Doctor
  runFeishuDoctorSequence,
  inspectFeishuDoctorState,
  feishuDoctor,
  isFeishuSessionStoreKey,
  type FeishuDoctorInspection,
  type FeishuDoctorRepairReport,
} from "./src/doctor.js";

export {
  // Dedup
  claimUnprocessedFeishuMessage,
  finalizeFeishuMessageProcessing,
  recordProcessedFeishuMessage,
  forgetProcessedFeishuMessage,
  hasProcessedFeishuMessage,
  tryRecordMessagePersistent,
  warmupDedupFromPluginState,
  dedupTesting,
} from "./src/dedup.js";

export {
  // Drive
  registerFeishuDriveTools,
  deliverCommentThreadText,
} from "./src/drive.js";

export {
  // Wiki
  registerFeishuWikiTools,
} from "./src/wiki.js";

export {
  // Pins
  createPinFeishu,
  removePinFeishu,
  listPinsFeishu,
} from "./src/pins.js";

export {
  // Docx
  registerFeishuDocTools,
} from "./src/docx.js";

export {
  // Post
  parsePostContent,
} from "./src/post.js";
