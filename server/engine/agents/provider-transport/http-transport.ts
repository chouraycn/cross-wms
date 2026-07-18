import http from 'http';
import https from 'https';
import { logger } from '../../../logger.js';
import type { TransportConfig, TransportRequest, TransportResponse, TransportEvent } from './types.js';
import { BaseTransportLayer } from './transport-layer.js';

export class HttpTransport extends BaseTransportLayer {
  private agent: http.Agent | https.Agent;

  constructor(config: TransportConfig) {
    super(config);
    const isHttps = config.type === 'https';
    this.agent = isHttps ? new https.Agent({ keepAlive: true }) : new http.Agent({ keepAlive: true });
  }

  connect(): Promise<void> {
    this.connected = true;
    this.emit({ type: 'connect', timestamp: Date.now() });
    logger.debug(`[Agents:HttpTransport] Connected to ${this.config.endpoint}`);
    return Promise.resolve();
  }

  disconnect(): void {
    this.connected = false;
    this.agent.destroy();
    this.emit({ type: 'disconnect', timestamp: Date.now() });
    logger.debug(`[Agents:HttpTransport] Disconnected from ${this.config.endpoint}`);
  }

  async sendRequest(request: TransportRequest): Promise<TransportResponse> {
    this.stats.requests++;

    const url = new URL(this.config.endpoint);
    if (request.path) {
      url.pathname = request.path;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
      ...this.getAuthHeaders(),
      ...request.headers,
    };

    const body = request.body ? JSON.stringify(request.body) : undefined;
    if (body) {
      headers['Content-Length'] = Buffer.byteLength(body).toString();
    }

    const timeoutMs = request.timeoutMs ?? this.config.timeoutMs;

    return new Promise((resolve, reject) => {
      const isHttps = this.config.type === 'https';
      const module = isHttps ? https : http;

      const req = module.request(
        {
          hostname: url.hostname,
          port: url.port ? parseInt(url.port) : (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: request.method,
          headers,
          agent: this.agent,
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
            this.stats.bytesReceived += chunk.length;
          });

          res.on('end', () => {
            this.stats.responses++;
            let parsedBody: unknown = data;
            try {
              parsedBody = JSON.parse(data);
            } catch {
              // keep as string if not JSON
            }

            const responseHeaders: Record<string, string> = {};
            for (const key in res.headers) {
              const value = res.headers[key];
              if (value) {
                responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
              }
            }

            resolve({
              status: res.statusCode ?? 0,
              body: parsedBody,
              headers: responseHeaders,
            });
          });
        },
      );

      req.on('error', (err) => {
        this.stats.errors++;
        this.emit({ type: 'error', data: err, timestamp: Date.now() });
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        this.stats.errors++;
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      });

      if (body) {
        req.write(body);
        this.stats.bytesSent += body.length;
      }
      req.end();
    });
  }

  async sendMessage(message: unknown): Promise<void> {
    await this.sendRequest({
      method: 'POST',
      body: message,
    });
  }
}

logger.debug('[Agents:HttpTransport] Module loaded');