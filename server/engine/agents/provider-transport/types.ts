import { z } from 'zod';

export const TransportConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['http', 'https', 'websocket', 'local']),
  endpoint: z.string(),
  enabled: z.boolean().default(true),
  timeoutMs: z.number().min(1000).default(30000),
  maxRetries: z.number().min(0).default(3),
  retryDelayMs: z.number().min(100).default(1000),
  headers: z.record(z.string(), z.string()).default({}),
  auth: z.object({
    type: z.enum(['none', 'api-key', 'bearer', 'basic']).default('none'),
    apiKey: z.string().optional(),
    apiKeyHeader: z.string().default('Authorization'),
    bearerToken: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  }).default({ type: 'none', apiKeyHeader: 'Authorization' }),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type TransportConfig = z.infer<typeof TransportConfigSchema>;

export interface TransportRequest {
  method: string;
  path?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface TransportResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface TransportMessage {
  id?: string | number;
  type: string;
  data?: unknown;
  error?: {
    code: number;
    message: string;
    details?: unknown;
  };
}

export type TransportEventType = 'connect' | 'disconnect' | 'message' | 'error' | 'reconnect';

export interface TransportEvent {
  type: TransportEventType;
  data?: unknown;
  timestamp: number;
}