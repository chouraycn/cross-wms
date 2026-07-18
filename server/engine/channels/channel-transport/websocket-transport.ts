import { WebSocket, WebSocketServer } from "ws";
import { logger } from "../../../logger.js";
import type { ChannelTransport, TransportConfig, TransportMessage, TransportResponse, TransportEvent, TransportStats, TransportStatus } from "./types.js";

export class WebSocketTransport implements ChannelTransport {
  id: string;
  type = "websocket" as const;
  config: TransportConfig;
  status: TransportStatus = "disconnected";

  private socket: WebSocket | null = null;
  private server: WebSocketServer | null = null;
  private isServer = false;

  private stats: TransportStats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    connectionAttempts: 0,
    errorCount: 0,
  };

  private eventHandlers = new Map<string, Array<(event: TransportEvent) => void>>();
  private retryCount = 0;
  private messageQueue: TransportMessage[] = [];

  constructor(config: TransportConfig, isServer = false) {
    this.id = `ws-${config.host}-${config.port}`;
    this.config = config;
    this.isServer = isServer;
  }

  async connect(): Promise<void> {
    this.status = "connecting";
    this.stats.connectionAttempts++;

    try {
      if (this.isServer) {
        await this.startServer();
      } else {
        await this.connectClient();
      }

      this.status = "connected";
      this.stats.lastConnectedAt = Date.now();
      logger.info(`[ChannelTransport:WebSocket] Connected to ${this.id}`);
      this.emitEvent("connected");
      this.flushQueue();
    } catch (error) {
      this.status = "error";
      this.stats.errorCount++;
      logger.error(`[ChannelTransport:WebSocket] Failed to connect to ${this.id}`, { error });
      this.emitEvent("error", { error });

      if (!this.isServer && this.shouldRetry()) {
        await this.retry();
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.status = "disconnected";
    logger.info(`[ChannelTransport:WebSocket] Disconnected from ${this.id}`);
    this.emitEvent("disconnected");
  }

  isConnected(): boolean {
    return this.status === "connected" && this.socket?.readyState === 1;
  }

  async send(message: TransportMessage): Promise<TransportResponse> {
    if (!this.isConnected()) {
      this.messageQueue.push(message);
      return { success: false, message: "Not connected, message queued" };
    }

    try {
      const body = JSON.stringify(message);
      this.socket!.send(body);

      this.stats.messagesSent++;
      this.stats.bytesSent += body.length;
      this.stats.lastMessageAt = Date.now();

      return { success: true };
    } catch (error) {
      this.stats.errorCount++;
      logger.error(`[ChannelTransport:WebSocket] Send failed for ${this.id}`, { error });
      this.emitEvent("error", { error });

      return { success: false, message: (error as Error).message };
    }
  }

  async *receive(): AsyncIterable<TransportMessage> {
    if (!this.isConnected()) return;

    const messages: TransportMessage[] = [];

    const handler = (data: unknown) => {
      try {
        const dataStr = (data as Buffer | string).toString();
        const message = JSON.parse(dataStr) as TransportMessage;
        messages.push(message);
        this.stats.messagesReceived++;
        this.stats.bytesReceived += dataStr.length;
        this.stats.lastMessageAt = Date.now();
        this.emitEvent("message", { message });
      } catch (error) {
        logger.error(`[ChannelTransport:WebSocket] Failed to parse message`, { error });
      }
    };

    this.socket!.on("message", handler);

    while (this.isConnected()) {
      if (messages.length > 0) {
        yield messages.shift()!;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.socket!.off("message", handler);
  }

  on(event: string, handler: (event: TransportEvent) => void): void {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  off(event: string, handler: (event: TransportEvent) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;
    const idx = handlers.findIndex((h) => h === handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  getStats(): TransportStats {
    return { ...this.stats };
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({
        host: this.config.host,
        port: this.config.port,
      });

      this.server.on("connection", (socket) => {
        this.socket = socket;
        socket.on("close", () => {
          this.status = "disconnected";
          this.emitEvent("disconnected");
        });
        socket.on("error", (error) => {
          this.stats.errorCount++;
          this.emitEvent("error", { error });
        });
      });

      this.server.on("error", reject);
      this.server.on("listening", resolve);
    });
  }

  private async connectClient(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = this.config.tls ? "wss" : "ws";
      const url = `${protocol}://${this.config.host}:${this.config.port}${this.config.path ?? ""}`;

      this.socket = new WebSocket(url, {
        headers: this.buildHeaders(),
      });

      this.socket.on("open", resolve);
      this.socket.on("error", reject);
      this.socket.on("close", () => {
        this.status = "disconnected";
        this.emitEvent("disconnected");
      });

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, this.config.timeoutMs ?? 10000);

      this.socket.on("open", () => clearTimeout(timeout));
      this.socket.on("error", () => clearTimeout(timeout));
    });
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...this.config.headers };

    if (this.config.auth) {
      switch (this.config.auth.type) {
        case "basic":
          if (this.config.auth.username && this.config.auth.password) {
            headers["Authorization"] = `Basic ${Buffer.from(`${this.config.auth.username}:${this.config.auth.password}`).toString("base64")}`;
          }
          break;
        case "bearer":
          if (this.config.auth.token) {
            headers["Authorization"] = `Bearer ${this.config.auth.token}`;
          }
          break;
        case "api-key":
          if (this.config.auth.apiKey) {
            headers[this.config.auth.apiKeyHeader ?? "X-API-Key"] = this.config.auth.apiKey;
          }
          break;
      }
    }

    return headers;
  }

  private shouldRetry(): boolean {
    const maxRetries = this.config.maxRetries ?? 3;
    return this.retryCount < maxRetries;
  }

  private async retry(): Promise<void> {
    this.retryCount++;
    const delay = this.config.retryDelayMs ?? 1000 * Math.pow(2, this.retryCount - 1);
    logger.info(`[ChannelTransport:WebSocket] Retrying connection (attempt ${this.retryCount}) in ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    await this.connect();
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift()!;
      this.send(message).catch(() => {});
    }
  }

  private emitEvent(type: TransportEvent["type"], data?: unknown): void {
    const handlers = this.eventHandlers.get(type);
    if (!handlers) return;

    const event: TransportEvent = { type, data, timestamp: Date.now() };
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        logger.error(`[ChannelTransport:WebSocket] Event handler failed for ${type}`, { error });
      }
    }
  }
}