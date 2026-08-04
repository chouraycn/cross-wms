import { logger } from '../../logger.js';
import type { McpHttpTransportConfig } from './mcp-transport-config.js';
import {
  redactSensitiveUrl,
  redactSensitiveUrlLikeString,
} from "@openclaw/net-policy/redact-sensitive-url";
import { isMcpConfigRecord, toMcpStringRecord } from "./mcp-config-shared.js";

export interface McpHttpTransportOptions {
  config: McpHttpTransportConfig;
}

export interface McpMessage {
  jsonrpc: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class McpHttpTransport {
  private config: McpHttpTransportConfig;
  private messageId = 0;

  constructor(options: McpHttpTransportOptions) {
    this.config = options.config;
  }

  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.messageId;
    const message: McpMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.doRequest(message);
        
        if (response.error) {
          throw new Error(response.error.message);
        }
        
        return response.result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          logger.debug(`[Agents:McpHttp] Retry ${attempt + 1}/${this.config.maxRetries} in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error('Request failed');
  }

  private async doRequest(message: McpMessage): Promise<McpMessage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.config.headers,
      };

      const response = await fetch(this.config.url, {
        method: this.config.method,
        headers,
        body: this.config.method === 'POST' ? JSON.stringify(message) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as McpMessage;
    } finally {
      clearTimeout(timeout);
    }
  }

  async sendNotification(method: string, params?: unknown): Promise<void> {
    const message: McpMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    try {
      await this.doRequest(message);
    } catch (err) {
      logger.warn('[Agents:McpHttp] Notification failed:', err);
    }
  }

  isConnected(): boolean {
    return true;
  }

  disconnect(): void {
    // HTTP 是无状态的，无需断开
  }
}

export function createMcpHttpTransport(config: McpHttpTransportConfig): McpHttpTransport {
  return new McpHttpTransport({ config });
}

logger.debug('[Agents:McpHttp] Module loaded');

// ============================================================================
// HTTP MCP launch config normalization (merged from openclaw/src/agents/mcp-http.ts)
// MCP server setup uses this to validate SSE/streamable HTTP server records,
// sanitize headers, and redact sensitive URLs in diagnostics.
// ============================================================================

/** Supported HTTP-based MCP transport flavors. */
export type HttpMcpTransportType = "sse" | "streamable-http";

type HttpMcpServerLaunchConfig = {
  transportType: HttpMcpTransportType;
  url: string;
  headers?: Record<string, string>;
};

type HttpMcpServerLaunchResult =
  | { ok: true; config: HttpMcpServerLaunchConfig }
  | { ok: false; reason: string };

/** Normalizes an HTTP MCP server config record into a launchable transport config. */
export function resolveHttpMcpServerLaunchConfig(
  raw: unknown,
  options?: {
    transportType?: HttpMcpTransportType;
    onDroppedHeader?: (key: string, value: unknown) => void;
    onMalformedHeaders?: (value: unknown) => void;
  },
): HttpMcpServerLaunchResult {
  if (!isMcpConfigRecord(raw)) {
    return { ok: false, reason: "server config must be an object" };
  }
  if (typeof raw.url !== "string" || raw.url.trim().length === 0) {
    return { ok: false, reason: "its url is missing" };
  }
  const url = raw.url.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      reason: `its url is not a valid URL: ${redactSensitiveUrlLikeString(url)}`,
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      reason: `only http and https URLs are supported, got ${parsed.protocol}`,
    };
  }

  let headers: Record<string, string> | undefined;
  if (raw.headers !== undefined && raw.headers !== null) {
    if (!isMcpConfigRecord(raw.headers)) {
      options?.onMalformedHeaders?.(raw.headers);
    } else {
      headers = toMcpStringRecord(raw.headers, {
        onDroppedEntry: options?.onDroppedHeader,
      });
    }
  }

  return {
    ok: true,
    config: {
      transportType: options?.transportType ?? "sse",
      url,
      headers,
    },
  };
}

/** Describes an HTTP MCP server launch config without leaking URL credentials. */
export function describeHttpMcpServerLaunchConfig(config: HttpMcpServerLaunchConfig): string {
  return redactSensitiveUrl(config.url);
}
