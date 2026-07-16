// Feishu plugin module implements send behavior for cross-wms.
import type * as Lark from "@larksuiteoapi/node-sdk";
import { createFeishuClient } from "./client.js";
import { parsePostContent } from "./post.js";
import type { FeishuChatType, FeishuMessageInfo, FeishuSendResult, MentionTarget, ResolvedFeishuAccount } from "./types.js";

const WITHDRAWN_REPLY_ERROR_CODES = new Set([230011, 231003]);
const INTERACTIVE_CARD_FALLBACK_TEXT = "[Interactive Card]";
const POST_FALLBACK_TEXT = "[Rich text message]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  return "";
}

function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  if (typeof value === "string") return value.toLowerCase() || undefined;
  return undefined;
}

function shouldFallbackFromReplyTarget(response: { code?: number; msg?: string }): boolean {
  if (response.code !== undefined && WITHDRAWN_REPLY_ERROR_CODES.has(response.code)) {
    return true;
  }
  const msg = normalizeLowercaseStringOrEmpty(response.msg);
  return msg.includes("withdrawn") || msg.includes("not found");
}

function isWithdrawnReplyError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: number }).code;
  if (typeof code === "number" && WITHDRAWN_REPLY_ERROR_CODES.has(code)) return true;
  const response = (err as { response?: { data?: { code?: number } } }).response;
  if (typeof response?.data?.code === "number" && WITHDRAWN_REPLY_ERROR_CODES.has(response.data.code)) return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && cause !== err) return isWithdrawnReplyError(cause);
  return false;
}

type FeishuCreateMessageClient = {
  im: {
    message: {
      reply: (opts: {
        path: { message_id: string };
        data: { content: string; msg_type: string; reply_in_thread?: true };
      }) => Promise<{ code?: number; msg?: string; data?: { message_id?: string } }>;
      create: (opts: {
        params: { receive_id_type: "chat_id" | "email" | "open_id" | "union_id" | "user_id" };
        data: { receive_id: string; content: string; msg_type: string };
      }) => Promise<{ code?: number; msg?: string; data?: { message_id?: string } }>;
    };
  };
};

function parseStrictNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0 && String(parsed) === value.trim()) return parsed;
  }
  return undefined;
}

type FeishuMessageSender = {
  id?: string;
  id_type?: string;
  sender_type?: string;
};

type FeishuMessageGetItem = {
  message_id?: string;
  chat_id?: string;
  chat_type?: FeishuChatType;
  thread_id?: string;
  msg_type?: string;
  body?: { content?: string };
  sender?: FeishuMessageSender;
  create_time?: string;
};

type FeishuGetMessageResponse = {
  code?: number;
  msg?: string;
  data?: FeishuMessageGetItem & { items?: FeishuMessageGetItem[] };
};

function parseFeishuMessageContent(rawContent: string, msgType: string): string {
  if (!rawContent) return "";
  let parsed: unknown;
  try { parsed = JSON.parse(rawContent); } catch { return rawContent; }
  if (msgType === "text") {
    const text = (parsed as { text?: unknown })?.text;
    return typeof text === "string" ? text : "[Text message]";
  }
  if (msgType === "post") return parsePostContent(rawContent).textContent;
  if (msgType === "interactive") {
    if (!isRecord(parsed)) return INTERACTIVE_CARD_FALLBACK_TEXT;
    const elements = isRecord(parsed.body) ? parsed.body?.elements : parsed.elements;
    if (Array.isArray(elements)) {
      for (const el of elements) {
        if (isRecord(el)) {
          if (typeof el.content === "string") return el.content;
          if (isRecord(el.text) && typeof el.text.content === "string") return el.text.content;
        }
      }
    }
  }
  if (typeof parsed === "string") return parsed;
  const genericText = (parsed as { text?: unknown })?.text;
  if (typeof genericText === "string" && genericText.trim()) return genericText;
  return `[${msgType || "unknown"} message]`;
}

function parseFeishuMessageItem(item: FeishuMessageGetItem, fallbackMessageId?: string): FeishuMessageInfo {
  const msgType = item.msg_type ?? "text";
  const rawContent = item.body?.content ?? "";
  return {
    messageId: item.message_id ?? fallbackMessageId ?? "",
    chatId: item.chat_id ?? "",
    chatType: item.chat_type,
    senderId: item.sender?.id,
    senderOpenId: item.sender?.id_type === "open_id" ? item.sender?.id : undefined,
    senderType: item.sender?.sender_type,
    content: parseFeishuMessageContent(rawContent, msgType),
    contentType: msgType,
    createTime: parseStrictNonNegativeInteger(item.create_time),
    threadId: item.thread_id || undefined,
  };
}

// Account resolution helper
function resolveFeishuRuntimeAccount(params: { cfg: any; accountId?: string }): ResolvedFeishuAccount & { configured: boolean } {
  const feishuCfg = params.cfg?.feishu ?? params.cfg;
  const appId = feishuCfg?.appId ?? feishuCfg?.app_id;
  const appSecret = feishuCfg?.appSecret ?? feishuCfg?.app_secret;
  return {
    accountId: params.accountId ?? "default",
    selectionSource: "explicit",
    enabled: !!(appId && appSecret),
    configured: !!(appId && appSecret),
    appId,
    appSecret,
    domain: feishuCfg?.domain ?? "feishu",
    encryptKey: feishuCfg?.encryptKey ?? feishuCfg?.encrypt_key,
    verificationToken: feishuCfg?.verificationToken ?? feishuCfg?.verification_token,
    config: feishuCfg ?? {},
  };
}

function resolveFeishuSendTarget(params: { cfg: any; to: string; accountId?: string }) {
  const account = resolveFeishuRuntimeAccount({ cfg: params.cfg, accountId: params.accountId });
  const client = createFeishuClient(account);
  const to = params.to;
  let receiveId: string;
  let receiveIdType: "chat_id" | "email" | "open_id" | "union_id" | "user_id";

  if (to.startsWith("chat:")) {
    receiveId = to.slice(5);
    receiveIdType = "chat_id";
  } else if (to.startsWith("user:")) {
    receiveId = to.slice(5);
    receiveIdType = "open_id";
  } else if (to.includes("@")) {
    receiveId = to;
    receiveIdType = "email";
  } else {
    receiveId = to;
    receiveIdType = "chat_id";
  }

  return { client, receiveId, receiveIdType, account };
}

function resolveFeishuReceiptKind(msgType: string): "post" | "interactive" | "media" | "image" | "file" | "audio" {
  if (msgType === "interactive") return "interactive";
  if (msgType === "image") return "image";
  if (msgType === "audio") return "audio";
  if (msgType === "media") return "media";
  if (msgType === "file") return "file";
  return "post";
}

function toFeishuSendResult(
  response: { code?: number; msg?: string; data?: { message_id?: string } },
  receiveId: string,
  receiptKind: string,
): FeishuSendResult {
  const messageId = response.data?.message_id ?? "";
  return {
    messageId,
    chatId: receiveId,
    receipt: { kind: resolveFeishuReceiptKind(receiptKind) as any, messageId },
  };
}

async function sendReplyOrFallbackDirect(
  client: FeishuCreateMessageClient,
  params: {
    replyToMessageId?: string;
    replyInThread?: boolean;
    content: string;
    msgType: string;
    directParams: {
      receiveId: string;
      receiveIdType: "chat_id" | "email" | "open_id" | "union_id" | "user_id";
      content: string;
      msgType: string;
    };
  },
): Promise<FeishuSendResult> {
  if (!params.replyToMessageId) {
    const response = await client.im.message.create({
      params: { receive_id_type: params.directParams.receiveIdType },
      data: {
        receive_id: params.directParams.receiveId,
        content: params.directParams.content,
        msg_type: params.directParams.msgType,
      },
    });
    if (response.code !== 0 && response.code !== undefined) {
      throw new Error(`Feishu send failed: ${response.msg || `code ${response.code}`}`);
    }
    return toFeishuSendResult(response, params.directParams.receiveId, params.msgType);
  }

  try {
    const response = await client.im.message.reply({
      path: { message_id: params.replyToMessageId },
      data: {
        content: params.content,
        msg_type: params.msgType,
        ...(params.replyInThread ? { reply_in_thread: true } : {}),
      },
    });
    if (shouldFallbackFromReplyTarget(response)) {
      const fallback = await client.im.message.create({
        params: { receive_id_type: params.directParams.receiveIdType },
        data: {
          receive_id: params.directParams.receiveId,
          content: params.directParams.content,
          msg_type: params.directParams.msgType,
        },
      });
      return toFeishuSendResult(fallback, params.directParams.receiveId, params.msgType);
    }
    if (response.code !== 0 && response.code !== undefined) {
      throw new Error(`Feishu reply failed: ${response.msg || `code ${response.code}`}`);
    }
    return toFeishuSendResult(response, params.directParams.receiveId, params.msgType);
  } catch (err) {
    if (!isWithdrawnReplyError(err)) throw err;
    const fallback = await client.im.message.create({
      params: { receive_id_type: params.directParams.receiveIdType },
      data: {
        receive_id: params.directParams.receiveId,
        content: params.directParams.content,
        msg_type: params.directParams.msgType,
      },
    });
    return toFeishuSendResult(fallback, params.directParams.receiveId, params.msgType);
  }
}

type FeishuPostMessageElement =
  | { tag: "at"; user_id: string; user_name?: string }
  | { tag: "md"; text: string };

function buildFeishuPostMentionElements(mentions?: MentionTarget[]): FeishuPostMessageElement[] {
  if (!mentions?.length) return [];
  const elements: FeishuPostMessageElement[] = [];
  for (const mention of mentions) {
    const userId = mention.openId.trim();
    if (!userId) continue;
    elements.push({ tag: "at", user_id: userId, ...(mention.name.trim() ? { user_name: mention.name.trim() } : {}) });
  }
  return elements;
}

export function buildFeishuPostMessagePayload(params: {
  messageText: string;
  mentions?: MentionTarget[];
}): { content: string; msgType: string } {
  const { messageText, mentions } = params;
  const content: FeishuPostMessageElement[] = [
    ...buildFeishuPostMentionElements(mentions),
    { tag: "md", text: messageText },
  ];
  return {
    content: JSON.stringify({ zh_cn: { content: [content] } }),
    msgType: "post",
  };
}

export type SendFeishuMessageParams = {
  cfg: any;
  to: string;
  text: string;
  replyToMessageId?: string;
  replyInThread?: boolean;
  allowTopLevelReplyFallback?: boolean;
  mentions?: MentionTarget[];
  accountId?: string;
};

export async function sendMessageFeishu(params: SendFeishuMessageParams): Promise<FeishuSendResult> {
  const { cfg, to, text, replyToMessageId, replyInThread, mentions, accountId } = params;
  const { client, receiveId, receiveIdType } = resolveFeishuSendTarget({ cfg, to, accountId });
  const { content, msgType } = buildFeishuPostMessagePayload({ messageText: text, mentions });
  const directParams = { receiveId, receiveIdType, content, msgType };
  return sendReplyOrFallbackDirect(client, { replyToMessageId, replyInThread, content, msgType, directParams });
}

export type SendFeishuCardParams = {
  cfg: any;
  to: string;
  card: Record<string, unknown>;
  replyToMessageId?: string;
  replyInThread?: boolean;
  allowTopLevelReplyFallback?: boolean;
  accountId?: string;
};

export async function sendCardFeishu(params: SendFeishuCardParams): Promise<FeishuSendResult> {
  const { cfg, to, card, replyToMessageId, replyInThread, accountId } = params;
  const { client, receiveId, receiveIdType } = resolveFeishuSendTarget({ cfg, to, accountId });
  const content = JSON.stringify(card);
  const directParams = { receiveId, receiveIdType, content, msgType: "interactive" as const };
  return sendReplyOrFallbackDirect(client, { replyToMessageId, replyInThread, content, msgType: "interactive", directParams });
}

export async function editMessageFeishu(params: {
  cfg: any;
  messageId: string;
  text?: string;
  card?: Record<string, unknown>;
  accountId?: string;
}): Promise<{ messageId: string; contentType: "post" | "interactive" }> {
  const { cfg, messageId, text, card, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  const hasText = typeof text === "string" && text.trim().length > 0;
  const hasCard = Boolean(card);
  if (hasText === hasCard) throw new Error("Feishu edit requires exactly one of text or card.");
  const client = createFeishuClient(account);
  if (card) {
    const response = await client.im.message.patch({ path: { message_id: messageId }, data: { content: JSON.stringify(card) } });
    if (response.code !== 0) throw new Error(`Feishu message edit failed: ${response.msg || `code ${response.code}`}`);
    return { messageId, contentType: "interactive" };
  }
  const payload = buildFeishuPostMessagePayload({ messageText: text! });
  const response = await client.im.message.patch({ path: { message_id: messageId }, data: { content: payload.content } });
  if (response.code !== 0) throw new Error(`Feishu message edit failed: ${response.msg || `code ${response.code}`}`);
  return { messageId, contentType: "post" };
}

export function buildMarkdownCard(text: string): Record<string, unknown> {
  return { schema: "2.0", config: { width_mode: "fill" }, body: { elements: [{ tag: "markdown", content: text }] } };
}

export type CardHeaderConfig = { title: string; template?: string };

const FEISHU_CARD_TEMPLATES = new Set(["blue", "green", "red", "orange", "purple", "indigo", "wathet", "turquoise", "yellow", "grey", "carmine", "violet", "lime"]);

export function buildStructuredCard(text: string, options?: { header?: CardHeaderConfig; note?: string }): Record<string, unknown> {
  const elements: Record<string, unknown>[] = [{ tag: "markdown", content: text }];
  if (options?.note) {
    elements.push({ tag: "hr" });
    elements.push({ tag: "markdown", content: `<font color='grey'>${options.note}</font>` });
  }
  const card: Record<string, unknown> = { schema: "2.0", config: { width_mode: "fill" }, body: { elements } };
  if (options?.header) {
    const template = normalizeOptionalLowercaseString(options.header.template);
    card.header = {
      title: { tag: "plain_text", content: options.header.title },
      template: template && FEISHU_CARD_TEMPLATES.has(template) ? template : "blue",
    };
  }
  return card;
}

function buildMentionedCardContent(mentions: MentionTarget[], text: string): string {
  const mentionTags = mentions.map((m) => `<at user_id="${m.openId}">${m.name}</at>`).join(" ");
  return mentionTags ? `${mentionTags}\n${text}` : text;
}

export async function sendStructuredCardFeishu(params: {
  cfg: any; to: string; text: string; replyToMessageId?: string; replyInThread?: boolean;
  mentions?: MentionTarget[]; accountId?: string; header?: CardHeaderConfig; note?: string;
}): Promise<FeishuSendResult> {
  const { cfg, to, text, replyToMessageId, replyInThread, mentions, accountId, header, note } = params;
  let cardText = text;
  if (mentions && mentions.length > 0) cardText = buildMentionedCardContent(mentions, text);
  const card = buildStructuredCard(cardText, { header, note });
  return sendCardFeishu({ cfg, to, card, replyToMessageId, replyInThread, accountId });
}

export async function sendMarkdownCardFeishu(params: {
  cfg: any; to: string; text: string; replyToMessageId?: string; replyInThread?: boolean;
  mentions?: MentionTarget[]; accountId?: string;
}): Promise<FeishuSendResult> {
  const { cfg, to, text, replyToMessageId, replyInThread, mentions, accountId } = params;
  let cardText = text;
  if (mentions && mentions.length > 0) cardText = buildMentionedCardContent(mentions, text);
  const card = buildMarkdownCard(cardText);
  return sendCardFeishu({ cfg, to, card, replyToMessageId, replyInThread, accountId });
}

export async function getMessageFeishu(params: {
  cfg: any; messageId: string; accountId?: string;
}): Promise<FeishuMessageInfo | null> {
  const { cfg, messageId, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  const client = createFeishuClient(account);
  try {
    const response = (await client.im.message.get({
      params: { card_msg_content_type: "user_card_content" },
      path: { message_id: messageId },
    })) as FeishuGetMessageResponse;
    if (response.code !== 0) return null;
    const rawItem = response.data?.items?.[0] ?? response.data;
    const item = rawItem && (rawItem.body !== undefined || (rawItem as any).message_id !== undefined) ? rawItem : null;
    if (!item) return null;
    return parseFeishuMessageItem(item, messageId);
  } catch { return null; }
}

export type FeishuThreadMessageInfo = {
  messageId: string; senderId?: string; senderType?: string;
  content: string; contentType: string; createTime?: number;
};

export async function listFeishuThreadMessages(params: {
  cfg: any; threadId: string; currentMessageId?: string; rootMessageId?: string;
  limit?: number; accountId?: string;
}): Promise<FeishuThreadMessageInfo[]> {
  const { cfg, threadId, currentMessageId, rootMessageId, limit = 20, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  const client = createFeishuClient(account);
  const response = (await client.im.message.list({
    params: {
      container_id_type: "thread", container_id: threadId,
      sort_type: "ByCreateTimeDesc", page_size: Math.min(limit + 1, 50),
      card_msg_content_type: "user_card_content",
    },
  })) as any;
  if (response.code !== 0) throw new Error(`Feishu thread list failed: code=${response.code} msg=${response.msg ?? "unknown"}`);
  const items = response.data?.items ?? [];
  const results: FeishuThreadMessageInfo[] = [];
  for (const item of items) {
    if (currentMessageId && item.message_id === currentMessageId) continue;
    if (rootMessageId && item.message_id === rootMessageId) continue;
    const parsed = parseFeishuMessageItem(item);
    results.push({ messageId: parsed.messageId, senderId: parsed.senderId, senderType: parsed.senderType, content: parsed.content, contentType: parsed.contentType, createTime: parsed.createTime });
    if (results.length >= limit) break;
  }
  results.reverse();
  return results;
}
