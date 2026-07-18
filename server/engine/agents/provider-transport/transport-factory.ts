import { logger } from '../../../logger.js';
import type { TransportConfig } from './types.js';
import { TransportConfigSchema } from './types.js';
import type { TransportLayer } from './transport-layer.js';
import { HttpTransport } from './http-transport.js';
import { LocalTransport } from './local-transport.js';
import { WebSocketTransport } from './websocket-transport.js';
import { registerTransport } from './transport-registry.js';

export function createTransport(config: TransportConfig): TransportLayer {
  const result = TransportConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid transport config: ${result.error.message}`);
  }

  switch (config.type) {
    case 'http':
    case 'https':
      logger.debug(`[Agents:TransportFactory] Creating HTTP transport: ${config.id}`);
      return new HttpTransport(result.data);
    case 'local':
      logger.debug(`[Agents:TransportFactory] Creating local transport: ${config.id}`);
      return new LocalTransport(result.data);
    case 'websocket':
      logger.debug(`[Agents:TransportFactory] Creating WebSocket transport: ${config.id}`);
      return new WebSocketTransport(result.data);
    default:
      throw new Error(`Unsupported transport type: ${config.type}`);
  }
}

export function createAndRegisterTransport(config: TransportConfig): TransportLayer {
  const transport = createTransport(config);
  registerTransport(config);
  return transport;
}

export function createHttpTransport(params: {
  id: string;
  name: string;
  endpoint: string;
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  apiKey?: string;
}): TransportLayer {
  const config: TransportConfig = TransportConfigSchema.parse({
    id: params.id,
    name: params.name,
    type: params.endpoint.startsWith('https') ? 'https' : 'http',
    endpoint: params.endpoint,
    timeoutMs: params.timeoutMs ?? 30000,
    maxRetries: params.maxRetries ?? 3,
    headers: params.headers ?? {},
    auth: params.apiKey ? {
      type: 'api-key',
      apiKey: params.apiKey,
    } : { type: 'none' },
  });

  return createTransport(config);
}

export function createLocalTransport(params: {
  id: string;
  name: string;
  serviceName: string;
}): TransportLayer {
  const config: TransportConfig = TransportConfigSchema.parse({
    id: params.id,
    name: params.name,
    type: 'local',
    endpoint: params.serviceName,
  });

  return createTransport(config);
}

export function createWebSocketTransport(params: {
  id: string;
  name: string;
  endpoint: string;
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  apiKey?: string;
}): TransportLayer {
  const config: TransportConfig = TransportConfigSchema.parse({
    id: params.id,
    name: params.name,
    type: 'websocket',
    endpoint: params.endpoint,
    timeoutMs: params.timeoutMs ?? 30000,
    maxRetries: params.maxRetries ?? 3,
    headers: params.headers ?? {},
    auth: params.apiKey ? {
      type: 'api-key',
      apiKey: params.apiKey,
    } : { type: 'none' },
  });

  return createTransport(config);
}

logger.debug('[Agents:TransportFactory] Module loaded');