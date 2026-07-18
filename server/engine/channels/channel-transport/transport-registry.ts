import { logger } from "../../../logger.js";
import type { TransportId, TransportType, ChannelTransport, TransportStatus } from "./types.js";

const transportRegistry = new Map<TransportId, ChannelTransport>();
const typeRegistry = new Map<TransportType, TransportId[]>();

export function registerTransport(transport: ChannelTransport): void {
  transportRegistry.set(transport.id, transport);

  const transports = typeRegistry.get(transport.type) ?? [];
  transports.push(transport.id);
  typeRegistry.set(transport.type, transports);

  logger.debug(`[ChannelTransport:Registry] Registered transport: ${transport.id}`);
}

export function unregisterTransport(transportId: TransportId): boolean {
  const transport = transportRegistry.get(transportId);
  if (!transport) return false;

  transportRegistry.delete(transportId);

  const transports = typeRegistry.get(transport.type);
  if (transports) {
    const idx = transports.indexOf(transportId);
    if (idx !== -1) transports.splice(idx, 1);
  }

  logger.debug(`[ChannelTransport:Registry] Unregistered transport: ${transportId}`);
  return true;
}

export function getTransport(transportId: TransportId): ChannelTransport | undefined {
  return transportRegistry.get(transportId);
}

export function getTransportOrThrow(transportId: TransportId): ChannelTransport {
  const transport = transportRegistry.get(transportId);
  if (!transport) {
    throw new Error(`Transport not found: ${transportId}`);
  }
  return transport;
}

export function hasTransport(transportId: TransportId): boolean {
  return transportRegistry.has(transportId);
}

export function listTransports(type?: TransportType): ChannelTransport[] {
  if (type) {
    const ids = typeRegistry.get(type) ?? [];
    return ids.map((id) => transportRegistry.get(id)!).filter(Boolean);
  }
  return Array.from(transportRegistry.values());
}

export function getTransportStatus(transportId: TransportId): TransportStatus | undefined {
  return transportRegistry.get(transportId)?.status;
}

export function updateTransportStatus(transportId: TransportId, status: TransportStatus): boolean {
  const transport = transportRegistry.get(transportId);
  if (!transport) return false;
  transport.status = status;
  logger.debug(`[ChannelTransport:Registry] Updated transport ${transportId} status: ${status}`);
  return true;
}

export function clearTransportRegistry(): void {
  transportRegistry.clear();
  typeRegistry.clear();
  logger.debug(`[ChannelTransport:Registry] Registry cleared`);
}

export function getTransportCount(type?: TransportType): number {
  if (type) {
    return typeRegistry.get(type)?.length ?? 0;
  }
  return transportRegistry.size;
}

export function getActiveTransports(): ChannelTransport[] {
  return Array.from(transportRegistry.values()).filter((t) => t.status === "connected");
}