/**
 * LINE 渠道 API 封装
 *
 * 基于 LINE Messaging API 实现 webhook 签名校验与消息发送。
 * 参考 openclaw/extensions/line 的核心 API 层。
 *
 * 仅移植核心 API 层，不依赖 openclaw 内部框架。
 */

const LINE_API_BASE = "https://api.line.me/v2/bot";

/** LINE 消息对象（文本/图片/模板等） */
export interface LineMessage {
  type: "text" | "image" | "video" | "audio" | "sticker" | "template" | "flex";
  text?: string;
  [key: string]: unknown;
}

/** LINE webhook 事件来源 */
export interface LineEventSource {
  type: "user" | "group" | "room";
  userId?: string;
  groupId?: string;
  roomId?: string;
}

/** LINE webhook 事件 */
export interface WebhookEvent {
  type: string;
  replyToken?: string;
  mode?: string;
  timestamp?: number;
  source?: LineEventSource;
  message?: LineMessage & { id?: string };
  [key: string]: unknown;
}

/** LINE webhook 请求体 */
export interface WebhookRequestBody {
  events: WebhookEvent[];
}

/**
 * LINE 渠道配置
 */
export interface LineChannelConfig {
  /** Channel Access Token（用于调用 Messaging API） */
  channelAccessToken: string;
  /** Channel Secret（用于校验 webhook 签名） */
  channelSecret: string;
  /** API 端点基址（默认官方端点，可自托管反代） */
  apiBase?: string;
}

/** LINE webhook 事件回调句柄 */
export type LineWebhookHandler = (events: WebhookEvent[]) => void | Promise<void>;

/** LINE 渠道句柄，提供 webhook 校验与消息发送能力 */
export interface LineChannel {
  /** 校验 webhook 请求签名，返回事件数组；校验失败返回 null */
  verifyWebhook(rawBody: string, signature: string): WebhookEvent[] | null;
  /** 解析并分发 webhook 事件给已注册的处理器 */
  dispatchWebhook(rawBody: string, signature: string): Promise<boolean>;
  /** 注册 webhook 事件处理器 */
  onWebhookEvent(handler: LineWebhookHandler): () => void;
  /** 回复消息（使用 replyToken，仅限收到 webhook 后短时间内使用） */
  replyMessage(replyToken: string, messages: LineMessage[]): Promise<void>;
  /** 主动推送消息到指定用户/群组/聊天室 */
  pushMessage(to: string, messages: LineMessage[]): Promise<void>;
  /** 发送单条文本消息的便捷方法 */
  sendText(to: string, text: string): Promise<void>;
}

/**
 * 计算 LINE webhook 签名
 *
 * LINE 使用 channel secret 作为 HMAC-SHA256 密钥对请求体进行签名，
 * 再做 base64 编码作为 X-Line-Signature 头。
 */
function computeSignature(body: string, secret: string): string {
  // 动态引入 crypto，避免在非 Node 环境下被静态分析强制加载
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("node:crypto") as typeof import("node:crypto");
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

/** 常量时间字符串比较，避免时序攻击 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 创建 LINE 渠道实例
 *
 * 提供 webhook 签名校验、事件分发以及 reply/push 消息发送能力。
 */
export function createLineChannel(config: LineChannelConfig): LineChannel {
  const apiBase = config.apiBase || LINE_API_BASE;
  const handlers = new Set<LineWebhookHandler>();

  const verifyWebhook = (rawBody: string, signature: string): WebhookEvent[] | null => {
    if (!signature) return null;
    const expected = computeSignature(rawBody, config.channelSecret);
    if (!safeEqual(expected, signature)) return null;
    try {
      const parsed = JSON.parse(rawBody) as WebhookRequestBody;
      return parsed.events ?? [];
    } catch {
      return null;
    }
  };

  const dispatchWebhook = async (rawBody: string, signature: string): Promise<boolean> => {
    const events = verifyWebhook(rawBody, signature);
    if (!events) return false;
    for (const handler of handlers) {
      try {
        await handler(events);
      } catch {
        // 单个处理器异常不影响其他处理器
      }
    }
    return true;
  };

  const onWebhookEvent = (handler: LineWebhookHandler): (() => void) => {
    handlers.add(handler);
    return () => handlers.delete(handler);
  };

  const request = async (path: string, body: unknown): Promise<unknown> => {
    const response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.channelAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`LINE API 错误 (${path}): ${response.status} ${errorText}`);
    }

    if (response.status === 200) {
      return response.json().catch(() => undefined);
    }
    return undefined;
  };

  const replyMessage = async (replyToken: string, messages: LineMessage[]): Promise<void> => {
    await request("/message/reply", { replyToken, messages });
  };

  const pushMessage = async (to: string, messages: LineMessage[]): Promise<void> => {
    await request("/message/push", { to, messages });
  };

  const sendText = async (to: string, text: string): Promise<void> => {
    await pushMessage(to, [{ type: "text", text }]);
  };

  return {
    verifyWebhook,
    dispatchWebhook,
    onWebhookEvent,
    replyMessage,
    pushMessage,
    sendText,
  };
}
