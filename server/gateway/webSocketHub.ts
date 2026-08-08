/**
 * Gateway WebSocket Hub
 * Gateway WebSocket 实时通信中心
 * 
 * 功能：
 * - 多客户端连接管理
 * - 会话同步（多端会话状态同步）
 * - 实时事件广播
 * - 统一协议调用（与 HTTP 共享方法注册中心）
 */

import type { Server as HttpServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { GatewayMethodContext, GatewayMethodResult } from "./types.js";
import { invokeGatewayMethod } from "./methodRegistry.js";
import {
  authenticateWs,
  authenticateWebSocket,
  checkFloodGuard,
  configureWsAuth,
  getWsAuthConfig,
  releaseFloodGuard,
  type WsAuthConfig,
} from "./wsAuth.js";

export { configureWsAuth, getWsAuthConfig, authenticateWebSocket };
export type { WsAuthConfig };

export interface WebSocketClient {
  id: string;
  socket: {
    send: (data: string) => void;
    close: (code?: number, reason?: string) => void;
    readyState: number;
    on?: (event: string, handler: (...args: any[]) => void) => void;
    off?: (event: string, handler: (...args: any[]) => void) => void;
  };
  sessionKeys: Set<string>;
  userId?: string;
  connectedAt: number;
  lastActiveAt: number;
  /** 是否已完成 WS 独立认证 */
  authenticated: boolean;
  /** 客户端 IP（用于 flood guard 释放） */
  remoteIp?: string;
  context: GatewayMethodContext;
  metadata: Record<string, any>;
}

export interface WebSocketMessage {
  type: "request" | "response" | "event" | "error" | "auth";
  id?: string;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: string;
    message: string;
    data?: any;
  };
  event?: string;
  data?: any;
  /** 认证字段，仅 type=auth 时使用 */
  auth?: {
    mode?: "token" | "password" | "tailscale" | "device-token" | "bootstrap-token" | "trusted-proxy";
    token?: string;
    password?: string;
    /** device-token 模式凭证（device.<deviceId>.<token>） */
    deviceToken?: string;
    /** bootstrap-token 模式凭证 */
    bootstrapToken?: string;
  };
  timestamp: number;
}

export interface SessionSyncEvent {
  type: "session:update" | "session:create" | "session:delete";
  sessionKey: string;
  data?: any;
  sourceClientId?: string;
  timestamp: number;
}

export type WebSocketHubEvent =
  | "client:connected"
  | "client:authenticated"
  | "client:disconnected"
  | "session:subscribed"
  | "session:unsubscribed"
  | "message:received"
  | "event:broadcast";

export type TaskMonitorEventType =
  | "todo_created"
  | "todo_updated"
  | "todo_deleted"
  | "artifact_created"
  | "artifact_deleted"
  | "tool_call_created"
  | "tool_call_updated"
  | "trajectory_event_created"
  | "plan_created"
  | "plan_updated"
  | "plan_revised"
  | "task_flow_created"
  | "task_flow_updated"
  | "instance_updated";

export interface TaskMonitorEvent {
  type: TaskMonitorEventType;
  sessionId: string;
  payload: any;
  timestamp: number;
}

const READY_STATE_OPEN = 1;

type EventHandler = (...args: any[]) => void;

class WebSocketHub {
  private readonly clients = new Map<string, WebSocketClient>();
  private readonly sessionSubscribers = new Map<string, Set<string>>();
  private readonly taskMonitorSubscribers = new Map<string, Set<string>>();
  private readonly eventListeners = new Map<WebSocketHubEvent, Set<EventHandler>>();
  private wss: any = null;
  private httpServer: HttpServer | null = null;

  async start(httpServer: HttpServer): Promise<void> {
    this.httpServer = httpServer;

    try {
      const wsModule = await import("ws" as string) as any;
      const WebSocketServer = wsModule.WebSocketServer;
      this.wss = new WebSocketServer({
        server: httpServer,
        path: "/gateway/ws",
        // 在 handleUpgrade 之前执行预认证：flood guard + token/password 校验
        verifyClient: (
          info: { req: IncomingMessage },
          cb: (allowed: boolean, code?: number, reason?: string) => void,
        ) => {
          const req = info.req;
          const remoteIp = resolveRemoteIp(req);

          // 1) Flood guard：限制单 IP 每分钟连接数
          const flood = checkFloodGuard(remoteIp);
          if (!flood.allowed) {
            console.warn(
              `[gateway] WS flood guard rejected ip=${remoteIp} retry=${flood.retryAfterSec ?? 60}s`,
            );
            cb(false, 429, `flood guard: retry after ${flood.retryAfterSec ?? 60}s`);
            return;
          }

          // 2) 预认证：验证 token / password / device-token / bootstrap-token
          //    authenticateWebSocket 现为 async（device-token/tailscale 需异步校验）
          void authenticateWebSocket(req).then((auth) => {
            if (!auth.authenticated) {
              console.warn(
                `[gateway] WS auth rejected ip=${remoteIp} reason=${auth.reason ?? "unknown"}`,
              );
              cb(false, 401, auth.reason ?? "unauthorized");
              return;
            }

            cb(true);
          });
        },
      });

      (this.wss as { on: (event: string, handler: (ws: any, req: IncomingMessage) => void) => void }).on(
        "connection",
        (ws: any, req: IncomingMessage) => void this.handleConnection(ws, req),
      );
      console.log("[gateway] WebSocket server started on /gateway/ws");
    } catch {
      console.warn("[gateway] ws module not available, WebSocket disabled");
    }
  }

  stop(): void {
    if (this.wss && typeof (this.wss as { close: () => void }).close === "function") {
      (this.wss as { close: () => void }).close();
    }
    this.clients.clear();
    this.sessionSubscribers.clear();
    this.eventListeners.clear();
  }

  on(event: WebSocketHubEvent, handler: EventHandler): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: WebSocketHubEvent, handler: EventHandler): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(handler);
    }
  }

  private emit(event: WebSocketHubEvent, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const handler of listeners) {
        try {
          handler(...args);
        } catch {
          // ignore
        }
      }
    }
  }

  private async handleConnection(ws: any, req: IncomingMessage): Promise<void> {
    const clientId = this.generateClientId();
    const now = Date.now();
    const authConfig = getWsAuthConfig();
    const remoteIp = resolveRemoteIp(req);

    // verifyClient 已在升级前完成 flood guard 与预认证；
    // 此处复用 authenticateWebSocket 解析认证状态（与 verifyClient 逻辑一致）
    const initialAuth = await authenticateWebSocket(req);

    const client: WebSocketClient = {
      id: clientId,
      socket: ws as WebSocketClient["socket"],
      sessionKeys: new Set(),
      connectedAt: now,
      lastActiveAt: now,
      // 已禁用认证 或 HTTP 升级时已通过认证 → 视为已认证；否则等待握手消息
      authenticated: !authConfig.enabled || initialAuth.authenticated,
      remoteIp,
      context: {
        requestId: clientId,
        timestamp: now,
      },
      metadata: {},
    };

    // 连接成功日志
    console.log(
      `[gateway] WS connected client=${clientId} ip=${remoteIp} authenticated=${client.authenticated}`,
    );

    this.clients.set(clientId, client);

    const wsAny = ws as {
      on: (event: string, handler: (...args: any[]) => void) => void;
    };

    wsAny.on("message", async (data: any) => {
      await this.handleMessage(client, data);
    });

    wsAny.on("close", () => {
      // 释放 flood guard 计数，避免正常短连接被误伤
      releaseFloodGuard(remoteIp);
      this.handleDisconnect(client);
    });

    wsAny.on("error", () => {
      releaseFloodGuard(remoteIp);
      this.handleDisconnect(client);
    });

    // 3) 发送 connect.challenge：客户端需在 handshakeTimeoutMs 内回 auth 消息（启用认证时）
    this.sendToClient(client, {
      type: "event",
      event: "connect.challenge",
      data: {
        clientId,
        authRequired: authConfig.enabled,
        modes: authConfig.enabled
          ? [
              ...(authConfig.tokens.length > 0 ? (["token"] as const) : []),
              ...(authConfig.passwords.length > 0 ? (["password"] as const) : []),
            ]
          : [],
        handshakeTimeoutMs: authConfig.handshakeTimeoutMs,
        supportedMethods: [
          "session.subscribe",
          "session.unsubscribe",
          "session.sync",
          "task-monitor.subscribe",
          "task-monitor.unsubscribe",
        ],
      },
      timestamp: Date.now(),
    });

    // 3.5) 如果认证未启用，立即发送 connected 事件
    if (!authConfig.enabled) {
      this.sendToClient(client, {
        type: "event",
        event: "connected",
        data: { clientId },
        timestamp: Date.now(),
      });
    }

    // 4) 启用认证时设置握手超时定时器
    if (authConfig.enabled && !client.authenticated) {
      const timer = setTimeout(() => {
        if (!client.authenticated) {
          try {
            client.socket.close(1008, "auth handshake timeout");
          } catch {
            // ignore
          }
        }
      }, authConfig.handshakeTimeoutMs);
      // socket 关闭后清理定时器
      const cleanup = () => clearTimeout(timer);
      wsAny.on?.("close", cleanup);
      wsAny.on?.("error", cleanup);
    }

    this.emit("client:connected", client);
  }

  private async handleMessage(client: WebSocketClient, data: any): Promise<void> {
    client.lastActiveAt = Date.now();

    let message: WebSocketMessage;
    try {
      const raw = typeof data === "string" ? data : (data as Buffer)?.toString?.("utf8") ?? "";
      message = JSON.parse(raw);
    } catch {
      this.sendToClient(client, {
        type: "error",
        error: {
          code: "INVALID_MESSAGE",
          message: "Invalid JSON message",
        },
        timestamp: Date.now(),
      });
      return;
    }

    this.emit("message:received", client, message);

    // 1) 认证消息：先处理，不需要 authenticated 前置
    if (message.type === "auth") {
      void this.handleAuthMessage(client, message);
      return;
    }

    // 2) 已启用认证但客户端未通过认证 → 除 auth 外其余消息一律拒绝
    if (getWsAuthConfig().enabled && !client.authenticated) {
      this.sendToClient(client, {
        type: "error",
        id: message.id,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required. Send type=auth message first.",
        },
        timestamp: Date.now(),
      });
      return;
    }

    if (message.type === "request" && message.method) {
      if (message.method === "session.subscribe") {
        this.handleSessionSubscribe(client, message);
        return;
      }
      if (message.method === "session.unsubscribe") {
        this.handleSessionUnsubscribe(client, message);
        return;
      }
      if (message.method === "session.sync") {
        this.handleSessionSync(client, message);
        return;
      }
      if (message.method === "task-monitor.subscribe") {
        this.handleTaskMonitorSubscribe(client, message);
        return;
      }
      if (message.method === "task-monitor.unsubscribe") {
        this.handleTaskMonitorUnsubscribe(client, message);
        return;
      }

      const result = await invokeGatewayMethod(
        message.method,
        message.params ?? {},
        {
          ...client.context,
          sessionKey: client.sessionKeys.size > 0 ? Array.from(client.sessionKeys)[0] : undefined,
          userId: client.userId,
        },
      );

      const response: WebSocketMessage = {
        type: "response",
        id: message.id,
        result: result.ok ? result.result : undefined,
        error: !result.ok ? result.error : undefined,
        timestamp: Date.now(),
      };

      this.sendToClient(client, response);
    }

    if (message.type === "event" && message.event) {
      this.handleClientEvent(client, message);
    }
  }

  private handleSessionSubscribe(client: WebSocketClient, message: WebSocketMessage): void {
    const params = message.params as { sessionKey?: string; sessionKeys?: string[] } | undefined;
    const sessionKeys: string[] = [];

    if (params?.sessionKey) {
      sessionKeys.push(params.sessionKey);
    }
    if (params?.sessionKeys && Array.isArray(params.sessionKeys)) {
      sessionKeys.push(...params.sessionKeys);
    }

    if (sessionKeys.length === 0) {
      this.sendToClient(client, {
        type: "response",
        id: message.id,
        error: {
          code: "INVALID_PARAMS",
          message: "sessionKey or sessionKeys is required",
        },
        timestamp: Date.now(),
      });
      return;
    }

    for (const sessionKey of sessionKeys) {
      this.subscribeToSession(client.id, sessionKey);
    }

    this.sendToClient(client, {
      type: "response",
      id: message.id,
      result: {
        subscribed: true,
        sessionKeys: Array.from(client.sessionKeys),
      },
      timestamp: Date.now(),
    });
  }

  private handleSessionUnsubscribe(client: WebSocketClient, message: WebSocketMessage): void {
    const params = message.params as { sessionKey?: string; sessionKeys?: string[]; all?: boolean } | undefined;

    if (params?.all) {
      const keys = Array.from(client.sessionKeys);
      for (const sessionKey of keys) {
        this.unsubscribeFromSession(client.id, sessionKey);
      }
    } else {
      const sessionKeys: string[] = [];
      if (params?.sessionKey) sessionKeys.push(params.sessionKey);
      if (params?.sessionKeys && Array.isArray(params.sessionKeys)) {
        sessionKeys.push(...params.sessionKeys);
      }
      for (const sessionKey of sessionKeys) {
        this.unsubscribeFromSession(client.id, sessionKey);
      }
    }

    this.sendToClient(client, {
      type: "response",
      id: message.id,
      result: {
        unsubscribed: true,
        sessionKeys: Array.from(client.sessionKeys),
      },
      timestamp: Date.now(),
    });
  }

  private handleTaskMonitorSubscribe(client: WebSocketClient, message: WebSocketMessage): void {
    const params = message.params as { sessionId?: string } | undefined;

    if (!params?.sessionId) {
      this.sendToClient(client, {
        type: "response",
        id: message.id,
        error: {
          code: "INVALID_PARAMS",
          message: "sessionId is required",
        },
        timestamp: Date.now(),
      });
      return;
    }

    const subscribed = this.subscribeToTaskMonitor(client.id, params.sessionId);

    this.sendToClient(client, {
      type: "response",
      id: message.id,
      result: {
        subscribed,
        sessionId: params.sessionId,
      },
      timestamp: Date.now(),
    });
  }

  private handleTaskMonitorUnsubscribe(client: WebSocketClient, message: WebSocketMessage): void {
    const params = message.params as { sessionId?: string } | undefined;

    if (!params?.sessionId) {
      this.sendToClient(client, {
        type: "response",
        id: message.id,
        error: {
          code: "INVALID_PARAMS",
          message: "sessionId is required",
        },
        timestamp: Date.now(),
      });
      return;
    }

    const unsubscribed = this.unsubscribeFromTaskMonitor(client.id, params.sessionId);

    this.sendToClient(client, {
      type: "response",
      id: message.id,
      result: {
        unsubscribed,
        sessionId: params.sessionId,
      },
      timestamp: Date.now(),
    });
  }

  private handleSessionSync(client: WebSocketClient, message: WebSocketMessage): void {
    const params = message.params as { sessionKey: string; data: any; type?: string } | undefined;

    if (!params?.sessionKey) {
      this.sendToClient(client, {
        type: "response",
        id: message.id,
        error: {
          code: "INVALID_PARAMS",
          message: "sessionKey is required",
        },
        timestamp: Date.now(),
      });
      return;
    }

    if (!client.sessionKeys.has(params.sessionKey)) {
      this.sendToClient(client, {
        type: "response",
        id: message.id,
        error: {
          code: "NOT_SUBSCRIBED",
          message: "Not subscribed to this session",
        },
        timestamp: Date.now(),
      });
      return;
    }

    const event: WebSocketMessage = {
      type: "event",
      event: params.type || "session:update",
      data: params.data,
      timestamp: Date.now(),
    };

    const recipientCount = this.sendToSession(params.sessionKey, event, client.id);

    this.sendToClient(client, {
      type: "response",
      id: message.id,
      result: {
        synced: true,
        recipientCount,
      },
      timestamp: Date.now(),
    });
  }

  private handleClientEvent(client: WebSocketClient, message: WebSocketMessage): void {
    if (message.event && message.event.startsWith("session:")) {
      const data = message.data as { sessionKey?: string } | undefined;
      if (data?.sessionKey && client.sessionKeys.has(data.sessionKey)) {
        this.sendToSession(data.sessionKey, message, client.id);
      }
    }
  }

  /**
   * 处理 WS 认证握手消息。
 * - 已认证：直接回 ok
 * - 认证成功：标记 authenticated=true，回 auth.success
 * - 认证失败：回 auth.failed，客户端可重试或断开
 */
  private async handleAuthMessage(client: WebSocketClient, message: WebSocketMessage): Promise<void> {
    if (client.authenticated) {
      this.sendToClient(client, {
        type: "response",
        id: message.id,
        result: { authenticated: true, mode: "already" },
        timestamp: Date.now(),
      });
      return;
    }
    const input = message.auth ?? {};
    const result = await authenticateWs({
      mode: input.mode,
      token: input.token,
      password: input.password,
      deviceToken: input.deviceToken,
      bootstrapToken: input.bootstrapToken,
    });
    if (result.ok) {
      client.authenticated = true;
      this.sendToClient(client, {
        type: "response",
        id: message.id,
        result: { authenticated: true, mode: result.mode },
        timestamp: Date.now(),
      });
      this.emit("client:authenticated", client);
    } else {
      this.sendToClient(client, {
        type: "response",
        id: message.id,
        error: {
          code: "AUTH_FAILED",
          message: result.reason ?? "authentication failed",
          data: { mode: result.mode, retryAfterSec: result.retryAfterSec },
        },
        timestamp: Date.now(),
      });
    }
  }

  private handleDisconnect(client: WebSocketClient): void {
    // 连接断开日志
    console.log(
      `[gateway] WS disconnected client=${client.id} ip=${client.remoteIp ?? "unknown"}`,
    );
    this.clients.delete(client.id);

    for (const sessionKey of client.sessionKeys) {
      const subscribers = this.sessionSubscribers.get(sessionKey);
      if (subscribers) {
        subscribers.delete(client.id);
        if (subscribers.size === 0) {
          this.sessionSubscribers.delete(sessionKey);
        }
      }
    }

    this.unsubscribeClientFromAllTaskMonitors(client.id);

    client.sessionKeys.clear();
    this.emit("client:disconnected", client);
  }

  sendToClient(client: WebSocketClient, message: WebSocketMessage): void {
    if (client.socket.readyState !== READY_STATE_OPEN) {
      return;
    }
    try {
      client.socket.send(JSON.stringify(message));
    } catch {
      // 忽略发送错误
    }
  }

  sendToClientById(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    this.sendToClient(client, message);
    return true;
  }

  sendToSession(sessionKey: string, message: WebSocketMessage, excludeClientId?: string): number {
    const subscribers = this.sessionSubscribers.get(sessionKey);
    if (!subscribers) {
      return 0;
    }

    let sent = 0;
    for (const clientId of subscribers) {
      if (excludeClientId && clientId === excludeClientId) continue;
      const client = this.clients.get(clientId);
      if (client && client.socket.readyState === READY_STATE_OPEN) {
        this.sendToClient(client, message);
        sent++;
      }
    }
    return sent;
  }

  sendToSessions(sessionKeys: string[], message: WebSocketMessage, excludeClientId?: string): number {
    let totalSent = 0;
    for (const sessionKey of sessionKeys) {
      totalSent += this.sendToSession(sessionKey, message, excludeClientId);
    }
    return totalSent;
  }

  broadcast(message: WebSocketMessage): number {
    let sent = 0;
    for (const client of this.clients.values()) {
      if (client.socket.readyState === READY_STATE_OPEN) {
        this.sendToClient(client, message);
        sent++;
      }
    }
    this.emit("event:broadcast", message, sent);
    return sent;
  }

  broadcastEvent(event: string, data?: any): number {
    const message: WebSocketMessage = {
      type: "event",
      event,
      data,
      timestamp: Date.now(),
    };
    return this.broadcast(message);
  }

  sendSessionEvent(sessionKey: string, event: string, data?: any, excludeClientId?: string): number {
    const message: WebSocketMessage = {
      type: "event",
      event,
      data,
      timestamp: Date.now(),
    };
    return this.sendToSession(sessionKey, message, excludeClientId);
  }

  subscribeToSession(clientId: string, sessionKey: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    if (client.sessionKeys.has(sessionKey)) {
      return true;
    }

    client.sessionKeys.add(sessionKey);

    let subscribers = this.sessionSubscribers.get(sessionKey);
    if (!subscribers) {
      subscribers = new Set();
      this.sessionSubscribers.set(sessionKey, subscribers);
    }
    subscribers.add(clientId);

    this.emit("session:subscribed", client, sessionKey);
    return true;
  }

  unsubscribeFromSession(clientId: string, sessionKey: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    if (!client.sessionKeys.has(sessionKey)) {
      return false;
    }

    client.sessionKeys.delete(sessionKey);

    const subscribers = this.sessionSubscribers.get(sessionKey);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.sessionSubscribers.delete(sessionKey);
      }
    }

    this.emit("session:unsubscribed", client, sessionKey);
    return true;
  }

  getClient(clientId: string): WebSocketClient | undefined {
    return this.clients.get(clientId);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getSessionSubscriberCount(sessionKey: string): number {
    return this.sessionSubscribers.get(sessionKey)?.size ?? 0;
  }

  getSessionKeys(): string[] {
    return Array.from(this.sessionSubscribers.keys());
  }

  getClientSessionKeys(clientId: string): string[] {
    const client = this.clients.get(clientId);
    return client ? Array.from(client.sessionKeys) : [];
  }

  setClientUserId(clientId: string, userId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    client.userId = userId;
    return true;
  }

  setClientMetadata(clientId: string, metadata: Record<string, any>): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    client.metadata = { ...client.metadata, ...metadata };
    return true;
  }

  subscribeToTaskMonitor(clientId: string, sessionId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    let subscribers = this.taskMonitorSubscribers.get(sessionId);
    if (!subscribers) {
      subscribers = new Set();
      this.taskMonitorSubscribers.set(sessionId, subscribers);
    }
    subscribers.add(clientId);

    return true;
  }

  unsubscribeFromTaskMonitor(clientId: string, sessionId: string): boolean {
    const subscribers = this.taskMonitorSubscribers.get(sessionId);
    if (!subscribers || !subscribers.has(clientId)) {
      return false;
    }

    subscribers.delete(clientId);
    if (subscribers.size === 0) {
      this.taskMonitorSubscribers.delete(sessionId);
    }

    return true;
  }

  unsubscribeClientFromAllTaskMonitors(clientId: string): void {
    for (const [sessionId, subscribers] of this.taskMonitorSubscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.taskMonitorSubscribers.delete(sessionId);
      }
    }
  }

  publishTaskMonitorEvent(event: TaskMonitorEvent): number {
    const subscribers = this.taskMonitorSubscribers.get(event.sessionId);
    if (!subscribers) {
      return 0;
    }

    const message: WebSocketMessage = {
      type: "event",
      event: `task-monitor:${event.type}`,
      data: {
        type: event.type,
        sessionId: event.sessionId,
        payload: event.payload,
        timestamp: event.timestamp,
      },
      timestamp: event.timestamp,
    };

    let sent = 0;
    for (const clientId of subscribers) {
      const client = this.clients.get(clientId);
      if (client && client.socket.readyState === READY_STATE_OPEN) {
        this.sendToClient(client, message);
        sent++;
      }
    }

    return sent;
  }

  getTaskMonitorSubscriberCount(sessionId: string): number {
    return this.taskMonitorSubscribers.get(sessionId)?.size ?? 0;
  }

  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

const WS_HUB_INSTANCE = new WebSocketHub();

export function getWebSocketHub(): WebSocketHub {
  return WS_HUB_INSTANCE;
}

export async function startGatewayWebSocket(httpServer: HttpServer): Promise<void> {
  await WS_HUB_INSTANCE.start(httpServer);
}

export function stopGatewayWebSocket(): void {
  WS_HUB_INSTANCE.stop();
}

// ==================== 辅助函数 ====================

function extractHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

/** 从 Authorization 头中剥离 "Bearer " 前缀，返回纯 token */
function stripBearer(header: string): string {
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1].trim();
  }
  return header.trim();
}

/** 解析客户端真实 IP（x-forwarded-for > x-real-ip > socket.remoteAddress） */
function resolveRemoteIp(req: IncomingMessage): string {
  const xff = extractHeader(req, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  const xri = extractHeader(req, "x-real-ip");
  if (xri) return xri;
  return req.socket?.remoteAddress ?? "unknown";
}
