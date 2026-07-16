import { logger } from '../../logger.js';

export interface ChannelLogEntry {
  timestamp: number;
  channelId: string;
  messageId: string;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'attachment' | 'event';
  metadata?: Record<string, unknown>;
}

export function logChannelMessage(entry: ChannelLogEntry): void {
  const { timestamp, channelId, messageId, direction, type, metadata } = entry;
  const timeStr = new Date(timestamp).toISOString();

  logger.info(`[ChannelLog] ${timeStr} ${direction} ${type} ${channelId} ${messageId}`, metadata);
}

export function formatChannelLog(entry: ChannelLogEntry): string {
  const timeStr = new Date(entry.timestamp).toISOString();
  return `${timeStr} [${entry.direction.toUpperCase()}] ${entry.type} channel=${entry.channelId} msg=${entry.messageId}`;
}

export function sanitizeChannelLog(entry: ChannelLogEntry): ChannelLogEntry {
  if (!entry.metadata) return entry;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry.metadata)) {
    if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('token')) {
      sanitized[key] = '<redacted>';
    } else {
      sanitized[key] = value;
    }
  }
  return { ...entry, metadata: sanitized };
}
