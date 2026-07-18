import WebSocket from 'ws';
import { logger } from '../../../logger.js';
import type { TransportConfig, TransportRequest, TransportResponse, TransportEvent } from './types.js';
import { BaseTransportLayer } from './transport-layer.js';

export class WebSocketTransport extends BaseTransportLayer {
  private ws?: WebSocket;
  private messageId = 0;
  private pendingRequests = new Map<number | string, {
    resolve: (value: TransportResponse) => void;
    reject: (reason: unknown) => void;
    timeout?: ReturnType<typeof setTimeout>;
  }>();
  private reconnectAttempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(config: TransportConfig) {
    super(config);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.config.endpoint.replace(/^http/, 'ws');

      this.ws = new WebSocket(url, {
        headers: {
          ...this.config.headers,
          ...this.getAuthHeaders(),
        },
      });

      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempt = 0;
        this.emit({ type: 'connect', timestamp: Date.now() });
        logger.debug(`[Agents:WebSocketTransport] Connected to ${url}`);
        resolve();
      });

      this.ws.on('message', (data) => {
        this.stats.bytesReceived += data instanceof Buffer ? data.length : Buffer.byteLength(String(data));
        this.handleMessage(data.toString());
      });

      this.ws.on('close', (code, reason) => {
        this.connected = false;
        this.emit({ type: 'disconnect', data: { code, reason: reason.toString() }, timestamp: Date.now() });
        logger.debug(`[Agents:WebSocketTransport] Disconnected (${code})`);

        if (this.config.maxRetries > 0) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error) => {
        this.stats.errors++;
        this.emit({ type: 'error', data: error, timestamp: Date.now() });
        if (!this.connected) {
          reject(error);
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = this.config.retryDelayMs * Math.pow(2, this.reconnectAttempt);
    this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, 10);

    this.reconnectTimer = setTimeout(() => {
      logger.debug(`[Agents:WebSocketTransport] Reconnecting attempt ${this.reconnectAttempt}`);
      this.emit({ type: 'reconnect', timestamp: Date.now() });
      this.connect().catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    for (const [, pending] of this.pendingRequests) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(new Error('Transport disconnected'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.connected = false;
    logger.debug('[Agents:WebSocketTransport] Disconnected');
  }

  async sendRequest(request: TransportRequest): Promise<TransportResponse> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected');
    }

    this.stats.requests++;

    const id = ++this.messageId;
    const message = {
      id,
      method: request.method,
      path: request.path,
      body: request.body,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.stats.errors++;
        reject(new Error(`Request timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      try {
        const serialized = JSON.stringify(message);
        this.ws!.send(serialized);
        this.stats.bytesSent += serialized.length;
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        this.stats.errors++;
        reject(error);
      }
    });
  }

  async sendMessage(message: unknown): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected');
    }

    const serialized = JSON.stringify(message);
    this.ws.send(serialized);
    this.stats.bytesSent += serialized.length;
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.id !== undefined) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          if (pending.timeout) {
            clearTimeout(pending.timeout);
          }
          this.pendingRequests.delete(message.id);
          this.stats.responses++;

          pending.resolve({
            status: message.status ?? 200,
            body: message.body,
            headers: message.headers,
          });
          return;
        }
      }

      this.emit({ type: 'message', data: message, timestamp: Date.now() });
    } catch (error) {
      logger.warn('[Agents:WebSocketTransport] Failed to parse message:', error);
    }
  }
}

logger.debug('[Agents:WebSocketTransport] Module loaded');