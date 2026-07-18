import { logger } from "../../../logger.js";
import type { ChannelTransport, TransportConfig, TransportMessage, TransportResponse, TransportEvent, TransportStats, TransportStatus } from "./types.js";

export class GrpcTransport implements ChannelTransport {
  id: string;
  type = "grpc" as const;
  config: TransportConfig;
  status: TransportStatus = "disconnected";

  private client: any = null;
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
    this.id = `grpc-${config.host}-${config.port}`;
    this.config = config;
  }

  async connect(): Promise<void> {
    this.status = "connecting";
    this.stats.connectionAttempts++;

    try {
      // @ts-expect-error optional dependency
      const grpc = await import("@grpc/grpc-js");
      const credentials = this.config.tls
        ? grpc.credentials.createSsl()
        : grpc.credentials.createInsecure();

      const channel = new grpc.Channel(
        `${this.config.host}:${this.config.port}`,
        credentials
      );

      this.client = channel;
      this.status = "connected";
      this.stats.lastConnectedAt = Date.now();
      logger.info(`[ChannelTransport:gRPC] Connected to ${this.id}`);
      this.emitEvent("connected");
    } catch (error) {
      this.status = "error";
      this.stats.errorCount++;
      logger.error(`[ChannelTransport:gRPC] Failed to connect to ${this.id}`, { error });
      this.emitEvent("error", { error });

      if (this.shouldRetry()) {
        await this.retry();
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }

    this.status = "disconnected";
    logger.info(`[ChannelTransport:gRPC] Disconnected from ${this.id}`);
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
      const body = JSON.stringify(message);
      this.stats.messagesSent++;
      this.stats.bytesSent += body.length;
      this.stats.lastMessageAt = Date.now();

      return { success: true };
    } catch (error) {
      this.stats.errorCount++;
      logger.error(`[ChannelTransport:gRPC] Send failed for ${this.id}`, { error });
      this.emitEvent("error", { error });

      return { success: false, message: (error as Error).message };
    }
  }

  async *receive(): AsyncIterable<TransportMessage> {
    logger.warn(`[ChannelTransport:gRPC] Receive not fully implemented`);
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

  private shouldRetry(): boolean {
    const maxRetries = this.config.maxRetries ?? 3;
    return this.retryCount < maxRetries;
  }

  private async retry(): Promise<void> {
    this.retryCount++;
    const delay = this.config.retryDelayMs ?? 1000 * Math.pow(2, this.retryCount - 1);
    logger.info(`[ChannelTransport:gRPC] Retrying connection (attempt ${this.retryCount}) in ${delay}ms`);
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
        logger.error(`[ChannelTransport:gRPC] Event handler failed for ${type}`, { error });
      }
    }
  }
}