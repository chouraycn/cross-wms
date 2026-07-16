import { logger } from '../../logger.js';

export type ChannelConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';

export interface ChannelConnection {
  channelId: string;
  state: ChannelConnectionState;
  connectedAt?: number;
  disconnectedAt?: number;
  retryCount: number;
  lastError?: string;
  metadata?: Record<string, unknown>;
}

const connectionStore = new Map<string, ChannelConnection>();

export function getConnection(channelId: string): ChannelConnection | undefined {
  return connectionStore.get(channelId);
}

export function setConnectionState(channelId: string, state: ChannelConnectionState, error?: string): void {
  const current = connectionStore.get(channelId) ?? {
    channelId,
    state: 'disconnected',
    retryCount: 0,
  };
  current.state = state;
  if (state === 'connected') {
    current.connectedAt = Date.now();
    current.retryCount = 0;
  } else if (state === 'disconnected' || state === 'closed') {
    current.disconnectedAt = Date.now();
  } else if (state === 'reconnecting' || state === 'failed') {
    current.retryCount++;
  }
  if (error) current.lastError = error;
  connectionStore.set(channelId, current);
  logger.debug(`[Channels:Connection] ${channelId} -> ${state}${error ? ` (${error})` : ''}`);
}

export function listConnections(): ChannelConnection[] {
  return Array.from(connectionStore.values());
}

export function getActiveConnections(): ChannelConnection[] {
  return listConnections().filter((c) => c.state === 'connected');
}

export function getFailedConnections(): ChannelConnection[] {
  return listConnections().filter((c) => c.state === 'failed');
}

export function clearConnection(channelId: string): void {
  connectionStore.delete(channelId);
}
