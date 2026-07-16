import { logger } from '../../logger.js';

export type GatewayClientRequestOptions = {
  expectFinal?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  onAccepted?: () => void;
};

export type GatewayClientCloseInfo = {
  phase: 'pre-hello' | 'post-hello';
  socketOpened: boolean;
  transportValidated: boolean;
  transientPreHelloCleanClose: boolean;
};

export class GatewayClient {
  private readonly url: string;
  private readonly token?: string;
  private connected = false;

  constructor(options: { url: string; token?: string; clientVersion?: string }) {
    this.url = options.url;
    this.token = options.token;
  }

  async start(): Promise<void> {
    logger.info(`[GatewayClient] Connecting to ${this.url}`);
    this.connected = true;
  }

  async stop(): Promise<void> {
    this.connected = false;
    logger.info('[GatewayClient] Stopped');
  }

  async stopAndWait(timeoutMs = 1_000): Promise<void> {
    await this.stop();
  }

  isConnected(): boolean {
    return this.connected;
  }

  async request<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    options?: GatewayClientRequestOptions,
  ): Promise<T> {
    if (!this.connected) {
      throw new Error('GatewayClient not connected');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 30_000);
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

      const response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ method, params }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json() as { result?: T; error?: { message: string } };
      if (json.error) throw new Error(json.error.message);
      options?.onAccepted?.();
      return json.result as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  getConnectionMetadata(): { url: string; connected: boolean } {
    return { url: this.url, connected: this.connected };
  }
}
