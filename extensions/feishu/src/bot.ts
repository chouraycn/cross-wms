// Feishu plugin module implements bot behavior for cross-wms.
import type * as Lark from "@larksuiteoapi/node-sdk";
import { createFeishuClient, createFeishuWSClient, createEventDispatcher, clearClientCache } from "./client.js";
import { probeFeishu } from "./probe.js";
import { sendMessageFeishu, sendMarkdownCardFeishu, sendStructuredCardFeishu, editMessageFeishu, buildMarkdownCard, buildStructuredCard, getMessageFeishu, listFeishuThreadMessages } from "./send.js";
import { addTypingIndicator, removeTypingIndicator } from "./typing.js";
import { saveMessageResourceFeishu, uploadImageFeishu, uploadFileFeishu, sendImageFeishu, sendFileFeishu, sendMediaFeishu, detectFileType, sanitizeFileNameForUpload } from "./media.js";
import { getChatInfo, getChatMembers, getFeishuMemberInfo } from "./chat.js";
import { resolveFeishuDmIngressAccess, resolveFeishuGroupConversationIngressAccess, resolveFeishuGroupSenderActivationIngressAccess, resolveFeishuGroupConfig, hasExplicitFeishuGroupConfig, resolveFeishuGroupToolPolicy, resolveFeishuReplyPolicy, normalizeFeishuAllowEntry } from "./policy.js";
import { claimUnprocessedFeishuMessage, finalizeFeishuMessageProcessing, recordProcessedFeishuMessage, forgetProcessedFeishuMessage, hasProcessedFeishuMessage } from "./dedup.js";
import { parsePostContent } from "./post.js";
import { createPinFeishu, removePinFeishu, listPinsFeishu } from "./pins.js";
import { runFeishuDoctorSequence, inspectFeishuDoctorState, feishuDoctor } from "./doctor.js";
import type { FeishuConfig, FeishuChatType, FeishuMessageContext, FeishuSendResult, FeishuMessageInfo, ResolvedFeishuAccount, FeishuDomain, MentionTarget } from "./types.js";

// Group name cache
const groupNameCache = new Map<string, { name: string; expiresAt: number }>();
const GROUP_NAME_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function clearGroupNameCache(chatId?: string): void {
  if (chatId) {
    groupNameCache.delete(chatId);
  } else {
    groupNameCache.clear();
  }
}

export async function resolveGroupName(params: {
  cfg: any; chatId: string; accountId?: string;
}): Promise<string> {
  const { cfg, chatId, accountId } = params;
  const cached = groupNameCache.get(chatId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.name;
  }
  try {
    const feishuCfg = cfg?.feishu ?? cfg;
    const appId = feishuCfg?.appId ?? feishuCfg?.app_id;
    const appSecret = feishuCfg?.appSecret ?? feishuCfg?.app_secret;
    if (!appId || !appSecret) return chatId;
    const client = createFeishuClient({ appId, appSecret, domain: feishuCfg?.domain, accountId });
    const info = await getChatInfo(client, chatId);
    const name = info?.name ?? chatId;
    groupNameCache.set(chatId, { name, expiresAt: Date.now() + GROUP_NAME_CACHE_TTL_MS });
    return name;
  } catch {
    return chatId;
  }
}

export type FeishuBotAddedEvent = {
  chatId: string;
  chatType: FeishuChatType;
  operatorId?: string;
  operatorOpenId?: string;
  timestamp: number;
};

export type FeishuMessageEvent = {
  messageId: string;
  chatId: string;
  chatType: FeishuChatType;
  senderId: string;
  senderOpenId: string;
  senderName?: string;
  content: string;
  contentType: string;
  mentionedBot: boolean;
  hasAnyMention?: boolean;
  rootId?: string;
  parentId?: string;
  threadId?: string;
  createTime: number;
  mentionTargets?: MentionTarget[];
};

export function parseFeishuMessageEvent(event: Record<string, unknown>): FeishuMessageEvent | null {
  const message = event.message as Record<string, unknown> | undefined;
  const sender = event.sender as Record<string, unknown> | undefined;
  const chat = event.chat as Record<string, unknown> | undefined;

  if (!message) return null;

  const messageId = String(message.message_id ?? "");
  const chatId = String(chat?.chat_id ?? message.chat_id ?? "");
  const chatType = String(chat?.chat_type ?? message.chat_type ?? "p2p") as FeishuChatType;

  const senderId = sender?.sender_id as Record<string, unknown> | undefined;
  const senderOpenId = String(senderId?.open_id ?? senderId?.user_id ?? "");
  const senderUserId = String(senderId?.user_id ?? "");

  let content = "";
  let contentType = String(message.msg_type ?? "text");
  try {
    const rawContent = String(message.content ?? "{}");
    const parsed = JSON.parse(rawContent);
    if (contentType === "text") {
      content = parsed.text ?? "";
    } else if (contentType === "post") {
      const postResult = parsePostContent(rawContent);
      content = postResult.textContent;
    } else if (contentType === "interactive") {
      content = "[Interactive Card]";
    } else {
      content = rawContent;
    }
  } catch {
    content = String(message.content ?? "");
  }

  const mentionTargets: MentionTarget[] = [];
  let mentionedBot = false;
  let hasAnyMention = false;
  const mentions = message.mentions as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(mentions)) {
    for (const mention of mentions) {
      const openId = String(mention.id?.open_id ?? mention.open_id ?? "");
      const name = String(mention.name ?? "");
      if (openId) {
        mentionTargets.push({ openId, name });
        hasAnyMention = true;
        const key = String(mention.key ?? "");
        if (content.includes(`@${key}`) || content.includes(`@_user_${openId}`)) {
          mentionedBot = true;
        }
      }
    }
  }

  const rootId = message.root_id ? String(message.root_id) : undefined;
  const parentId = message.parent_id ? String(message.parent_id) : undefined;
  const threadId = message.thread_id ? String(message.thread_id) : undefined;
  const createTime = Number(message.create_time) * 1000;

  return {
    messageId,
    chatId,
    chatType,
    senderId: senderUserId || senderOpenId,
    senderOpenId,
    content,
    contentType,
    mentionedBot,
    hasAnyMention,
    rootId,
    parentId,
    threadId,
    createTime,
    mentionTargets,
  };
}

export function buildFeishuAgentBody(params: {
  messageEvent: FeishuMessageEvent;
  groupName?: string;
  senderName?: string;
}): Record<string, unknown> {
  const { messageEvent, groupName, senderName } = params;
  const isGroup = messageEvent.chatType === "group" || messageEvent.chatType === "topic_group";
  return {
    channel: "feishu",
    channelType: isGroup ? "group" : "direct",
    chatId: messageEvent.chatId,
    messageId: messageEvent.messageId,
    senderId: messageEvent.senderOpenId,
    senderName: senderName ?? messageEvent.senderName,
    content: messageEvent.content,
    contentType: messageEvent.contentType,
    mentionedBot: messageEvent.mentionedBot,
    ...(isGroup && groupName ? { groupName } : {}),
    ...(messageEvent.threadId ? { threadId: messageEvent.threadId } : {}),
    ...(messageEvent.rootId ? { rootId: messageEvent.rootId } : {}),
    ...(messageEvent.parentId ? { parentId: messageEvent.parentId } : {}),
    ...(messageEvent.mentionTargets?.length ? { mentionTargets: messageEvent.mentionTargets } : {}),
  };
}

export function buildBroadcastSessionKey(params: {
  chatId: string; senderId?: string; threadId?: string;
  scope?: string;
}): string {
  const { chatId, senderId, threadId, scope = "group" } = params;
  switch (scope) {
    case "group_sender":
      return `feishu:${chatId}:${senderId ?? "unknown"}`;
    case "group_topic":
      return `feishu:${chatId}:${threadId ?? "default"}`;
    case "group_topic_sender":
      return `feishu:${chatId}:${threadId ?? "default"}:${senderId ?? "unknown"}`;
    case "group":
    default:
      return `feishu:${chatId}`;
  }
}

export async function resolveBroadcastAgents(params: {
  cfg: any; chatId: string; accountId?: string;
}): Promise<Array<{ agentId: string; sessionKey: string }>> {
  // Simplified: in full version this would query the agent registry
  return [];
}

export function toMessageResourceType(msgType: string): "image" | "file" | "audio" | "video" | "sticker" | null {
  switch (msgType) {
    case "image": return "image";
    case "file": return "file";
    case "audio": return "audio";
    case "media": return "video";
    case "sticker": return "sticker";
    default: return null;
  }
}

export async function handleFeishuMessage(params: {
  cfg: any;
  event: Record<string, unknown>;
  accountId?: string;
  onMessage?: (ctx: FeishuMessageContext) => Promise<void>;
  onReply?: (result: FeishuSendResult) => void;
}): Promise<{ handled: boolean; messageEvent?: FeishuMessageEvent; error?: string }> {
  const { cfg, event, accountId, onMessage, onReply } = params;

  // Parse the event
  const messageEvent = parseFeishuMessageEvent(event);
  if (!messageEvent) {
    return { handled: false, error: "Failed to parse message event" };
  }

  // Check dedup
  const { claimed, alreadyProcessed } = await claimUnprocessedFeishuMessage({
    messageId: messageEvent.messageId,
    accountId,
  });

  if (!claimed || alreadyProcessed) {
    return { handled: false, error: alreadyProcessed ? "Already processed" : "Claim failed" };
  }

  try {
    // Build context
    const isGroup = messageEvent.chatType === "group" || messageEvent.chatType === "topic_group";
    const groupName = isGroup ? await resolveGroupName({ cfg, chatId: messageEvent.chatId, accountId }) : undefined;
    const senderName = messageEvent.senderName;

    const ctx: FeishuMessageContext = {
      chatId: messageEvent.chatId,
      messageId: messageEvent.messageId,
      senderId: messageEvent.senderId,
      senderOpenId: messageEvent.senderOpenId,
      senderName,
      chatType: messageEvent.chatType,
      mentionedBot: messageEvent.mentionedBot,
      hasAnyMention: messageEvent.hasAnyMention,
      content: messageEvent.content,
      contentType: messageEvent.contentType,
      ...(messageEvent.rootId ? { rootId: messageEvent.rootId } : {}),
      ...(messageEvent.parentId ? { parentId: messageEvent.parentId } : {}),
      ...(messageEvent.threadId ? { threadId: messageEvent.threadId } : {}),
      ...(messageEvent.mentionTargets?.length ? { mentionTargets: messageEvent.mentionTargets } : {}),
      ...(messageEvent.parentId ? { replyTargetMessageId: messageEvent.parentId } : {}),
    };

    // Call the handler
    if (onMessage) {
      await onMessage(ctx);
    }

    // Mark as processed
    await finalizeFeishuMessageProcessing({ messageId: messageEvent.messageId, accountId });

    return { handled: true, messageEvent };
  } catch (err) {
    return {
      handled: false,
      messageEvent,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
