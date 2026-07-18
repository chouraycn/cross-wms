import { logger } from "../../logger.js";
import type { ChannelId, AccountId } from "../../channels/types.js";

export type StreamingEventType =
  | "start"
  | "token"
  | "delta"
  | "tool_call"
  | "tool_result"
  | "end"
  | "error"
  | "interrupted";

export interface StreamingEvent {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  conversationId?: string;
  type: StreamingEventType;
  data?: unknown;
  delta?: string;
  token?: string;
  timestamp: number;
}

export interface StreamingSession {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  conversationId?: string;
  isActive: boolean;
  events: StreamingEvent[];
  accumulatedText: string;
  startedAt: number;
  endedAt?: number;
}

const streamingSessions = new Map<string, StreamingSession>();

export interface StreamingConfig {
  channelId: ChannelId;
  enabled: boolean;
  minTokenIntervalMs?: number;
  maxBufferedTokens?: number;
}

const streamingConfigs = new Map<ChannelId, StreamingConfig>();

export function configureStreaming(config: StreamingConfig): void {
  streamingConfigs.set(config.channelId, config);
  logger.debug(`[Channels:Streaming] Configured streaming for ${config.channelId}`);
}

export function getStreamingConfig(channelId: ChannelId): StreamingConfig {
  return streamingConfigs.get(channelId) ?? {
    channelId,
    enabled: false,
    minTokenIntervalMs: 50,
    maxBufferedTokens: 100,
  };
}

export function isStreamingEnabled(channelId: ChannelId): boolean {
  return getStreamingConfig(channelId).enabled;
}

export function startStreamingSession(params: {
  channelId: ChannelId;
  accountId?: AccountId;
  conversationId?: string;
}): StreamingSession {
  const sessionId = `stream-${params.channelId}-${Date.now()}`;
  const session: StreamingSession = {
    id: sessionId,
    channelId: params.channelId,
    accountId: params.accountId,
    conversationId: params.conversationId,
    isActive: true,
    events: [],
    accumulatedText: "",
    startedAt: Date.now(),
  };

  streamingSessions.set(sessionId, session);

  const startEvent: StreamingEvent = {
    id: `${sessionId}-start`,
    channelId: params.channelId,
    accountId: params.accountId,
    conversationId: params.conversationId,
    type: "start",
    timestamp: Date.now(),
  };

  session.events.push(startEvent);
  logger.debug(`[Channels:Streaming] Started session ${sessionId}`);

  return session;
}

export function pushStreamingToken(
  sessionId: string,
  token: string
): void {
  const session = streamingSessions.get(sessionId);
  if (!session || !session.isActive) return;

  session.accumulatedText += token;

  const event: StreamingEvent = {
    id: `${sessionId}-${session.events.length}`,
    channelId: session.channelId,
    accountId: session.accountId,
    conversationId: session.conversationId,
    type: "token",
    token,
    timestamp: Date.now(),
  };

  session.events.push(event);
}

export function pushStreamingDelta(
  sessionId: string,
  delta: string
): void {
  const session = streamingSessions.get(sessionId);
  if (!session || !session.isActive) return;

  session.accumulatedText += delta;

  const event: StreamingEvent = {
    id: `${sessionId}-${session.events.length}`,
    channelId: session.channelId,
    accountId: session.accountId,
    conversationId: session.conversationId,
    type: "delta",
    delta,
    timestamp: Date.now(),
  };

  session.events.push(event);
}

export function endStreamingSession(sessionId: string): void {
  const session = streamingSessions.get(sessionId);
  if (!session) return;

  session.isActive = false;
  session.endedAt = Date.now();

  const endEvent: StreamingEvent = {
    id: `${sessionId}-end`,
    channelId: session.channelId,
    accountId: session.accountId,
    conversationId: session.conversationId,
    type: "end",
    timestamp: Date.now(),
  };

  session.events.push(endEvent);
  logger.debug(`[Channels:Streaming] Ended session ${sessionId}`);
}

export function failStreamingSession(sessionId: string, error: string): void {
  const session = streamingSessions.get(sessionId);
  if (!session) return;

  session.isActive = false;
  session.endedAt = Date.now();

  const errorEvent: StreamingEvent = {
    id: `${sessionId}-error`,
    channelId: session.channelId,
    accountId: session.accountId,
    conversationId: session.conversationId,
    type: "error",
    data: { error },
    timestamp: Date.now(),
  };

  session.events.push(errorEvent);
  logger.debug(`[Channels:Streaming] Failed session ${sessionId}: ${error}`);
}

export function getStreamingSession(sessionId: string): StreamingSession | undefined {
  return streamingSessions.get(sessionId);
}

export function getActiveStreamingSessions(channelId?: ChannelId): StreamingSession[] {
  let sessions = Array.from(streamingSessions.values()).filter((s) => s.isActive);
  if (channelId) {
    sessions = sessions.filter((s) => s.channelId === channelId);
  }
  return sessions;
}

export function clearStreamingSessions(): void {
  streamingSessions.clear();
}
