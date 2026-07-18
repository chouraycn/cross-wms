import { logger } from "../../../logger.js";
import type { ChannelTransport, TransportConfig, TransportMessage, TransportResponse, TransportEvent, TransportStats, TransportStatus } from "./types.js";

export class HttpTransport implements ChannelTransport {
  id: string;
  type = "http" as const;
  config: TransportConfig;
  status: TransportStatus = "disconnected";

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

  constructor(config: TransportConfig) {
    this.id = `http-${config.host}-${config.port}`;
    this.config = config;
  }

  async connect(): Promise<void> {
    this.status = "connecting";
    this.stats.connectionAttempts++;

    try {
      const url = this.buildUrl("/health");
      const response = await fetch(url, {
        method: "HEAD",
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10000),
      });

      if (response.ok) {
        this.status = "connected";
        this.stats.lastConnectedAt = Date.now();
        logger.info(`[ChannelTransport:HTTP] Connected to ${this.id}`);
        this.emitEvent("connected");
      } else {
        throw new Error(`Connection failed: ${response.status}`);
      }
    } catch (error) {
      this.status = "error";
      this.stats.errorCount++;
      logger.error(`[ChannelTransport:HTTP] Failed to connect to ${this.id}`, { error });
      this.emitEvent("error", { error });

      if (this.shouldRetry()) {
        await this.retry();
      }
    }
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
    logger.info(`[ChannelTransport:HTTP] Disconnected from ${this.id}`);
    this.emitEvent("disconnected");
  }

  isConnected(): boolean {
    return this.status === "connected";
  }

  async send(message: TransportMessage): Promise<TransportResponse> {
    if (!this.isConnected()) {
      return { success: false, message: "Not connected" };
    }

    try {
      const url = this.buildUrl(this.config.path ?? "/");
      const body = JSON.stringify(message);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...this.buildHeaders(),
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 30000),
      });

      this.stats.messagesSent++;
      this.stats.bytesSent += body.length;
      this.stats.lastMessageAt = Date.now();

      const data = await response.json().catch(() => ({}));

      return {
        success: response.ok,
        statusCode: response.status,
        data,
      };
    } catch (error) {
      this.stats.errorCount++;
      logger.error(`[ChannelTransport:HTTP] Send failed for ${this.id}`, { error });
      this.emitEvent("error", { error });

      return { success: false, message: (error as Error).message };
    }
  }

  async *receive(): AsyncIterable<TransportMessage> {
    logger.warn(`[ChannelTransport:HTTP] Receive not supported for HTTP transport`);
    yield* [];
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

  private buildUrl(path: string): string {
    const protocol = this.config.tls ? "https" : "http";
    return `${protocol}://${this.config.host}:${this.config.port}${path}`;
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
    logger.info(`[ChannelTransport:HTTP] Retrying connection (attempt ${this.retryCount}) in ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    await this.connect();
  }

  private emitEvent(type: TransportEvent["type"], data?: unknown): void {
    const handlers = this.eventHandlers.get(type);
    if (!handlers) return;

    const event: TransportEvent = { type, data, timestamp: Date.now() };
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        logger.error(`[ChannelTransport:HTTP] Event handler failed for ${type}`, { error });
      }
    }
  }
}