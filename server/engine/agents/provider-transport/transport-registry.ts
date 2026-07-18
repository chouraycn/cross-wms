import { z } from 'zod';
import { logger } from '../../../logger.js';
import type { TransportConfig } from './types.js';
import { TransportConfigSchema } from './types.js';

const transportStore = new Map<string, TransportConfig>();
const typeIndex = new Map<string, Set<string>>();

export function registerTransport(config: TransportConfig): void {
  const result = TransportConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid transport config: ${result.error.message}`);
  }

  transportStore.set(config.id, result.data);

  if (!typeIndex.has(config.type)) {
    typeIndex.set(config.type, new Set());
  }
  typeIndex.get(config.type)!.add(config.id);

  logger.debug(`[Agents:TransportRegistry] Registered transport: ${config.id} (${config.type})`);
}

export function unregisterTransport(transportId: string): boolean {
  const config = transportStore.get(transportId);
  if (!config) return false;

  transportStore.delete(transportId);

  const typeSet = typeIndex.get(config.type);
  if (typeSet) {
    typeSet.delete(transportId);
    if (typeSet.size === 0) {
      typeIndex.delete(config.type);
    }
  }

  logger.debug(`[Agents:TransportRegistry] Unregistered transport: ${transportId}`);
  return true;
}

export function getTransport(transportId: string): TransportConfig | undefined {
  return transportStore.get(transportId);
}

export function listTransports(options?: {
  enabledOnly?: boolean;
  type?: TransportConfig['type'];
}): TransportConfig[] {
  let transports = Array.from(transportStore.values());

  if (options?.enabledOnly) {
    transports = transports.filter(t => t.enabled);
  }

  if (options?.type) {
    transports = transports.filter(t => t.type === options.type);
  }

  return transports;
}

export function transportExists(transportId: string): boolean {
  return transportStore.has(transportId);
}

export function updateTransport(transportId: string, updates: Partial<TransportConfig>): TransportConfig | undefined {
  const existing = transportStore.get(transportId);
  if (!existing) return undefined;

  const updated = { ...existing, ...updates, id: transportId };
  const result = TransportConfigSchema.safeParse(updated);
  if (!result.success) {
    throw new Error(`Invalid update: ${result.error.message}`);
  }

  transportStore.set(transportId, result.data);
  logger.debug(`[Agents:TransportRegistry] Updated transport: ${transportId}`);
  return result.data;
}

export function getTransportsByType(type: TransportConfig['type']): TransportConfig[] {
  return listTransports({ type, enabledOnly: true });
}

export function clearTransports(): void {
  transportStore.clear();
  typeIndex.clear();
  logger.debug('[Agents:TransportRegistry] Cleared all transports');
}

logger.debug('[Agents:TransportRegistry] Module loaded');