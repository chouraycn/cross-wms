import { getWebSocketHub } from './webSocketHub.js';
import { logger } from '../logger.js';

export interface SessionState {
  sessionKey: string;
  title?: string;
  status: 'active' | 'idle' | 'closed';
  lastActiveAt: number;
  createdAt: number;
  metadata: Record<string, unknown>;
  version: number;
}

export interface SessionSyncMessage {
  type: 'state' | 'event' | 'patch';
  sessionKey: string;
  data?: unknown;
  version?: number;
  event?: string;
  sourceClientId?: string;
  timestamp: number;
}

type SessionEventHandler = (sessionKey: string, event: string, data: unknown, sourceClientId?: string) => void;
type SessionStateChangeHandler = (sessionKey: string, state: SessionState, oldState?: SessionState) => void;

class SessionSyncManager {
  private sessions = new Map<string, SessionState>();
  private eventHandlers = new Set<SessionEventHandler>();
  private stateChangeHandlers = new Set<SessionStateChangeHandler>();
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    const wsHub = getWebSocketHub();

    wsHub.on('session:subscribed', (client, sessionKey) => {
      const state = this.sessions.get(sessionKey as string);
      if (state && client) {
        const clientObj = client as { id: string };
        this.sendSessionState(clientObj.id, state);
      }
    });

    logger.info('[SessionSync] Session sync manager initialized');
  }

  createSession(sessionKey: string, metadata?: Record<string, unknown>): SessionState {
    const now = Date.now();
    const state: SessionState = {
      sessionKey,
      status: 'active',
      lastActiveAt: now,
      createdAt: now,
      metadata: metadata || {},
      version: 1,
    };

    this.sessions.set(sessionKey, state);
    this.broadcastSessionEvent(sessionKey, 'session:created', state);
    this.notifyStateChange(sessionKey, state);

    return state;
  }

  getSession(sessionKey: string): SessionState | undefined {
    return this.sessions.get(sessionKey);
  }

  updateSession(sessionKey: string, updates: Partial<Omit<SessionState, 'sessionKey' | 'createdAt' | 'version'>>): SessionState | undefined {
    const existing = this.sessions.get(sessionKey);
    if (!existing) return undefined;

    const newState: SessionState = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...(updates.metadata || {}),
      },
      lastActiveAt: Date.now(),
      version: existing.version + 1,
    };

    this.sessions.set(sessionKey, newState);
    this.broadcastSessionState(sessionKey, newState);
    this.notifyStateChange(sessionKey, newState, existing);

    return newState;
  }

  deleteSession(sessionKey: string): boolean {
    const existed = this.sessions.delete(sessionKey);
    if (existed) {
      this.broadcastSessionEvent(sessionKey, 'session:deleted', { sessionKey });
    }
    return existed;
  }

  setSessionStatus(sessionKey: string, status: SessionState['status']): SessionState | undefined {
    return this.updateSession(sessionKey, { status });
  }

  setSessionMetadata(sessionKey: string, metadata: Record<string, unknown>): SessionState | undefined {
    return this.updateSession(sessionKey, { metadata });
  }

  sendEvent(sessionKey: string, event: string, data?: unknown, sourceClientId?: string): number {
    const state = this.sessions.get(sessionKey);
    if (state) {
      state.lastActiveAt = Date.now();
      state.version++;
    }

    this.notifyEvent(sessionKey, event, data, sourceClientId);

    return this.broadcastSessionEvent(sessionKey, event, data, sourceClientId);
  }

  private broadcastSessionState(sessionKey: string, state: SessionState, excludeClientId?: string): number {
    const wsHub = getWebSocketHub();
    return wsHub.sendSessionEvent(sessionKey, 'session:state', state, excludeClientId);
  }

  private broadcastSessionEvent(sessionKey: string, event: string, data?: unknown, excludeClientId?: string): number {
    const wsHub = getWebSocketHub();
    return wsHub.sendSessionEvent(sessionKey, event, data, excludeClientId);
  }

  private sendSessionState(clientId: string, state: SessionState): void {
    const wsHub = getWebSocketHub();
    wsHub.sendToClientById(clientId, {
      type: 'event',
      event: 'session:state',
      data: state,
      timestamp: Date.now(),
    });
  }

  onEvent(handler: SessionEventHandler): void {
    this.eventHandlers.add(handler);
  }

  offEvent(handler: SessionEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  onStateChange(handler: SessionStateChangeHandler): void {
    this.stateChangeHandlers.add(handler);
  }

  offStateChange(handler: SessionStateChangeHandler): void {
    this.stateChangeHandlers.delete(handler);
  }

  private notifyEvent(sessionKey: string, event: string, data: unknown, sourceClientId?: string): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(sessionKey, event, data, sourceClientId);
      } catch (err) {
        logger.error('[SessionSync] Event handler error:', err);
      }
    }
  }

  private notifyStateChange(sessionKey: string, state: SessionState, oldState?: SessionState): void {
    for (const handler of this.stateChangeHandlers) {
      try {
        handler(sessionKey, state, oldState);
      } catch (err) {
        logger.error('[SessionSync] State change handler error:', err);
      }
    }
  }

  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessions(): SessionState[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  cleanupIdleSessions(idleTimeoutMs: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, state] of this.sessions) {
      if (state.status !== 'closed' && now - state.lastActiveAt > idleTimeoutMs) {
        state.status = 'closed';
        state.version++;
        this.broadcastSessionEvent(key, 'session:closed', { sessionKey: key, reason: 'idle_timeout' });
        this.notifyStateChange(key, state);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`[SessionSync] Cleaned up ${cleaned} idle sessions`);
    }

    return cleaned;
  }
}

const SESSION_SYNC_INSTANCE = new SessionSyncManager();

export function getSessionSyncManager(): SessionSyncManager {
  return SESSION_SYNC_INSTANCE;
}

export function initSessionSync(): void {
  SESSION_SYNC_INSTANCE.init();
}
