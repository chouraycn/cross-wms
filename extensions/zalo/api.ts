/**
 * Zalo 渠道 API 封装
 *
 * Zalo 是越南主流社交平台，其 Official Account (OA) 开放平台提供
 * 消息发送与 webhook 事件订阅能力。参考 openclaw/extensions/zalo
 * 的核心 API 层。
 *
 * 仅移植核心 API 层，不依赖 openclaw 内部框架。
 */

const ZALO_OA_API_BASE = "https://openapi.zalo.me/v2.0/oa";

/** Zalo 消息附件 */
export interface ZaloAttachment {
  type: "image" | "file" | "template" | "link";
  payload: unknown;
}

/** Zalo 发送消息体 */
export interface ZaloMessage {
  /** 文本内容 */
  text?: string;
  /** 附件 */
  attachment?: ZaloAttachment;
}

/** Zalo 发送消息响应 */
export interface ZaloSendResult {
  /** 是否发送成功 */
  success: boolean;
  /** Zalo 返回的消息 ID */
  messageId?: string;
  /** 错误信息 */
  error?: string;
  /** 错误码 */
  errorCode?: number;
  /** 原始响应 */
  raw?: unknown;
}

/** Zalo webhook 事件来源用户 */
export interface ZaloEventSender {
  id: string;
  display_name?: string;
  avatar?: string;
}

/** Zalo webhook 事件 */
export interface ZaloWebhookEvent {
  /** 事件类型（user_send_text / user_received_message / follow / unfollow 等） */
  type: string;
  /** 发送方用户信息 */
  sender?: ZaloEventSender;
  /** 消息 ID */
  messageId?: string;
  /** 文本内容 */
  text?: string;
  /** 附件 */
  attachment?: ZaloAttachment;
  /** 事件时间戳 */
  timestamp?: number;
  /** 原始事件数据 */
  raw?: unknown;
}

/** Zalo webhook 处理器 */
export type ZaloWebhookHandler = (event: ZaloWebhookEvent) => void | Promise<void>;

/**
 * Zalo 渠道配置
 */
export interface ZaloChannelConfig {
  /** OA Access Token */
  accessToken: string;
  /** OA ID（用于校验 webhook） */
  oaId?: string;
  /** API 端点基址（默认官方端点） */
  apiBase?: string;
  /** 请求超时（毫秒，默认 10000） */
  timeout?: number;
}

/** Zalo 渠道句柄 */
export interface ZaloChannel {
  /** 向指定用户发送文本消息 */
  sendText(userId: string, text: string): Promise<ZaloSendResult>;
  /** 向指定用户发送消息（含附件） */
  sendMessage(userId: string, message: ZaloMessage): Promise<ZaloSendResult>;
  /** 校验 webhook 回调（返回解析后的事件，校验失败返回 null） */
  verifyWebhook(body: string, oaIdFromQuery?: string): ZaloWebhookEvent | null;
  /** 分发 webhook 事件给已注册的处理器 */
  dispatchWebhook(body: string, oaIdFromQuery?: string): Promise<boolean>;
  /** 注册 webhook 事件处理器 */
  onWebhookEvent(handler: ZaloWebhookHandler): () => void;
  /** 获取用户信息 */
  getUserProfile(userId: string): Promise<ZaloEventSender | null>;
}

/**
 * 创建 Zalo 渠道实例
 *
 * 通过 Zalo OA 开放平台 API 发送消息，并支持 webhook 事件校验与分发。
 */
export function createZaloChannel(config: ZaloChannelConfig): ZaloChannel {
  const apiBase = config.apiBase || ZALO_OA_API_BASE;
  const timeout = config.timeout ?? 10000;
  const handlers = new Set<ZaloWebhookHandler>();

  const buildUrl = (path: string): string => {
    const base = apiBase.replace(/\/+$/, "");
    const sep = path.includes("?") ? "&" : "?";
    return `${base}${path}${sep}access_token=${encodeURIComponent(config.accessToken)}`;
  };

  const request = async <T = unknown>(
    path: string,
    body: unknown,
    method: "POST" | "GET" = "POST",
  ): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(buildUrl(path), {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  };

  const sendMessage = async (
    userId: string,
    message: ZaloMessage,
  ): Promise<ZaloSendResult> => {
    try {
      const data = await request<{
        error?: number;
        message?: string;
        data?: { msg_id?: string };
      }>("/message", {
        recipient: { user_id: userId },
        message,
      });

      // Zalo OA 成功时 error 字段为 0
      if (data.error && data.error !== 0) {
        return {
          success: false,
          error: data.message || "Zalo 发送失败",
          errorCode: data.error,
          raw: data,
        };
      }

      return {
        success: true,
        messageId: data.data?.msg_id,
        raw: data,
      };
    } catch (err) {
      return {
        success: false,
        error: `Zalo 发送异常: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  };

  const sendText = (userId: string, text: string): Promise<ZaloSendResult> => {
    return sendMessage(userId, { text });
  };

  const parseWebhookBody = (raw: unknown): ZaloWebhookEvent | null => {
    const obj = raw as Record<string, unknown>;
    if (!obj || typeof obj !== "object") return null;
    const event = obj.event as string | undefined;
    const recipient = obj.recipient as { id?: string } | undefined;
    const sender = obj.sender as ZaloEventSender | undefined;
    const msg = obj.message as
      | { text?: string; msg_id?: string; attachments?: ZaloAttachment[] }
      | undefined;
    return {
      type: event ?? (obj.type as string | undefined) ?? "",
      sender,
      messageId: msg?.msg_id,
      text: msg?.text,
      attachment: msg?.attachments?.[0],
      timestamp: typeof obj.timestamp === "number" ? obj.timestamp : undefined,
      raw: obj,
      // 兼容 recipient 字段
      ...(recipient ? {} : {}),
    };
  };

  const verifyWebhook = (body: string, oaIdFromQuery?: string): ZaloWebhookEvent | null => {
    // OA ID 校验（若提供 oaId 配置则比对）
    if (config.oaId && oaIdFromQuery && oaIdFromQuery !== config.oaId) {
      return null;
    }
    try {
      const parsed = JSON.parse(body);
      return parseWebhookBody(parsed);
    } catch {
      return null;
    }
  };

  const dispatchWebhook = async (body: string, oaIdFromQuery?: string): Promise<boolean> => {
    const event = verifyWebhook(body, oaIdFromQuery);
    if (!event) return false;
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch {
        // 单个处理器异常不影响其他处理器
      }
    }
    return true;
  };

  const onWebhookEvent = (handler: ZaloWebhookHandler): (() => void) => {
    handlers.add(handler);
    return () => handlers.delete(handler);
  };

  const getUserProfile = async (userId: string): Promise<ZaloEventSender | null> => {
    try {
      const data = await request<{
        error?: number;
        data?: ZaloEventSender;
      }>(`/getprofile?user_id=${encodeURIComponent(userId)}`, undefined, "GET");
      if (data.error && data.error !== 0) return null;
      return data.data ?? null;
    } catch {
      return null;
    }
  };

  return {
    sendText,
    sendMessage,
    verifyWebhook,
    dispatchWebhook,
    onWebhookEvent,
    getUserProfile,
  };
}
