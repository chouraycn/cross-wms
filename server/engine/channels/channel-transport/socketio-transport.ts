import { logger } from "../../../logger.js";
import type { ChannelTransport, TransportConfig, TransportMessage, TransportResponse, TransportEvent, TransportStats, TransportStatus } from "./types.js";

export class SocketIoTransport implements ChannelTransport {
  id: string;
  type = "socketio" as const;
  config: TransportConfig;
  status: TransportStatus = "disconnected";

  private socket: any = null;
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
    this.id = `socketio-${config.host}-${config.port}`;
    this.config = config;
    this.isServer = isServer;
  }

  async connect(): Promise<void> {
    this.status = "connecting";
    this.stats.connectionAttempts++;

    try {
      // @ts-expect-error optional dependency
      const socketIo = await import("socket.io").catch(() => null);
      if (!socketIo) {
        throw new Error("socket.io not installed");
      }

      const { io, Server } = socketIo;

      if (this.isServer) {
        const http = await import("http");
        const server = http.createServer();
        this.socket = new Server(server, {
          path: this.config.path ?? "/socket.io",
        });
        server.listen(this.config.port, this.config.host);
      } else {
        const protocol = this.config.tls ? "https" : "http";
        const url = `${protocol}://${this.config.host}:${this.config.port}`;
        this.socket = io(url, {
          path: this.config.path ?? "/socket.io",
          transports: ["websocket"],
          extraHeaders: this.buildHeaders(),
        });

        await new Promise((resolve, reject) => {
          this.socket.on("connect", resolve);
          this.socket.on("connect_error", reject);

          const timeout = setTimeout(() => {
            reject(new Error("Connection timeout"));
          }, this.config.timeoutMs ?? 10000);

          this.socket.on("connect", () => clearTimeout(timeout));
          this.socket.on("connect_error", () => clearTimeout(timeout));
        });
      }

      this.status = "connected";
      this.stats.lastConnectedAt = Date.now();
      logger.info(`[ChannelTransport:SocketIO] Connected to ${this.id}`);
      this.emitEvent("connected");
      this.flushQueue();
    } catch (error) {
      this.status = "error";
      this.stats.errorCount++;
      logger.error(`[ChannelTransport:SocketIO] Failed to connect to ${this.id}`, { error });
      this.emitEvent("error", { error });

      if (!this.isServer && this.shouldRetry()) {
        await this.retry();
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      if (this.isServer) {
        this.socket.close();
      } else {
        this.socket.disconnect();
      }
      this.socket = null;
    }

    this.status = "disconnected";
    logger.info(`[ChannelTransport:SocketIO] Disconnected from ${this.id}`);
    this.emitEvent("disconnected");
  }

  isConnected(): boolean {
    return this.status === "connected" && this.socket?.connected;
  }

  async send(message: TransportMessage): Promise<TransportResponse> {
    if (!this.isConnected()) {
      this.messageQueue.push(message);
      return { success: false, message: "Not connected, message queued" };
    }

    try {
      const body = JSON.stringify(message);
      this.socket.emit("message", message);

      this.stats.messagesSent++;
      this.stats.bytesSent += body.length;
      this.stats.lastMessageAt = Date.now();

      return { success: true };
    } catch (error) {
      this.stats.errorCount++;
      logger.error(`[ChannelTransport:SocketIO] Send failed for ${this.id}`, { error });
      this.emitEvent("error", { error });

      return { success: false, message: (error as Error).message };
    }
  }

  async *receive(): AsyncIterable<TransportMessage> {
    if (!this.isConnected()) return;

    const messages: TransportMessage[] = [];

    const handler = (message: TransportMessage) => {
      messages.push(message);
      this.stats.messagesReceived++;
      this.stats.lastMessageAt = Date.now();
      this.emitEvent("message", { message });
    };

    this.socket.on("message", handler);

    while (this.isConnected()) {
      if (messages.length > 0) {
        yield messages.shift()!;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.socket.off("message", handler);
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
    logger.info(`[ChannelTransport:SocketIO] Retrying connection (attempt ${this.retryCount}) in ${delay}ms`);
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
        logger.error(`[ChannelTransport:SocketIO] Event handler failed for ${type}`, { error });
      }
    }
  }
}