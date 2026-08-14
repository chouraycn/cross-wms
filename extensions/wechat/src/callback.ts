/**
 * 微信公众号回调处理
 *
 * - URL 验证（GET）：校验 signature → echostr 原样返回（安全模式则先 AES 解密）
 * - 消息回调（POST）：明文模式直接解析 XML；安全模式验签 + AES 解密后解析
 */
import { createHash } from "node:crypto";
import { decryptWeChatMessage } from "./crypto.js";
import { parseWeChatCallbackXml, extractXmlField } from "./xml.js";
import type { WeChatAccountConfig, WeChatMessageInfo, WeChatWebhookResult } from "./types.js";

/** 明文模式验签：sha1(sort(token, timestamp, nonce)) */
function verifyPlainSignature(token: string, timestamp: string, nonce: string, signature: string): boolean {
  const sorted = [token, timestamp, nonce].sort();
  return createHash("sha1").update(sorted.join("")).digest("hex") === signature;
}

/** 安全模式验签：sha1(sort(token, timestamp, nonce, encrypt)) */
function verifyEncryptedSignature(token: string, timestamp: string, nonce: string, encrypt: string, signature: string): boolean {
  const sorted = [token, timestamp, nonce, encrypt].sort();
  return createHash("sha1").update(sorted.join("")).digest("hex") === signature;
}

function isBase64Like(s: string): boolean {
  return /^[A-Za-z0-9+/=]+$/.test(s) && s.length > 32;
}

/**
 * 处理微信公众号回调请求（URL 验证与消息统一入口）
 *
 * @param query 请求 query（signature / timestamp / nonce / echostr / encrypt）
 * @param body  请求体（POST 时为公众号 XML 字符串）
 * @param account 账号配置（token / encodingAesKey）
 */
export function handleWeChatCallback(
  query: Record<string, unknown>,
  body: string,
  account: WeChatAccountConfig,
): WeChatWebhookResult {
  const signature = String(query.signature ?? "");
  const timestamp = String(query.timestamp ?? "");
  const nonce = String(query.nonce ?? "");
  const echostr = String(query.echostr ?? "");
  const encryptFromQuery = String(query.encrypt ?? "");

  // ===== URL 验证（GET）=====
  if (echostr) {
    if (!account.token || !signature) {
      return { success: false, error: "回调未配置 token 或缺少 signature" };
    }
    if (isBase64Like(echostr) && account.encodingAesKey) {
      // 安全模式：echostr 为密文，验签（含 encrypt）+ AES 解密后返回明文
      if (!verifyEncryptedSignature(account.token, timestamp, nonce, echostr, signature)) {
        return { success: false, error: "signature 校验失败" };
      }
      try {
        const { message } = decryptWeChatMessage(account.encodingAesKey, echostr);
        return { success: true, type: "url_verification", echostr: message };
      } catch (err) {
        return { success: false, error: `echostr 解密失败: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    // 明文模式：验签后原样返回
    if (!verifyPlainSignature(account.token, timestamp, nonce, signature)) {
      return { success: false, error: "signature 校验失败" };
    }
    return { success: true, type: "url_verification", echostr };
  }

  // ===== 消息回调（POST）=====
  const encryptFromBody = extractXmlField(body, 'Encrypt');
  const encrypt = encryptFromQuery || encryptFromBody;

  if (!account.token || !signature) {
    return { success: false, error: "回调未配置 token 或缺少 signature" };
  }

  if (!encrypt) {
    // 明文模式：直接解析 XML
    if (!verifyPlainSignature(account.token, timestamp, nonce, signature)) {
      return { success: false, error: "signature 校验失败" };
    }
    return parseWeChatDecrypted(body);
  }

  // 安全模式：验签 + 解密
  if (!verifyEncryptedSignature(account.token, timestamp, nonce, encrypt, signature)) {
    return { success: false, error: "signature 校验失败" };
  }
  if (!account.encodingAesKey) {
    return { success: false, error: "安全模式回调需要配置 encodingAesKey" };
  }
  try {
    const { message } = decryptWeChatMessage(account.encodingAesKey, encrypt);
    return parseWeChatDecrypted(message);
  } catch (err) {
    return { success: false, error: `AES 解密失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** 解析回调 XML 为公众号消息/事件 */
export function parseWeChatDecrypted(xml: string): WeChatWebhookResult {
  const fields = parseWeChatCallbackXml(xml);
  const msgType = fields.MsgType || "";

  if (msgType === "event") {
    return {
      success: true,
      type: "event",
      event: {
        event: fields.Event || "",
        userId: fields.FromUserName,
        eventKey: fields.EventKey,
        raw: fields,
      },
    };
  }

  if (msgType === "text") {
    return {
      success: true,
      type: "message",
      message: {
        chatId: fields.ToUserName || "",
        userId: fields.FromUserName || "",
        messageId: fields.MsgId || "",
        text: fields.Content || "",
        timestamp: Number(fields.CreateTime || 0) * 1000,
        chatType: "direct",
      },
    };
  }

  if (msgType === "image" || msgType === "voice" || msgType === "video" || msgType === "shortvideo" || msgType === "location") {
    return {
      success: true,
      type: "message",
      message: {
        chatId: fields.ToUserName || "",
        userId: fields.FromUserName || "",
        messageId: fields.MsgId || "",
        text: `[${msgType} 消息]`,
        timestamp: Number(fields.CreateTime || 0) * 1000,
        chatType: "direct",
      },
      ...(fields.MediaId ? { media: { type: msgType, mediaId: fields.MediaId, url: fields.Url } } : {}),
    };
  }

  return { success: false, error: `不支持的公众号回调消息类型: ${msgType || "(empty)"}` };
}

/** 公众号回调 XML 解析结果 → 消息信息（供调用方复用） */
export function weChatMessageInfoFromXml(xml: string): WeChatMessageInfo {
  const fields = parseWeChatCallbackXml(xml);
  return {
    msgId: fields.MsgId || "",
    fromUserName: fields.FromUserName || "",
    toUserName: fields.ToUserName || "",
    msgType: fields.MsgType || "",
    content: fields.Content,
    createTime: Number(fields.CreateTime || 0) * 1000,
    mediaId: fields.MediaId,
    picUrl: fields.PicUrl,
  };
}
