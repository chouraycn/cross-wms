/**
 * 企业微信消息发送
 *
 * - 自建应用消息: cgi-bin/message/send（text / markdown / image / file / news / textcard）
 * - 群机器人 webhook: cgi-bin/webhook/send
 */
import { weComRequest, assertWeComOk } from "./client.js";
import type { WeComAccountConfig, WeComApiResponse, WeComMsgType, WeComSendResult } from "./types.js";

export interface SendWeComMessageInput {
  account: WeComAccountConfig;
  /** 接收人 userid（多个用 | 分隔；缺省则发给全部） */
  toUser?: string;
  /** 接收部门 id（多个用 | 分隔） */
  toParty?: string;
  /** 接收标签 id（多个用 | 分隔） */
  toTag?: string;
  msgtype: WeComMsgType;
  /** 文本/卡片内容 */
  content?: string;
  /** markdown 内容 */
  markdown?: string;
  /** 媒体 media_id（image / file） */
  mediaId?: string;
  /** 图文消息 articles */
  articles?: Array<{ title: string; description?: string; url: string; picurl?: string }>;
  /** 文本卡片 */
  card?: { title: string; description: string; url: string; btntxt?: string };
  /** 安全模式（加密消息，仅企业微信客户端可见） */
  safe?: boolean;
}

/** 自建应用发消息（cgi-bin/message/send） */
export async function sendWeComMessage(input: SendWeComMessageInput): Promise<WeComSendResult> {
  const { account, toUser, toParty, toTag, msgtype, content, markdown, mediaId, articles, card, safe } = input;
  if (!account.agentId) {
    return { success: false, error: "企业微信自建应用发消息需要 agentId（应用 ID）" };
  }

  const body: Record<string, unknown> = {
    touser: toUser || "@all",
    msgtype,
    agentid: Number(account.agentId),
    safe: safe ? 1 : 0,
  };
  if (toParty) body.toparty = toParty;
  if (toTag) body.totag = toTag;

  switch (msgtype) {
    case "text":
      body.text = { content: content ?? "" };
      break;
    case "markdown":
      body.markdown = { content: markdown ?? content ?? "" };
      break;
    case "image":
    case "file":
      if (!mediaId) return { success: false, error: `${msgtype} 消息需要 mediaId` };
      body[msgtype] = { media_id: mediaId };
      break;
    case "news":
      body.news = { articles: articles ?? [] };
      break;
    case "textcard":
      body.textcard = card ?? { title: "", description: "", url: "" };
      break;
    default:
      return { success: false, error: `不支持的消息类型: ${msgtype}` };
  }

  try {
    const data = await weComRequest<WeComApiResponse & { msgid?: string }>("/message/send", {
      account,
      method: "POST",
      body,
    });
    assertWeComOk(data, "企业微信消息发送");
    return { success: true, messageId: data.msgid, raw: data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 群机器人 webhook 发消息（无需 access_token） */
export async function sendWeComWebhook(
  webhookUrl: string,
  input: { msgtype: "text" | "markdown"; content: string },
): Promise<WeComSendResult> {
  try {
    const body =
      input.msgtype === "markdown"
        ? { msgtype: "markdown", markdown: { content: input.content } }
        : { msgtype: "text", text: { content: input.content } };
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await resp.json()) as WeComApiResponse;
    if (data.errcode !== 0) {
      return { success: false, error: `群机器人发送失败: ${data.errmsg || `errcode ${data.errcode}`}` };
    }
    return { success: true, raw: data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 上传临时素材（image/file 消息前置），返回 media_id */
export async function uploadWeComMedia(
  account: WeComAccountConfig,
  input: { type: "image" | "file"; filename: string; data: Buffer },
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    const token = await (await import("./client.js")).getWeComAccessToken(account);
    const form = new FormData();
    form.append(
      "media",
      new Blob([new Uint8Array(input.data)], { type: input.type === "image" ? "image/jpeg" : "application/octet-stream" }),
      input.filename,
    );
    const resp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=${input.type}`,
      { method: "POST", body: form, signal: AbortSignal.timeout(30_000) },
    );
    const data = (await resp.json()) as WeComApiResponse & { media_id?: string };
    if (data.errcode !== 0) {
      return { success: false, error: `素材上传失败: ${data.errmsg || `errcode ${data.errcode}`}` };
    }
    return { success: true, mediaId: data.media_id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
