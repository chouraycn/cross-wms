import { z } from "zod";

export type TransportId = string;

export type TransportType = "http" | "websocket" | "socketio" | "grpc";

export type TransportStatus = "connected" | "disconnected" | "connecting" | "error";

export interface TransportConfig {
  type: TransportType;
  host: string;
  port: number;
  path?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  tls?: boolean;
  certPath?: string;
  keyPath?: string;
  caPath?: string;
  auth?: {
    type: "none" | "basic" | "bearer" | "api-key";
    username?: string;
    password?: string;
    token?: string;
    apiKey?: string;
    apiKeyHeader?: string;
  };
}

export interface TransportMessage {
  id: string;
  type: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface TransportResponse {
  success: boolean;
  statusCode?: number;
  message?: string;
  data?: unknown;
}

export interface TransportEvent {
  type: "connected" | "disconnected" | "error" | "message" | "timeout";
  data?: unknown;
  timestamp: number;
}

export interface ChannelTransport {
  id: TransportId;
  type: TransportType;
  config: TransportConfig;
  status: TransportStatus;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  send(message: TransportMessage): Promise<TransportResponse>;
  receive(): AsyncIterable<TransportMessage>;

  on(event: string, handler: (event: TransportEvent) => void): void;
  off(event: string, handler: (event: TransportEvent) => void): void;

  getStats(): TransportStats;
}

export interface TransportStats {
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
  connectionAttempts: number;
  lastConnectedAt?: number;
  lastMessageAt?: number;
  errorCount: number;
}

export interface TransportFactory {
  create(config: TransportConfig): ChannelTransport;
  getType(): TransportType;
}

export const TransportConfigSchema = z.object({
  type: z.enum(["http", "websocket", "socketio", "grpc"]),
  host: z.string(),
  port: z.number().int().positive(),
  path: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  retryDelayMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  tls: z.boolean().optional(),
  certPath: z.string().optional(),
  keyPath: z.string().optional(),
  caPath: z.string().optional(),
  auth: z
    .object({
      type: z.enum(["none", "basic", "bearer", "api-key"]),
      username: z.string().optional(),
      password: z.string().optional(),
      token: z.string().optional(),
      apiKey: z.string().optional(),
      apiKeyHeader: z.string().optional(),
    })
    .optional(),
});

export const TransportMessageSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.number().int(),
});

export const TransportResponseSchema = z.object({
  success: z.boolean(),
  statusCode: z.number().int().optional(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});