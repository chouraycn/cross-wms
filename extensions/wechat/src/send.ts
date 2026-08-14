/**
 * 微信公众号消息发送
 *
 * - 客服消息: cgi-bin/message/custom/send（text / image / voice / video / news）
 * - 模板消息: cgi-bin/message/template/send
 */
import { weChatRequest, assertWeChatOk } from "./client.js";
import type { WeChatAccountConfig, WeChatApiResponse, WeChatMsgType, WeChatSendResult } from "./types.js";

export interface SendWeChatMessageInput {
  account: WeChatAccountConfig;
  /** 接收用户 openid */
  toUser: string;
  msgtype: WeChatMsgType;
  /** text 内容 */
  content?: string;
  /** image/voice/video 的 media_id */
  mediaId?: string;
  /** news 图文 */
  articles?: Array<{ title: string; description?: string; url: string; picurl?: string }>;
}

/** 发送客服消息（cgi-bin/message/custom/send） */
export async function sendWeChatCustomerMessage(input: SendWeChatMessageInput): Promise<WeChatSendResult> {
  const { account, toUser, msgtype, content, mediaId, articles } = input;
  if (!toUser) {
    return { success: false, error: "公众号客服消息需要接收用户 openid（toUser）" };
  }

  const body: Record<string, unknown> = { touser: toUser, msgtype };
  switch (msgtype) {
    case "text":
      body.text = { content: content ?? "" };
      break;
    case "image":
    case "voice":
    case "video":
      if (!mediaId) return { success: false, error: `${msgtype} 消息需要 mediaId` };
      body[msgtype] = { media_id: mediaId };
      break;
    case "news":
      body.news = { articles: articles ?? [] };
      break;
    default:
      return { success: false, error: `不支持的客服消息类型: ${msgtype}` };
  }

  try {
    const data = await weChatRequest<WeChatApiResponse & { msgid?: string }>("/cgi-bin/message/custom/send", {
      account,
      method: "POST",
      body,
    });
    assertWeChatOk(data, "公众号客服消息发送");
    return { success: true, messageId: data.msgid, raw: data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface SendWeChatTemplateInput {
  account: WeChatAccountConfig;
  toUser: string;
  templateId: string;
  data: Record<string, { value: string; color?: string }>;
  url?: string;
  miniprogram?: { appid: string; pagepath: string };
}

/** 发送模板消息（cgi-bin/message/template/send） */
export async function sendWeChatTemplateMessage(input: SendWeChatTemplateInput): Promise<WeChatSendResult> {
  const { account, toUser, templateId, data, url, miniprogram } = input;
  try {
    const body: Record<string, unknown> = { touser: toUser, template_id: templateId, data };
    if (url) body.url = url;
    if (miniprogram) body.miniprogram = miniprogram;
    const resp = await weChatRequest<WeChatApiResponse & { msgid?: string }>("/cgi-bin/message/template/send", {
      account,
      method: "POST",
      body,
    });
    if (resp.errcode !== 0) {
      return { success: false, error: `公众号模板消息发送失败: ${resp.errmsg || `errcode ${resp.errcode}`}` };
    }
    return { success: true, messageId: resp.msgid, raw: resp };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 上传临时素材（image/voice/video 前置），返回 media_id */
export async function uploadWeChatMedia(
  account: WeChatAccountConfig,
  input: { type: "image" | "voice" | "video"; filename: string; data: Buffer },
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    const token = await (await import("./client.js")).getWeChatAccessToken(account);
    const form = new FormData();
    form.append(
      "media",
      new Blob([new Uint8Array(input.data)], { type: input.type === "image" ? "image/jpeg" : "application/octet-stream" }),
      input.filename,
    );
    const resp = await fetch(
      `https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=${input.type}`,
      { method: "POST", body: form, signal: AbortSignal.timeout(30_000) },
    );
    const data = (await resp.json()) as WeChatApiResponse & { media_id?: string };
    if (data.errcode !== 0) {
      return { success: false, error: `素材上传失败: ${data.errmsg || `errcode ${data.errcode}`}` };
    }
    return { success: true, mediaId: data.media_id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
