/**
 * 企业微信（WeCom）官方 API 类型定义
 *
 * 文档: https://developer.work.weixin.qq.com/document/path/90236
 */

export type WeComMsgType = "text" | "markdown" | "image" | "file" | "news" | "textcard";

/** 企业微信账号配置（自建应用 / 机器人） */
export interface WeComAccountConfig {
  /** 企业 ID（corpid，管理后台-我的企业-企业信息） */
  corpId: string;
  /** 应用 Secret（corpsecret，应用详情页获取） */
  corpSecret: string;
  /** 应用 AgentId（自建应用 ID，应用详情页获取；群机器人场景可留空） */
  agentId?: string;
  /** 回调 Token（接收消息服务器配置，可选） */
  token?: string;
  /** 回调 EncodingAESKey（43 位，接收消息服务器配置，可选） */
  encodingAesKey?: string;
  /** 群机器人 webhook URL（企业微信群聊-添加机器人获得，可选） */
  webhookUrl?: string;
  /** 内部缓存字段 */
  accessToken?: string;
  accessTokenExpiresAt?: number;
  /** 发送给部门 / 标签（与 touser 互斥） */
  toParty?: string;
  toTag?: string;
  httpTimeoutMs?: number;
}

/** 企业微信 API 通用响应 */
export interface WeComApiResponse {
  errcode: number;
  errmsg: string;
  [key: string]: unknown;
}

/** 发送结果 */
export interface WeComSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  raw?: WeComApiResponse;
}

/** 探测结果 */
export interface WeComProbeResult {
  ok: boolean;
  error?: string;
  detail?: {
    corpId: string;
    agentId?: string;
    agentName?: string;
    tokenExpiresIn?: number;
  };
}

/** 企业微信 webhook 事件解析结果 */
export interface WeComWebhookResult {
  success: boolean;
  type?: "url_verification" | "message" | "event";
  echostr?: string;
  message?: {
    chatId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct" | "group";
  };
  event?: {
    event: string;
    userId?: string;
    chatId?: string;
    [key: string]: unknown;
  };
  error?: string;
}

/** 回调消息 XML 解析后的消息信息 */
export interface WeComMessageInfo {
  msgId: string;
  fromUserName: string;
  toUserName: string;
  agentId?: string;
  msgType: string;
  content?: string;
  createTime: number;
  chatId?: string;
  [key: string]: unknown;
}
