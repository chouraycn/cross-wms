/**
 * Tlon 渠道 API 封装
 *
 * 基于 Urbit 协议（Gall agent + HTTP channel API）实现基础的消息收发。
 * 参考 openclaw/extensions/tlon 的核心 API 层。
 *
 * Urbit 通过 /~/channel HTTP 端点进行长轮询通信：
 *  - poke：向 agent 写入数据
 *  - subscribe：订阅 agent 的 path 上的事件
 *  - 事件流通过同样的 channel 长轮询返回
 *
 * 仅移植核心 API 层，不依赖 openclaw 内部框架。
 */

/** Tlon (Urbit) 消息事件 */
export interface TlonMessageEvent {
  /** 消息所属的聊天/群组标识 */
  group?: string;
  /** 发送者船名（如 ~sampel-palnet） */
  author?: string;
  /** 消息文本内容 */
  text?: string;
  /** Urbit 时间戳（毫秒，从 2000-01-01 起算） */
  time?: number;
  /** 原始事件数据 */
  raw?: unknown;
}

/**
 * Tlon 渠道配置
 */
export interface TlonChannelConfig {
  /** Urbit ship URL（如 https://ship.tlon.io） */
  url: string;
  /** 船名（如 ~sampel-palnet） */
  ship: string;
  /** 认证 cookie（urbauth-~ship 形式，含完整值） */
  authCookie?: string;
  /** 认证 token（部分网关使用 Authorization 头） */
  authToken?: string;
  /** 目标聊天应用的 agent 名称（默认 "chat"） */
  chatApp?: string;
  /** 默认发送目标的聊天名称（如 "dm-~sampel-palnet"） */
  defaultChat?: string;
  /** 长轮询间隔（毫秒，默认 2000） */
  pollInterval?: number;
  /** 请求超时（毫秒，默认 15000） */
  timeout?: number;
}

/** Tlon 渠道句柄 */
export interface TlonChannel {
  /** 建立会话并开始订阅消息事件 */
  connect(): Promise<void>;
  /** 断开会话，停止轮询 */
  disconnect(): Promise<void>;
  /** 向指定聊天发送文本消息 */
  sendMessage(chat: string, text: string): Promise<boolean>;
  /** 向默认聊天发送文本消息 */
  send(text: string): Promise<boolean>;
  /** 注册消息事件回调 */
  onMessage(handler: (event: TlonMessageEvent) => void): () => void;
  /** 当前会话是否已建立 */
  isConnected(): boolean;
}

/** Urbit channel API 的请求动作 */
interface UrbitAction {
  id: number;
  action: "poke" | "subscribe" | "unsubscribe" | "ack";
  ship?: string;
  app?: string;
  mark?: string;
  json?: unknown;
  path?: string;
  "event-id"?: string;
}

/**
 * 创建 Tlon 渠道实例
 *
 * 通过 Urbit 的 /~/channel HTTP 端点进行长轮询通信：
 *  - connect 时发送 subscribe 订阅消息路径
 *  - sendMessage 时发送 poke 写入 chat 消息
 *  - 后台轮询解析事件并触发回调
 */
export function createTlonChannel(config: TlonChannelConfig): TlonChannel {
  const baseUrl = config.url.replace(/\/+$/, "");
  const ship = config.ship;
  const chatApp = config.chatApp ?? "chat";
  const defaultChat = config.defaultChat ?? "";
  const pollInterval = config.pollInterval ?? 2000;
  const timeout = config.timeout ?? 15000;

  let nextId = 1;
  let connected = false;
  let pollTimer: NodeJS.Timeout | undefined;
  let aborted = false;

  const handlers = new Set<(event: TlonMessageEvent) => void>();
  const ackQueue: UrbitAction[] = [];

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.authToken) {
      headers["Authorization"] = `Bearer ${config.authToken}`;
    }
    if (config.authCookie) {
      headers["Cookie"] = config.authCookie;
    }
    return headers;
  };

  const postActions = async (actions: UrbitAction[]): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${baseUrl}/~/channel`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(actions),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Urbit channel 请求失败: ${response.status}`);
      }
      return response.json().catch(() => undefined);
    } finally {
      clearTimeout(timer);
    }
  };

  const pollEvents = async (): Promise<void> => {
    if (!connected || aborted) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(
        `${baseUrl}/~/channel?since=${Date.now()}`,
        {
          method: "GET",
          headers: buildHeaders(),
          signal: controller.signal,
        },
      );
      clearTimeout(timer);

      if (response.ok) {
        const events = await response.json().catch(() => []) as unknown[];
        for (const evt of events) {
          const obj = evt as Record<string, unknown>;
          // 对收到的事件回执 ack
          if (typeof obj.id === "string" || typeof obj.id === "number") {
            ackQueue.push({
              id: nextId++,
              action: "ack",
              "event-id": String(obj.id),
            });
          }
          const event = parseEvent(obj);
          if (event) {
            for (const handler of handlers) {
              try {
                handler(event);
              } catch {
                // 回调异常不影响后续处理
              }
            }
          }
        }
        // 批量发送 ack
        if (ackQueue.length > 0) {
          await postActions(ackQueue.splice(0, ackQueue.length)).catch(() => undefined);
        }
      }
    } catch {
      // 轮询失败时静默，下个周期重试
    } finally {
      if (connected && !aborted) {
        pollTimer = setTimeout(() => {
          void pollEvents();
        }, pollInterval);
      }
    }
  };

  const parseEvent = (obj: Record<string, unknown>): TlonMessageEvent | null => {
    // Urbit chat 事件结构因 agent 版本而异，这里做宽松解析
    const json = obj.json as Record<string, unknown> | undefined;
    if (!json) return null;
    return {
      group: typeof json.group === "string" ? json.group : undefined,
      author: typeof json.author === "string" ? json.author : undefined,
      text: typeof json.text === "string" ? json.text : undefined,
      time: typeof json.time === "number" ? json.time : undefined,
      raw: obj,
    };
  };

  const connect = async (): Promise<void> => {
    if (connected) return;
    // 订阅默认 chat 应用的消息路径
    const action: UrbitAction = {
      id: nextId++,
      action: "subscribe",
      ship,
      app: chatApp,
      path: "/inbox",
    };
    await postActions([action]);
    connected = true;
    aborted = false;
    // 启动后台轮询
    pollTimer = setTimeout(() => {
      void pollEvents();
    }, pollInterval);
  };

  const disconnect = async (): Promise<void> => {
    aborted = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = undefined;
    }
    if (connected) {
      await postActions([
        {
          id: nextId++,
          action: "unsubscribe",
          ship,
          app: chatApp,
          path: "/inbox",
        },
      ]).catch(() => undefined);
    }
    connected = false;
  };

  const sendMessage = async (chat: string, text: string): Promise<boolean> => {
    if (!connected) return false;
    const action: UrbitAction = {
      id: nextId++,
      action: "poke",
      ship,
      app: chatApp,
      mark: "chat-message",
      json: {
        chat,
        text,
      },
    };
    try {
      await postActions([action]);
      return true;
    } catch {
      return false;
    }
  };

  const send = (text: string): Promise<boolean> => sendMessage(defaultChat, text);

  const onMessage = (handler: (event: TlonMessageEvent) => void): (() => void) => {
    handlers.add(handler);
    return () => handlers.delete(handler);
  };

  const isConnected = (): boolean => connected;

  return {
    connect,
    disconnect,
    sendMessage,
    send,
    onMessage,
    isConnected,
  };
}
