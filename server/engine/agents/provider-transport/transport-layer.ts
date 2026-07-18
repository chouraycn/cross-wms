import type { TransportConfig, TransportRequest, TransportResponse, TransportEvent } from './types.js';

export interface TransportLayer {
  readonly config: TransportConfig;
  readonly type: string;

  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;

  sendRequest(request: TransportRequest): Promise<TransportResponse>;
  sendMessage(message: unknown): Promise<void>;

  on(event: 'connect' | 'disconnect' | 'message' | 'error' | 'reconnect', handler: (event: TransportEvent) => void): void;
  off(event: 'connect' | 'disconnect' | 'message' | 'error' | 'reconnect', handler: (event: TransportEvent) => void): void;

  getStats(): {
    requests: number;
    responses: number;
    errors: number;
    bytesSent: number;
    bytesReceived: number;
  };
}

export abstract class BaseTransportLayer implements TransportLayer {
  readonly config: TransportConfig;
  readonly type: string;
  private eventHandlers = new Map<string, Array<(event: TransportEvent) => void>>();
  protected connected = false;
  protected stats = {
    requests: 0,
    responses: 0,
    errors: 0,
    bytesSent: 0,
    bytesReceived: 0,
  };

  constructor(config: TransportConfig) {
    this.config = config;
    this.type = config.type;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract sendRequest(request: TransportRequest): Promise<TransportResponse>;
  abstract sendMessage(message: unknown): Promise<void>;

  isConnected(): boolean {
    return this.connected;
  }

  on(event: string, handler: (event: TransportEvent) => void): void {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  off(event: string, handler: (event: TransportEvent) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  protected emit(event: TransportEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch {
          // ignore handler errors
        }
      }
    }
  }

  getStats(): {
    requests: number;
    responses: number;
    errors: number;
    bytesSent: number;
    bytesReceived: number;
  } {
    return { ...this.stats };
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const { auth } = this.config;

    switch (auth.type) {
      case 'api-key':
        if (auth.apiKey) {
          headers[auth.apiKeyHeader ?? 'Authorization'] = `Bearer ${auth.apiKey}`;
        }
        break;
      case 'bearer':
        if (auth.bearerToken) {
          headers['Authorization'] = `Bearer ${auth.bearerToken}`;
        }
        break;
      case 'basic':
        if (auth.username && auth.password) {
          headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
        }
        break;
    }

    return headers;
  }
}