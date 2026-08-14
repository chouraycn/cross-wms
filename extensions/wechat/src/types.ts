/**
 * 微信公众号官方 API 类型定义
 *
 * 文档: https://developers.weixin.qq.com/doc/offiaccount/
 */

export type WeChatMsgType = "text" | "image" | "voice" | "video" | "news";

/** 微信公众号账号配置（服务号/订阅号，需有客服消息权限） */
export interface WeChatAccountConfig {
  /** 公众号 AppID */
  appId: string;
  /** 公众号 AppSecret */
  appSecret: string;
  /** 服务器配置 Token（回调验签，可选） */
  token?: string;
  /** 服务器配置 EncodingAESKey（43 位，安全模式回调解密，可选） */
  encodingAesKey?: string;
  /** 内部缓存字段 */
  accessToken?: string;
  accessTokenExpiresAt?: number;
  httpTimeoutMs?: number;
}

/** 微信公众号 API 通用响应 */
export interface WeChatApiResponse {
  errcode: number;
  errmsg: string;
  [key: string]: unknown;
}

/** 发送结果 */
export interface WeChatSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  raw?: WeChatApiResponse;
}

/** 探测结果 */
export interface WeChatProbeResult {
  ok: boolean;
  error?: string;
  detail?: {
    appId: string;
    tokenExpiresIn?: number;
  };
}

/** 微信公众号 webhook 事件解析结果 */
export interface WeChatWebhookResult {
  success: boolean;
  type?: "url_verification" | "message" | "event";
  echostr?: string;
  message?: {
    chatId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct";
  };
  event?: {
    event: string;
    userId?: string;
    [key: string]: unknown;
  };
  error?: string;
}

/** 回调消息 XML 解析后的消息信息 */
export interface WeChatMessageInfo {
  msgId: string;
  fromUserName: string;
  toUserName: string;
  msgType: string;
  content?: string;
  createTime: number;
  mediaId?: string;
  picUrl?: string;
  [key: string]: unknown;
}
