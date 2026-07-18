import type { ChannelId, AccountId } from "../../channels/types.js";
import type { ChannelTarget } from "./targets.js";

export type SessionStatus = "active" | "idle" | "closed" | "expired";

export interface ChannelSession {
  sessionId: string;
  channelId: ChannelId;
  accountId?: AccountId;
  target?: ChannelTarget;
  conversationId?: string;
  threadId?: string;
  userId?: string;
  status: SessionStatus;
  startTime: number;
  lastActivityTime: number;
  expiresAt?: number;
  metadata: Record<string, unknown>;
}

export interface SessionCreateOptions {
  sessionId?: string;
  accountId?: AccountId;
  target?: ChannelTarget;
  conversationId?: string;
  threadId?: string;
  userId?: string;
  ttlMs?: number;
  metadata?: Record<string, unknown>;
}

export interface SessionUpdateOptions {
  status?: SessionStatus;
  metadata?: Record<string, unknown>;
  expiresAt?: number;
}
