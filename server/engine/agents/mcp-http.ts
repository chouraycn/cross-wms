import { logger } from '../../logger.js';
import type { McpHttpTransportConfig } from './mcp-transport-config.js';

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
