/**
 * 轻量级 OpenClaw Gateway WebSocket 客户端
 * 遵循 Gateway 协议：连接 → RPC 调用 → 事件订阅
 */
export interface GatewayClientOptions {
  url?: string;
  clientId?: string;
  clientVersion?: string;
  onEvent?: (event: GatewayEvent) => void;
  onStatusChange?: (status: GatewayConnectionStatus) => void;
}

export type GatewayConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface GatewayEvent {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private clientId: string;
  private clientVersion: string;
  private requestId = 0;
  private pending = new Map<string, PendingRequest>();
  private seq = 0;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: GatewayConnectionStatus = 'disconnected';

  public onEvent?: (event: GatewayEvent) => void;
  public onStatusChange?: (status: GatewayConnectionStatus) => void;

  constructor(opts: GatewayClientOptions = {}) {
    this.url = opts.url || 'ws://127.0.0.1:18789';
    this.clientId = opts.clientId || 'cdf-chat-ui';
    this.clientVersion = opts.clientVersion || '1.0.0';
    this.onEvent = opts.onEvent;
    this.onStatusChange = opts.onStatusChange;
  }

  get status(): GatewayConnectionStatus {
    return this._status;
  }

  private setStatus(s: GatewayConnectionStatus) {
    if (this._status !== s) {
      this._status = s;
      this.onStatusChange?.(s);
    }
  }

  /** 连接到 Gateway */
  connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }
    this.closed = false;
    this.setStatus('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        this.setStatus('error');
        reject(err);
        return;
      }

      const ws = this.ws;
      const timeout = setTimeout(() => {
        if (this.ws === ws && ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          this.setStatus('error');
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.handleOpen(ws).then(resolve).catch(reject);
      };

      ws.onmessage = (evt: MessageEvent) => {
        this.handleMessage(evt.data as string);
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        if (this.ws === ws) {
          this.ws = null;
          this.setStatus('disconnected');
          if (!this.closed) {
            this.scheduleReconnect();
          }
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        this.setStatus('error');
      };
    });
  }

  /** 发送 RPC 请求 */
  request<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }

      const id = String(++this.requestId);
      const frame = { type: 'req', id, method, params };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });

      try {
        ws.send(JSON.stringify(frame));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  /** 断开连接 */
  disconnect() {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const [, pr] of this.pending) {
      clearTimeout(pr.timer);
      pr.reject(new Error('Client disconnected'));
    }
    this.pending.clear();
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  private async handleOpen(ws: WebSocket) {
    // 等待 500ms 后发送 connect（参考 GatewayBrowserClient 的 queueConnect 延迟）
    await new Promise(r => setTimeout(r, 500));

    if (this.closed || ws !== this.ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      const hello = await this.requestOnSocket<{ protocolVersion: number }>(ws, 'connect', {
        minProtocol: 1,
        maxProtocol: 1,
        client: {
          id: this.clientId,
          version: this.clientVersion,
          platform: typeof navigator !== 'undefined' ? navigator.platform || 'web' : 'node',
          mode: 'webchat',
        },
        role: 'operator',
        caps: ['tool-events'],
        auth: {},
      });
      this.setStatus('connected');
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  private requestOnSocket<T>(ws: WebSocket, method: string, params: Record<string, unknown>, timeoutMs = 10000): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = String(++this.requestId);
      const frame = { type: 'req', id, method, params };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });

      try {
        ws.send(JSON.stringify(frame));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as Record<string, unknown>;

    if (frame.type === 'res') {
      // RPC 响应
      const id = frame.id as string;
      const pr = this.pending.get(id);
      if (!pr) return;
      clearTimeout(pr.timer);
      this.pending.delete(id);

      if (frame.ok) {
        pr.resolve(frame.payload);
      } else {
        const err = frame.error as { message?: string; code?: string } | undefined;
        pr.reject(new Error(err?.message || `RPC error: ${frame.error}`));
      }
      return;
    }

    if (frame.type === 'event') {
      // 事件广播
      const evt = frame as unknown as GatewayEvent;
      // 序号检查
      if (typeof evt.seq === 'number') {
        if (evt.seq > this.seq + 1 && this.seq > 0) {
          // 有序号间隙，仅记录
        }
        this.seq = Math.max(this.seq, evt.seq);
      }
      this.onEvent?.(evt);
      return;
    }
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) {
        this.connect().catch(() => {});
      }
    }, 3000);
  }
}

export default GatewayClient;