import { z } from 'zod';
import { logger } from '../../../logger.js';
import { SessionStore } from './store.js';
import type { SessionTarget } from './types.js';
import { SessionTargetSchema } from './types.js';

export class SessionTargetsManager {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  getTargets(sessionId: string): SessionTarget[] {
    const sessionData = this.store.getSession(sessionId);
    return sessionData?.targets || [];
  }

  async addTarget(
    sessionId: string,
    target: SessionTarget
  ): Promise<SessionTarget[] | null> {
    const sessionData = this.store.getSession(sessionId);
    if (!sessionData) return null;

    const targets = [...sessionData.targets, target];
    return this.updateTargets(sessionId, targets);
  }

  async removeTarget(
    sessionId: string,
    targetIndex: number
  ): Promise<SessionTarget[] | null> {
    const sessionData = this.store.getSession(sessionId);
    if (!sessionData) return null;

    const targets = sessionData.targets.filter((_, i) => i !== targetIndex);
    return this.updateTargets(sessionId, targets);
  }

  async updateTargets(
    sessionId: string,
    targets: SessionTarget[]
  ): Promise<SessionTarget[] | null> {
    const sessionData = this.store.getSession(sessionId);
    if (!sessionData) return null;

    const validated = z.array(SessionTargetSchema).safeParse(targets);
    if (!validated.success) {
      logger.warn('[SessionTargets] 目标验证失败:', validated.error.issues);
      return null;
    }

    const writer = this.store.getWriter();
    const firstLine = JSON.stringify({
      session: sessionData.metadata,
      messages: [],
      ...sessionData,
      targets: validated.data,
    });

    const result = await writer.rewriteFirstLine(sessionId, firstLine);
    if (result.success) {
      this.store.getCache().invalidateSessionData(sessionId);
      return validated.data;
    }

    return null;
  }

  async clearTargets(sessionId: string): Promise<boolean> {
    const result = await this.updateTargets(sessionId, []);
    return result !== null;
  }

  hasTarget(sessionId: string, type: string, value: string): boolean {
    const targets = this.getTargets(sessionId);
    return targets.some(t => t.type === type && t.value === value);
  }

  getTargetsByType(sessionId: string, type: string): SessionTarget[] {
    const targets = this.getTargets(sessionId);
    return targets.filter(t => t.type === type);
  }

  getTargetCount(sessionId: string): number {
    return this.getTargets(sessionId).length;
  }
}
