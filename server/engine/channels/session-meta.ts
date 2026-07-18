import { logger } from "../../logger.js";
import type { ChannelId, AccountId } from "../../channels/types.js";

export interface SessionMeta {
  sessionId: string;
  channelId: ChannelId;
  accountId?: AccountId;
  conversationId?: string;
  threadId?: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  locale?: string;
  timezone?: string;
  startedAt: number;
  lastActivityAt: number;
  messageCount: number;
  turnCount: number;
  tags: string[];
  data: Record<string, unknown>;
}

const sessionMetaStore = new Map<string, SessionMeta>();

export function createSessionMeta(params: {
  sessionId: string;
  channelId: ChannelId;
  accountId?: AccountId;
  conversationId?: string;
  threadId?: string;
  userId?: string;
  userName?: string;
  locale?: string;
  timezone?: string;
  data?: Record<string, unknown>;
}): SessionMeta {
  const now = Date.now();
  const meta: SessionMeta = {
    sessionId: params.sessionId,
    channelId: params.channelId,
    accountId: params.accountId,
    conversationId: params.conversationId,
    threadId: params.threadId,
    userId: params.userId,
    userName: params.userName,
    locale: params.locale,
    timezone: params.timezone,
    startedAt: now,
    lastActivityAt: now,
    messageCount: 0,
    turnCount: 0,
    tags: [],
    data: params.data ?? {},
  };

  sessionMetaStore.set(params.sessionId, meta);
  logger.debug(`[Channels:SessionMeta] Created meta for session ${params.sessionId}`);
  return meta;
}

export function getSessionMeta(sessionId: string): SessionMeta | undefined {
  return sessionMetaStore.get(sessionId);
}

export function updateSessionMeta(
  sessionId: string,
  updates: Partial<SessionMeta>
): boolean {
  const meta = sessionMetaStore.get(sessionId);
  if (!meta) return false;

  Object.assign(meta, updates);
  meta.lastActivityAt = Date.now();
  return true;
}

export function incrementMessageCount(sessionId: string): number {
  const meta = sessionMetaStore.get(sessionId);
  if (!meta) return -1;
  meta.messageCount++;
  meta.lastActivityAt = Date.now();
  return meta.messageCount;
}

export function incrementTurnCount(sessionId: string): number {
  const meta = sessionMetaStore.get(sessionId);
  if (!meta) return -1;
  meta.turnCount++;
  meta.lastActivityAt = Date.now();
  return meta.turnCount;
}

export function addSessionTag(sessionId: string, tag: string): boolean {
  const meta = sessionMetaStore.get(sessionId);
  if (!meta) return false;
  if (!meta.tags.includes(tag)) {
    meta.tags.push(tag);
  }
  meta.lastActivityAt = Date.now();
  return true;
}

export function removeSessionTag(sessionId: string, tag: string): boolean {
  const meta = sessionMetaStore.get(sessionId);
  if (!meta) return false;
  const idx = meta.tags.indexOf(tag);
  if (idx >= 0) {
    meta.tags.splice(idx, 1);
  }
  meta.lastActivityAt = Date.now();
  return true;
}

export function hasSessionTag(sessionId: string, tag: string): boolean {
  return sessionMetaStore.get(sessionId)?.tags.includes(tag) ?? false;
}

export function setSessionData(sessionId: string, key: string, value: unknown): boolean {
  const meta = sessionMetaStore.get(sessionId);
  if (!meta) return false;
  meta.data[key] = value;
  meta.lastActivityAt = Date.now();
  return true;
}

export function getSessionData(sessionId: string, key: string): unknown {
  return sessionMetaStore.get(sessionId)?.data[key];
}

export function deleteSessionMeta(sessionId: string): boolean {
  return sessionMetaStore.delete(sessionId);
}

export function listSessionMetas(channelId?: ChannelId): SessionMeta[] {
  let metas = Array.from(sessionMetaStore.values());
  if (channelId) {
    metas = metas.filter((m) => m.channelId === channelId);
  }
  return metas;
}

export function clearSessionMetaStore(): void {
  sessionMetaStore.clear();
}

export function getSessionDuration(sessionId: string): number {
  const meta = sessionMetaStore.get(sessionId);
  if (!meta) return 0;
  return meta.lastActivityAt - meta.startedAt;
}
