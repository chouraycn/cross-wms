import { logger } from '../../logger.js';

export interface TypingIndicatorOptions {
  channelId: string;
  targetId?: string;
  durationMs?: number;
}

export async function sendTypingIndicator(options: TypingIndicatorOptions): Promise<void> {
  const { channelId, targetId, durationMs = 3000 } = options;
  logger.debug(`[Channels:Typing] Sending typing indicator on ${channelId}${targetId ? ` to ${targetId}` : ''}`);

  await new Promise(resolve => setTimeout(resolve, durationMs));

  logger.debug(`[Channels:Typing] Stopped typing indicator on ${channelId}`);
}

export async function stopTypingIndicator(channelId: string, targetId?: string): Promise<void> {
  logger.debug(`[Channels:Typing] Stop requested for ${channelId}${targetId ? ` to ${targetId}` : ''}`);
}
