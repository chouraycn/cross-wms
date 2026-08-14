/**
 * 企业微信回调处理
 *
 * - URL 验证（GET）：校验 msg_signature → 解密 echostr → 原样返回明文
 * - 消息回调（POST）：验签 + AES 解密 → XML 解析 → WeComWebhookResult
 */
import { verifyAndDecryptWeComCallback } from "./crypto.js";
import { parseWeComCallbackXml, extractXmlField } from "./xml.js";
import type { WeComAccountConfig, WeComMessageInfo, WeComWebhookResult } from "./types.js";

/**
 * 处理企业微信回调请求（URL 验证与消息统一入口）
 *
 * @param query 请求 query（msg_signature / timestamp / nonce / echostr）
 * @param body  请求体（POST 时为企业微信原始 XML 字符串）
 * @param account 账号配置（token / encodingAesKey 必填）
 */
export function handleWeComCallback(
  query: Record<string, unknown>,
  body: string,
  account: WeComAccountConfig,
): WeComWebhookResult {
  const msgSignature = String(query.msg_signature ?? "");
  const timestamp = String(query.timestamp ?? "");
  const nonce = String(query.nonce ?? "");
  const echostr = String(query.echostr ?? "");
  const encrypt = String(query.encrypt ?? "");

  // URL 验证：解密 echostr 并原样返回
  if (echostr) {
    const verified = verifyAndDecryptWeComCallback({
      token: account.token,
      encodingAesKey: account.encodingAesKey,
      timestamp,
      nonce,
      msgSignature,
      encrypt: echostr,
    });
    if (!verified.ok) {
      return { success: false, error: verified.error };
    }
    return { success: true, type: "url_verification", echostr: verified.message };
  }

  // 消息回调：取 Encrypt 字段（query 或 XML body 内均可）
  const encryptFromQuery = encrypt;
  const encryptFromBody = extractXmlField(body, 'Encrypt');
  const encryptPayload = encryptFromQuery || encryptFromBody;
  if (!encryptPayload) {
    return { success: false, error: "回调缺少 Encrypt 字段" };
  }

  const verified = verifyAndDecryptWeComCallback({
    token: account.token,
    encodingAesKey: account.encodingAesKey,
    timestamp,
    nonce,
    msgSignature,
    encrypt: encryptPayload,
  });
  if (!verified.ok) {
    return { success: false, error: verified.error };
  }

  return parseWeComDecrypted(verified.message);
}

/** 解析解密后的明文 XML 为企业微信消息/事件 */
export function parseWeComDecrypted(xml: string): WeComWebhookResult {
  const fields = parseWeComCallbackXml(xml);
  const msgType = fields.MsgType || "";

  // 事件推送
  if (msgType === "event") {
    return {
      success: true,
      type: "event",
      event: {
        event: fields.Event || "",
        userId: fields.FromUserName,
        chatId: fields.ChatId,
        eventKey: fields.EventKey,
        agentId: fields.AgentID,
        raw: fields,
      },
    };
  }

  // 文本消息
  if (msgType === "text") {
    const isGroup = !!fields.ChatId;
    return {
      success: true,
      type: "message",
      message: {
        chatId: fields.ChatId || fields.ToUserName || "",
        userId: fields.FromUserName || "",
        messageId: fields.MsgId || fields.MsgId64 || "",
        text: fields.Content || "",
        timestamp: Number(fields.CreateTime || 0) * 1000,
        chatType: isGroup ? "group" : "direct",
      },
    };
  }

  // 图片/语音/文件等非文本：仅透传信息，由调用方决定是否下载素材
  if (msgType === "image" || msgType === "voice" || msgType === "file" || msgType === "video") {
    const isGroup = !!fields.ChatId;
    return {
      success: true,
      type: "message",
      message: {
        chatId: fields.ChatId || fields.ToUserName || "",
        userId: fields.FromUserName || "",
        messageId: fields.MsgId || fields.MsgId64 || "",
        text: `[${msgType} 消息]`,
        timestamp: Number(fields.CreateTime || 0) * 1000,
        chatType: isGroup ? "group" : "direct",
      },
      // 附加媒体信息
      ...(fields.MediaId ? { media: { type: msgType, mediaId: fields.MediaId, url: fields.Url } } : {}),
    };
  }

  return { success: false, error: `不支持的企微回调消息类型: ${msgType || "(empty)"}` };
}

/** 企业微信回调 XML 解析结果 → 消息信息（供调用方复用） */
export function weComMessageInfoFromXml(xml: string): WeComMessageInfo {
  const fields = parseWeComCallbackXml(xml);
  return {
    msgId: fields.MsgId || fields.MsgId64 || "",
    fromUserName: fields.FromUserName || "",
    toUserName: fields.ToUserName || "",
    agentId: fields.AgentID,
    msgType: fields.MsgType || "",
    content: fields.Content,
    createTime: Number(fields.CreateTime || 0) * 1000,
    chatId: fields.ChatId,
  };
}
