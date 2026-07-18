import { logger } from "../../../logger.js";
import type { ChannelSession } from "../session.js";

export interface ReconciliationResult {
  created: number;
  updated: number;
  closed: number;
  errors: string[];
}

export interface ReconciliationConfig {
  maxConcurrentSessions?: number;
  sessionTimeoutMs?: number;
  maxAgeMs?: number;
}

export class SessionReconciliation {
  private config: ReconciliationConfig;

  constructor(config: ReconciliationConfig = {}) {
    this.config = {
      maxConcurrentSessions: config.maxConcurrentSessions ?? 1000,
      sessionTimeoutMs: config.sessionTimeoutMs ?? 3600000,
      maxAgeMs: config.maxAgeMs ?? 86400000,
    };
  }

  async reconcile(
    storedSessions: ChannelSession[],
    activeSessions: ChannelSession[]
  ): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
      created: 0,
      updated: 0,
      closed: 0,
      errors: [],
    };

    try {
      const storedMap = new Map(storedSessions.map((s) => [s.sessionId, s]));
      const activeMap = new Map(activeSessions.map((s) => [s.sessionId, s]));

      for (const [sessionId, active] of activeMap) {
        const stored = storedMap.get(sessionId);

        if (!stored) {
          result.created++;
        } else {
          if (active.lastActivityTime > stored.lastActivityTime) {
            result.updated++;
          }
        }
      }

      for (const [sessionId, stored] of storedMap) {
        if (!activeMap.has(sessionId)) {
          if (this.shouldClose(stored)) {
            result.closed++;
          }
        }
      }

      if (storedSessions.length > (this.config.maxConcurrentSessions ?? 1000)) {
        result.closed += storedSessions.length - (this.config.maxConcurrentSessions ?? 1000);
      }

      logger.debug(`[ChannelSession:Reconciliation] Reconciled: created=${result.created}, updated=${result.updated}, closed=${result.closed}`);
    } catch (error) {
      result.errors.push((error as Error).message);
      logger.error("[ChannelSession:Reconciliation] Error during reconciliation", { error });
    }

    return result;
  }

  async validateSession(session: ChannelSession): Promise<{ valid: boolean; reason?: string }> {
    if (!session.sessionId) {
      return { valid: false, reason: "sessionId is missing" };
    }

    if (!session.channelId) {
      return { valid: false, reason: "channelId is missing" };
    }

    if (!session.channelType) {
      return { valid: false, reason: "channelType is missing" };
    }

    if (!session.startTime || session.startTime > Date.now()) {
      return { valid: false, reason: "invalid startTime" };
    }

    if (!session.lastActivityTime || session.lastActivityTime > Date.now()) {
      return { valid: false, reason: "invalid lastActivityTime" };
    }

    if (this.isExpired(session)) {
      return { valid: false, reason: "session expired" };
    }

    if (this.isTooOld(session)) {
      return { valid: false, reason: "session too old" };
    }

    return { valid: true };
  }

  async validateSessions(sessions: ChannelSession[]): Promise<{ valid: ChannelSession[]; invalid: ChannelSession[] }> {
    const valid: ChannelSession[] = [];
    const invalid: ChannelSession[] = [];

    for (const session of sessions) {
      const result = await this.validateSession(session);
      if (result.valid) {
        valid.push(session);
      } else {
        invalid.push(session);
      }
    }

    return { valid, invalid };
  }

  shouldClose(session: ChannelSession): boolean {
    return this.isExpired(session) || this.isTooOld(session);
  }

  private isExpired(session: ChannelSession): boolean {
    return Date.now() - (session.lastActivityTime ?? 0) > (this.config.sessionTimeoutMs ?? 3600000);
  }

  private isTooOld(session: ChannelSession): boolean {
    return Date.now() - (session.startTime ?? 0) > (this.config.maxAgeMs ?? 86400000);
  }
}