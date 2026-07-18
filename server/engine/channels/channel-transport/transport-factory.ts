import { logger } from "../../../logger.js";
import type { TransportType, TransportConfig, ChannelTransport } from "./types.js";
import { HttpTransport } from "./http-transport.js";
import { WebSocketTransport } from "./websocket-transport.js";
import { SocketIoTransport } from "./socketio-transport.js";
import { GrpcTransport } from "./grpc-transport.js";

export interface TransportFactory {
  create(config: TransportConfig): ChannelTransport;
  getType(): TransportType;
}

const factories = new Map<TransportType, TransportFactory>();

export function registerTransportFactory(type: TransportType, factory: TransportFactory): void {
  factories.set(type, factory);
  logger.debug(`[ChannelTransport:Factory] Registered factory for ${type}`);
}

export function createTransport(config: TransportConfig): ChannelTransport {
  const factory = factories.get(config.type);

  if (factory) {
    logger.debug(`[ChannelTransport:Factory] Creating transport using factory: ${config.type}`);
    return factory.create(config);
  }

  logger.debug(`[ChannelTransport:Factory] Creating transport directly: ${config.type}`);

  switch (config.type) {
    case "http":
      return new HttpTransport(config);
    case "websocket":
      return new WebSocketTransport(config);
    case "socketio":
      return new SocketIoTransport(config);
    case "grpc":
      return new GrpcTransport(config);
    default:
      throw new Error(`Unsupported transport type: ${config.type}`);
  }
}

export function getTransportFactory(type: TransportType): TransportFactory | undefined {
  return factories.get(type);
}

export function hasTransportFactory(type: TransportType): boolean {
  return factories.has(type);
}

export function listTransportFactories(): TransportType[] {
  return Array.from(factories.keys());
}

export function createHttpTransport(config: Omit<TransportConfig, "type">): HttpTransport {
  return new HttpTransport({ ...config, type: "http" });
}

export function createWebSocketTransport(
  config: Omit<TransportConfig, "type">,
  isServer = false
): WebSocketTransport {
  return new WebSocketTransport({ ...config, type: "websocket" }, isServer);
}

export function createSocketIoTransport(
  config: Omit<TransportConfig, "type">,
  isServer = false
): SocketIoTransport {
  return new SocketIoTransport({ ...config, type: "socketio" }, isServer);
}

export function createGrpcTransport(config: Omit<TransportConfig, "type">): GrpcTransport {
  return new GrpcTransport({ ...config, type: "grpc" });
}