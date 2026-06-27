/**
 * Gateway WebSocket Hub
 * Gateway WebSocket 实时通信中心
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
  sessionKey?: string;
  userId?: string;
  connectedAt: number;
  lastActiveAt: number;
  context: GatewayMethodContext;
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
  };
  event?: string;
  data?: unknown;
  timestamp: number;
}

const READY_STATE_OPEN = 1;

class WebSocketHub {
  private readonly clients = new Map<string, WebSocketClient>();
  private readonly sessionSubscribers = new Map<string, Set<string>>();
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
  }

  private handleConnection(ws: unknown): void {
    const clientId = this.generateClientId();
    const now = Date.now();

    const client: WebSocketClient = {
      id: clientId,
      socket: ws as WebSocketClient["socket"],
      connectedAt: now,
      lastActiveAt: now,
      context: {
        requestId: clientId,
        timestamp: now,
      },
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
      data: { clientId },
      timestamp: Date.now(),
    });
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

    if (message.type === "request" && message.method) {
      const result = await invokeGatewayMethod(
        message.method,
        message.params ?? {},
        {
          ...client.context,
          sessionKey: client.sessionKey,
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
  }

  private handleDisconnect(client: WebSocketClient): void {
    this.clients.delete(client.id);

    if (client.sessionKey) {
      const subscribers = this.sessionSubscribers.get(client.sessionKey);
      if (subscribers) {
        subscribers.delete(client.id);
        if (subscribers.size === 0) {
          this.sessionSubscribers.delete(client.sessionKey);
        }
      }
    }
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

  sendToSession(sessionKey: string, message: WebSocketMessage): number {
    const subscribers = this.sessionSubscribers.get(sessionKey);
    if (!subscribers) {
      return 0;
    }

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

  broadcast(message: WebSocketMessage): number {
    let sent = 0;
    for (const client of this.clients.values()) {
      if (client.socket.readyState === READY_STATE_OPEN) {
        this.sendToClient(client, message);
        sent++;
      }
    }
    return sent;
  }

  subscribeToSession(clientId: string, sessionKey: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    client.sessionKey = sessionKey;

    let subscribers = this.sessionSubscribers.get(sessionKey);
    if (!subscribers) {
      subscribers = new Set();
      this.sessionSubscribers.set(sessionKey, subscribers);
    }
    subscribers.add(clientId);
    return true;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getSessionSubscriberCount(sessionKey: string): number {
    return this.sessionSubscribers.get(sessionKey)?.size ?? 0;
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
