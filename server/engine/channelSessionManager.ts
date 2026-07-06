import { EventEmitter } from 'events';
import { logger } from '../logger.js';
import type { ChannelType, ChannelMessage, ChannelConfig } from './channelSystem.js';

export type SessionId = string;
export type ChannelSessionStatus = 'active' | 'inactive' | 'closed' | 'error';

export interface ChannelSession {
  sessionId: SessionId;
  channelType: ChannelType;
  channelName: string;
  accountId?: string;
  status: ChannelSessionStatus;
  createdAt: number;
  lastActivityAt: number;
  metadata: Record<string, unknown>;
}

export interface TypingState {
  sessionId: SessionId;
  userId: string;
  isTyping: boolean;
  timestamp: number;
}

export interface ChannelTarget {
  id: string;
  type: 'direct' | 'group' | 'channel';
  name: string;
  channelType: ChannelType;
  channelName: string;
}

export interface TargetRoute {
  targetId: string;
  channelName: string;
  priority: number;
}

export interface MessageRoutingResult {
  success: boolean;
  targetId?: string;
  channelName?: string;
  error?: string;
}

export class ChannelSessionManager extends EventEmitter {
  private sessions = new Map<SessionId, ChannelSession>();
  private typingStates = new Map<string, TypingState>();
  private targets = new Map<string, ChannelTarget>();
  private routes = new Map<string, TargetRoute[]>();
  private sessionByChannel = new Map<string, SessionId[]>();

  createSession(channelName: string, channelType: ChannelType, accountId?: string, metadata?: Record<string, unknown>): ChannelSession {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session: ChannelSession = {
      sessionId,
      channelType,
      channelName,
      accountId,
      status: 'active',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      metadata: metadata ?? {},
    };

    this.sessions.set(sessionId, session);

    const key = `${channelType}:${channelName}`;
    const existing = this.sessionByChannel.get(key) ?? [];
    existing.push(sessionId);
    this.sessionByChannel.set(key, existing);

    this.emit('session_created', session);
    logger.info(`[ChannelSessionManager] Created session: ${sessionId} (${channelType}/${channelName})`);

    return session;
  }

  getSession(sessionId: SessionId): ChannelSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(channelName?: string, channelType?: ChannelType): ChannelSession[] {
    let sessions = Array.from(this.sessions.values());

    if (channelName) {
      sessions = sessions.filter(s => s.channelName === channelName);
    }

    if (channelType) {
      sessions = sessions.filter(s => s.channelType === channelType);
    }

    return sessions;
  }

  updateSessionStatus(sessionId: SessionId, status: ChannelSessionStatus): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = status;
    session.lastActivityAt = Date.now();
    this.sessions.set(sessionId, session);

    this.emit('session_status_changed', { sessionId, status });
    logger.info(`[ChannelSessionManager] Session ${sessionId} status changed to ${status}`);

    return true;
  }

  updateSessionActivity(sessionId: SessionId, metadata?: Record<string, unknown>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.lastActivityAt = Date.now();
    if (metadata) {
      session.metadata = { ...session.metadata, ...metadata };
    }
    this.sessions.set(sessionId, session);

    return true;
  }

  closeSession(sessionId: SessionId): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = 'closed';
    session.lastActivityAt = Date.now();
    this.sessions.set(sessionId, session);

    const key = `${session.channelType}:${session.channelName}`;
    const existing = this.sessionByChannel.get(key) ?? [];
    const filtered = existing.filter(id => id !== sessionId);
    this.sessionByChannel.set(key, filtered);

    this.emit('session_closed', session);
    logger.info(`[ChannelSessionManager] Closed session: ${sessionId}`);

    return true;
  }

  cleanupInactiveSessions(timeoutMs: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (session.status === 'active' && now - session.lastActivityAt > timeoutMs) {
        this.closeSession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`[ChannelSessionManager] Cleaned ${cleaned} inactive sessions`);
    }

    return cleaned;
  }

  setTypingState(sessionId: SessionId, userId: string, isTyping: boolean): void {
    const key = `${sessionId}:${userId}`;
    const state: TypingState = {
      sessionId,
      userId,
      isTyping,
      timestamp: Date.now(),
    };

    this.typingStates.set(key, state);
    this.emit('typing_changed', state);

    if (isTyping) {
      logger.debug(`[ChannelSessionManager] User ${userId} is typing in session ${sessionId}`);
    }
  }

  getTypingState(sessionId: SessionId): TypingState[] {
    return Array.from(this.typingStates.values())
      .filter(s => s.sessionId === sessionId && s.isTyping);
  }

  clearTypingState(sessionId: SessionId, userId?: string): void {
    if (userId) {
      const key = `${sessionId}:${userId}`;
      this.typingStates.delete(key);
    } else {
      for (const key of this.typingStates.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
          this.typingStates.delete(key);
        }
      }
    }
  }

  registerTarget(target: ChannelTarget): void {
    this.targets.set(target.id, target);
    this.emit('target_registered', target);
    logger.info(`[ChannelSessionManager] Registered target: ${target.id} (${target.type})`);
  }

  getTarget(targetId: string): ChannelTarget | undefined {
    return this.targets.get(targetId);
  }

  listTargets(channelType?: ChannelType): ChannelTarget[] {
    let targets = Array.from(this.targets.values());
    if (channelType) {
      targets = targets.filter(t => t.channelType === channelType);
    }
    return targets;
  }

  unregisterTarget(targetId: string): void {
    this.targets.delete(targetId);
    this.emit('target_unregistered', targetId);
    logger.info(`[ChannelSessionManager] Unregistered target: ${targetId}`);
  }

  addRoute(targetId: string, route: Omit<TargetRoute, 'targetId'>): void {
    const routes = this.routes.get(targetId) ?? [];
    routes.push({ ...route, targetId });
    routes.sort((a, b) => b.priority - a.priority);
    this.routes.set(targetId, routes);

    this.emit('route_added', { targetId, route });
    logger.info(`[ChannelSessionManager] Added route for ${targetId}: ${route.channelName} (priority ${route.priority})`);
  }

  getRoutes(targetId: string): TargetRoute[] {
    return this.routes.get(targetId) ?? [];
  }

  removeRoute(targetId: string, channelName: string): void {
    const routes = this.routes.get(targetId) ?? [];
    const filtered = routes.filter(r => r.channelName !== channelName);
    this.routes.set(targetId, filtered);

    this.emit('route_removed', { targetId, channelName });
    logger.info(`[ChannelSessionManager] Removed route for ${targetId}: ${channelName}`);
  }

  routeMessage(targetId: string, content: string, contentType?: 'text' | 'markdown' | 'json'): MessageRoutingResult {
    const routes = this.getRoutes(targetId);
    if (routes.length === 0) {
      return { success: false, error: 'No routes found for target' };
    }

    for (const route of routes) {
      const session = this.sessions.get(route.channelName);
      if (session && session.status === 'active') {
        this.updateSessionActivity(session.sessionId);
        return { success: true, targetId, channelName: route.channelName };
      }
    }

    return { success: false, error: 'No active session found for any route' };
  }

  getSessionStats(): {
    total: number;
    active: number;
    inactive: number;
    closed: number;
    byChannel: Record<string, number>;
  } {
    const byChannel: Record<string, number> = {};
    let active = 0;
    let inactive = 0;
    let closed = 0;

    for (const session of this.sessions.values()) {
      const key = `${session.channelType}:${session.channelName}`;
      byChannel[key] = (byChannel[key] ?? 0) + 1;

      switch (session.status) {
        case 'active': active++; break;
        case 'inactive': inactive++; break;
        case 'closed': closed++; break;
      }
    }

    return {
      total: this.sessions.size,
      active,
      inactive,
      closed,
      byChannel,
    };
  }
}

let globalSessionManager: ChannelSessionManager | null = null;

export function getChannelSessionManager(): ChannelSessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new ChannelSessionManager();
  }
  return globalSessionManager;
}

export function resetChannelSessionManager(): void {
  globalSessionManager = null;
}