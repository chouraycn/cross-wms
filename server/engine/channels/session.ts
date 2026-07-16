import { logger } from '../../logger.js';

export interface ChannelSession {
  sessionId: string;
  channelId: string;
  channelType: string;
  targetId?: string;
  userId?: string;
  startTime: number;
  lastActivityTime: number;
  metadata?: Record<string, unknown>;
}

const channelSessions = new Map<string, ChannelSession>();

export function createChannelSession(params: {
  channelId: string;
  channelType: string;
  targetId?: string;
  userId?: string;
}): ChannelSession {
  const sessionId = `${params.channelId}-${Date.now()}`;
  const session: ChannelSession = {
    sessionId,
    channelId: params.channelId,
    channelType: params.channelType,
    targetId: params.targetId,
    userId: params.userId,
    startTime: Date.now(),
    lastActivityTime: Date.now(),
    metadata: {},
  };

  channelSessions.set(sessionId, session);
  logger.debug(`[Channels:Session] Created session ${sessionId}`);
  return session;
}

export function getChannelSession(sessionId: string): ChannelSession | undefined {
  return channelSessions.get(sessionId);
}

export function getChannelSessionsByChannel(channelId: string): ChannelSession[] {
  return Array.from(channelSessions.values()).filter(s => s.channelId === channelId);
}

export function updateChannelSessionActivity(sessionId: string): void {
  const session = channelSessions.get(sessionId);
  if (session) {
    session.lastActivityTime = Date.now();
  }
}

export function closeChannelSession(sessionId: string): void {
  channelSessions.delete(sessionId);
  logger.debug(`[Channels:Session] Closed session ${sessionId}`);
}

export function closeChannelSessionsByChannel(channelId: string): void {
  for (const [id, session] of channelSessions) {
    if (session.channelId === channelId) {
      channelSessions.delete(id);
    }
  }
}
