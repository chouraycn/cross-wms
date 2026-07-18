/**
 * MCP 会话管理器
 *
 * 实现 MCP 会话管理，支持 session 级别的资源和订阅管理。
 * 支持会话状态管理、过期清理、会话元数据等高级功能。
 */

import { logger } from '../../logger.js';
import { ResourceManager, type ResourceContent } from './resource-manager.js';
import type { MCPSessionState, MCPSession, MCPClientCapabilities } from './types.js';

export type McpSession = {
  id: string;
  clientId: string;
  state: MCPSessionState;
  createdAt: number;
  lastActivityAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
  resources: ResourceManager;
  subscriptions: Map<string, () => void>;
  capabilities?: MCPClientCapabilities;
  toolContext?: Record<string, unknown>;
};

export class McpSessionManager {
  private sessions: Map<string, McpSession> = new Map();
  private clientSessions: Map<string, Set<string>> = new Map();
  private sessionTimeout: number = 30 * 60 * 1000;
  private cleanupInterval?: ReturnType<typeof setInterval>;
  private maxSessionsPerClient: number = 10;

  constructor() {
    this.startCleanup();
  }

  createSession(clientId: string, metadata?: Record<string, unknown>, options?: {
    capabilities?: MCPClientCapabilities;
    ttlMs?: number;
  }): McpSession {
    const clientSessionCount = this.getClientSessionCount(clientId);
    if (clientSessionCount >= this.maxSessionsPerClient) {
      const oldestSession = this.getOldestClientSession(clientId);
      if (oldestSession) {
        this.closeSession(oldestSession.id);
        logger.debug(`[McpSessionManager] Evicted oldest session for client ${clientId} to make room for new session`);
      }
    }

    const sessionId = this.generateSessionId();
    const now = Date.now();

    const session: McpSession = {
      id: sessionId,
      clientId,
      state: 'active',
      createdAt: now,
      lastActivityAt: now,
      expiresAt: options?.ttlMs ? now + options.ttlMs : undefined,
      metadata,
      resources: new ResourceManager(),
      subscriptions: new Map(),
      capabilities: options?.capabilities,
      toolContext: {},
    };

    this.sessions.set(sessionId, session);

    if (!this.clientSessions.has(clientId)) {
      this.clientSessions.set(clientId, new Set());
    }
    this.clientSessions.get(clientId)!.add(sessionId);

    logger.debug(`[McpSessionManager] Created session ${sessionId} for client ${clientId}`);
    return session;
  }

  private getOldestClientSession(clientId: string): McpSession | undefined {
    const sessionIds = this.clientSessions.get(clientId);
    if (!sessionIds || sessionIds.size === 0) {
      return undefined;
    }

    let oldest: McpSession | undefined;
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (session && (!oldest || session.createdAt < oldest.createdAt)) {
        oldest = session;
      }
    }
    return oldest;
  }

  getSession(sessionId: string): McpSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = Date.now();
      if (session.state === 'inactive') {
        session.state = 'active';
      }
    }
    return session;
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    for (const unsubscribe of session.subscriptions.values()) {
      try {
        unsubscribe();
      } catch (err) {
        logger.error(`[McpSessionManager] Unsubscribe error: ${String(err)}`);
      }
    }

    session.resources.clear();
    session.state = 'closed';

    this.sessions.delete(sessionId);

    const clientSessions = this.clientSessions.get(session.clientId);
    if (clientSessions) {
      clientSessions.delete(sessionId);
      if (clientSessions.size === 0) {
        this.clientSessions.delete(session.clientId);
      }
    }

    logger.debug(`[McpSessionManager] Closed session ${sessionId}`);
  }

  closeClientSessions(clientId: string): void {
    const sessionIds = this.clientSessions.get(clientId);
    if (!sessionIds) {
      return;
    }

    for (const sessionId of Array.from(sessionIds)) {
      this.closeSession(sessionId);
    }

    logger.debug(`[McpSessionManager] Closed all sessions for client ${clientId}`);
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getClientSessionCount(clientId: string): number {
    return this.clientSessions.get(clientId)?.size ?? 0;
  }

  listSessions(): Array<{
    id: string;
    clientId: string;
    state: MCPSessionState;
    createdAt: number;
    lastActivityAt: number;
    expiresAt?: number;
  }> {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      clientId: session.clientId,
      state: session.state,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
    }));
  }

  listClientSessions(clientId: string): Array<{
    id: string;
    state: MCPSessionState;
    createdAt: number;
    lastActivityAt: number;
  }> {
    const sessionIds = this.clientSessions.get(clientId);
    if (!sessionIds) {
      return [];
    }

    return Array.from(sessionIds)
      .map((id) => this.sessions.get(id))
      .filter((session): session is McpSession => session !== undefined)
      .map((session) => ({
        id: session.id,
        state: session.state,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
      }));
  }

  subscribeToResource(
    sessionId: string,
    uri: string,
    globalResourceManager: ResourceManager,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[McpSessionManager] Cannot subscribe to resource for non-existent session: ${sessionId}`);
      return;
    }

    if (session.subscriptions.has(uri)) {
      return;
    }

    const unsubscribe = globalResourceManager.subscribe(uri, (content: ResourceContent) => {
      session.resources.registerResource(uri, () => content);
    });

    session.subscriptions.set(uri, unsubscribe);
    logger.debug(`[McpSessionManager] Session ${sessionId} subscribed to resource ${uri}`);
  }

  unsubscribeFromResource(sessionId: string, uri: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const unsubscribe = session.subscriptions.get(uri);
    if (unsubscribe) {
      unsubscribe();
      session.subscriptions.delete(uri);
      logger.debug(`[McpSessionManager] Session ${sessionId} unsubscribed from resource ${uri}`);
    }
  }

  setSessionTimeout(timeoutMs: number): void {
    this.sessionTimeout = timeoutMs;
    logger.debug(`[McpSessionManager] Set session timeout to ${timeoutMs}ms`);
  }

  setMaxSessionsPerClient(max: number): void {
    this.maxSessionsPerClient = max;
    logger.debug(`[McpSessionManager] Set max sessions per client to ${max}`);
  }

  cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessionIds: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      const isTimeoutExpired = now - session.lastActivityAt > this.sessionTimeout;
      const isTtlExpired = session.expiresAt !== undefined && now > session.expiresAt;

      if (isTimeoutExpired || isTtlExpired) {
        expiredSessionIds.push(sessionId);
      }
    }

    for (const sessionId of expiredSessionIds) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.state = 'expired';
      }
      logger.info(`[McpSessionManager] Cleaning up expired session ${sessionId}`);
      this.closeSession(sessionId);
    }

    if (expiredSessionIds.length > 0) {
      logger.debug(`[McpSessionManager] Cleaned up ${expiredSessionIds.length} expired sessions`);
    }
  }

  clear(): void {
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.closeSession(sessionId);
    }
    logger.debug('[McpSessionManager] Cleared all sessions');
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clear();
    logger.debug('[McpSessionManager] Destroyed');
  }

  touchSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.lastActivityAt = Date.now();
    if (session.state === 'inactive') {
      session.state = 'active';
    }
    return true;
  }

  setSessionState(sessionId: string, state: MCPSessionState): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.state = state;
    return true;
  }

  getSessionState(sessionId: string): MCPSessionState | undefined {
    return this.sessions.get(sessionId)?.state;
  }

  updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.metadata = { ...session.metadata, ...metadata };
    return true;
  }

  setToolContext(sessionId: string, key: string, value: unknown): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    if (!session.toolContext) {
      session.toolContext = {};
    }
    session.toolContext[key] = value;
    return true;
  }

  getToolContext(sessionId: string, key: string): unknown {
    return this.sessions.get(sessionId)?.toolContext?.[key];
  }

  clearToolContext(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.toolContext = {};
    return true;
  }

  setSessionCapabilities(sessionId: string, capabilities: MCPClientCapabilities): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.capabilities = capabilities;
    return true;
  }

  getActiveSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.state === 'active') {
        count++;
      }
    }
    return count;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 1000);
  }
}

export const mcpSessionManager = new McpSessionManager();

export function createSession(clientId: string, metadata?: Record<string, unknown>): McpSession {
  return mcpSessionManager.createSession(clientId, metadata);
}

export function getSession(sessionId: string): McpSession | undefined {
  return mcpSessionManager.getSession(sessionId);
}

export function closeSession(sessionId: string): void {
  mcpSessionManager.closeSession(sessionId);
}
