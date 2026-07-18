import { logger } from "../../../logger.js";
import type { ChannelSession } from "../session.js";
import type { SessionStore } from "./session-store.js";
import { MemorySessionStore } from "./session-store.js";

export interface SessionManagerOptions {
  store?: SessionStore;
  sessionTimeoutMs?: number;
  cleanupIntervalMs?: number;
}

export class SessionManager {
  private store: SessionStore;
  private sessionTimeoutMs: number;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(options: SessionManagerOptions = {}) {
    this.store = options.store ?? new MemorySessionStore();
    this.sessionTimeoutMs = options.sessionTimeoutMs ?? 3600000;

    if (options.cleanupIntervalMs) {
      this.startCleanup(options.cleanupIntervalMs);
    }
  }

  async createSession(params: {
    channelId: string;
    channelType: string;
    targetId?: string;
    userId?: string;
  }): Promise<ChannelSession> {
    const sessionId = `${params.channelId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

    await this.store.set(session);
    logger.debug(`[ChannelSession:Manager] Created session ${sessionId}`);
    return session;
  }

  async getSession(sessionId: string): Promise<ChannelSession | undefined> {
    const session = await this.store.get(sessionId);
    if (session && this.isExpired(session)) {
      await this.store.delete(sessionId);
      logger.debug(`[ChannelSession:Manager] Session ${sessionId} expired and removed`);
      return undefined;
    }
    return session;
  }

  async getSessionOrThrow(sessionId: string): Promise<ChannelSession> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  async updateSessionActivity(sessionId: string): Promise<boolean> {
    const session = await this.store.get(sessionId);
    if (!session) return false;

    session.lastActivityTime = Date.now();
    await this.store.set(session);
    return true;
  }

  async updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<boolean> {
    const session = await this.store.get(sessionId);
    if (!session) return false;

    session.metadata = { ...session.metadata, ...metadata };
    await this.store.set(session);
    return true;
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.store.delete(sessionId);
    logger.debug(`[ChannelSession:Manager] Closed session ${sessionId}`);
  }

  async closeSessionsByChannel(channelId: string): Promise<void> {
    const sessions = await this.store.listByChannel(channelId);
    for (const session of sessions) {
      await this.store.delete(session.sessionId);
    }
    logger.debug(`[ChannelSession:Manager] Closed ${sessions.length} sessions for channel ${channelId}`);
  }

  async closeSessionsByUserId(userId: string): Promise<void> {
    const sessions = await this.store.listByUserId(userId);
    for (const session of sessions) {
      await this.store.delete(session.sessionId);
    }
    logger.debug(`[ChannelSession:Manager] Closed ${sessions.length} sessions for user ${userId}`);
  }

  async listSessions(): Promise<ChannelSession[]> {
    const sessions = await this.store.list();
    return sessions.filter((s) => !this.isExpired(s));
  }

  async listSessionsByChannel(channelId: string): Promise<ChannelSession[]> {
    const sessions = await this.store.listByChannel(channelId);
    return sessions.filter((s) => !this.isExpired(s));
  }

  async listSessionsByUserId(userId: string): Promise<ChannelSession[]> {
    const sessions = await this.store.listByUserId(userId);
    return sessions.filter((s) => !this.isExpired(s));
  }

  async getActiveSessionCount(): Promise<number> {
    const sessions = await this.store.list();
    return sessions.filter((s) => !this.isExpired(s)).length;
  }

  async cleanupExpired(): Promise<number> {
    const sessions = await this.store.list();
    let cleaned = 0;

    for (const session of sessions) {
      if (this.isExpired(session)) {
        await this.store.delete(session.sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[ChannelSession:Manager] Cleaned up ${cleaned} expired sessions`);
    }

    return cleaned;
  }

  async clearAllSessions(): Promise<void> {
    await this.store.clear();
    logger.debug(`[ChannelSession:Manager] All sessions cleared`);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  private startCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired().catch((error) => {
        logger.error("[ChannelSession:Manager] Cleanup error", { error });
      });
    }, intervalMs);
    this.cleanupInterval.unref?.();
  }

  private isExpired(session: ChannelSession): boolean {
    return Date.now() - session.lastActivityTime > this.sessionTimeoutMs;
  }
}