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
import type { GatewayMethodContext, GatewayMethodResult } from "./types.js";
import { invokeGatewayMethod } from "./methodRegistry.js";

export interface WebSocketClient {
  id: string;
  socket: {
    send: (data: string) => void;
    close: (code?: number, reason?: string) => void;
    readyState: number;
  };
  sessionKeys: Set<string>;
  userId?: string;
  connectedAt: number;
  lastActiveAt: number;
  context: GatewayMethodContext;
  metadata: Record<string, unknown>;
}

export interface WebSocketMessage {
  type: "request" | "response" | "event" | "error";
  id?: string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    data?: unknown;
  };
  event?: string;
  data?: unknown;
  timestamp: number;
}

export interface SessionSyncEvent {
  type: "session:update" | "session:create" | "session:delete";
  sessionKey: string;
  data?: unknown;
  sourceClientId?: string;
  timestamp: number;
}

export type WebSocketHubEvent = 
  | "client:connected"
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
  payload: unknown;
  timestamp: number;
}

const READY_STATE_OPEN = 1;

type EventHandler = (...args: unknown[]) => void;

class WebSocketHub {
  private readonly clients = new Map<string, WebSocketClient>();
  private readonly sessionSubscribers = new Map<string, Set<string>>();
  private readonly taskMonitorSubscribers = new Map<string, Set<string>>();
  private readonly eventListeners = new Map<WebSocketHubEvent, Set<EventHandler>>();
  private wss: unknown = null;
  private httpServer: HttpServer | null = null;

  async start(httpServer: HttpServer): Promise<void> {
    this.httpServer = httpServer;

    try {
      const wsModule = await import("ws" as string) as any;
      const WebSocketServer = wsModule.WebSocketServer;
      this.wss = new WebSocketServer({
        server: httpServer,
        path: "/gateway/ws",
      });

      (this.wss as { on: (event: string, handler: (ws: unknown) => void) => void }).on(
        "connection",
        (ws: unknown) => this.handleConnection(ws),
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

  private emit(event: WebSocketHubEvent, ...args: unknown[]): void {
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

  private handleConnection(ws: unknown): void {
    const clientId = this.generateClientId();
    const now = Date.now();

    const client: WebSocketClient = {
      id: clientId,
      socket: ws as WebSocketClient["socket"],
      sessionKeys: new Set(),
      connectedAt: now,
      lastActiveAt: now,
      context: {
        requestId: clientId,
        timestamp: now,
      },
      metadata: {},
    };

    this.clients.set(clientId, client);

    const wsAny = ws as {
      on: (event: string, handler: (...args: unknown[]) => void) => void;
    };

    wsAny.on("message", async (data: unknown) => {
      await this.handleMessage(client, data);
    });

    wsAny.on("close", () => {
      this.handleDisconnect(client);
    });

    wsAny.on("error", () => {
      this.handleDisconnect(client);
    });

    this.sendToClient(client, {
      type: "event",
      event: "connected",
      data: { 
        clientId,
        supportedMethods: ["session.subscribe", "session.unsubscribe", "session.sync", "task-monitor.subscribe", "task-monitor.unsubscribe"],
      },
      timestamp: Date.now(),
    });

    this.emit("client:connected", client);
  }

  private async handleMessage(client: WebSocketClient, data: unknown): Promise<void> {
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
    const params = message.params as { sessionKey: string; data: unknown; type?: string } | undefined;

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

  private handleDisconnect(client: WebSocketClient): void {
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

  broadcastEvent(event: string, data?: unknown): number {
    const message: WebSocketMessage = {
      type: "event",
      event,
      data,
      timestamp: Date.now(),
    };
    return this.broadcast(message);
  }

  sendSessionEvent(sessionKey: string, event: string, data?: unknown, excludeClientId?: string): number {
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

  setClientMetadata(clientId: string, metadata: Record<string, unknown>): boolean {
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
