import { logger } from '../../../logger.js';
import type { TransportConfig, TransportRequest, TransportResponse, TransportEvent } from './types.js';
import { BaseTransportLayer } from './transport-layer.js';

export interface LocalService {
  handleRequest(request: TransportRequest): Promise<TransportResponse>;
}

const localServices = new Map<string, LocalService>();

export function registerLocalService(name: string, service: LocalService): void {
  localServices.set(name, service);
}

export function unregisterLocalService(name: string): void {
  localServices.delete(name);
}

export class LocalTransport extends BaseTransportLayer {
  private service?: LocalService;

  constructor(config: TransportConfig) {
    super(config);
    this.service = localServices.get(config.endpoint);
  }

  connect(): Promise<void> {
    if (!this.service) {
      this.service = localServices.get(this.config.endpoint);
    }
    this.connected = true;
    this.emit({ type: 'connect', timestamp: Date.now() });
    logger.debug(`[Agents:LocalTransport] Connected to local service: ${this.config.endpoint}`);
    return Promise.resolve();
  }

  disconnect(): void {
    this.connected = false;
    this.emit({ type: 'disconnect', timestamp: Date.now() });
    logger.debug(`[Agents:LocalTransport] Disconnected from local service: ${this.config.endpoint}`);
  }

  async sendRequest(request: TransportRequest): Promise<TransportResponse> {
    this.stats.requests++;

    if (!this.service) {
      this.stats.errors++;
      throw new Error(`Local service not found: ${this.config.endpoint}`);
    }

    try {
      const response = await this.service.handleRequest(request);
      this.stats.responses++;

      const bodySize = typeof response.body === 'string' ? response.body.length : JSON.stringify(response.body).length;
      this.stats.bytesReceived += bodySize;

      return response;
    } catch (error) {
      this.stats.errors++;
      this.emit({ type: 'error', data: error, timestamp: Date.now() });
      throw error;
    }
  }

  async sendMessage(message: unknown): Promise<void> {
    const bodySize = typeof message === 'string' ? message.length : JSON.stringify(message).length;
    this.stats.bytesSent += bodySize;

    await this.sendRequest({
      method: 'POST',
      body: message,
    });
  }

  setService(service: LocalService): void {
    this.service = service;
    localServices.set(this.config.endpoint, service);
  }
}

logger.debug('[Agents:LocalTransport] Module loaded');