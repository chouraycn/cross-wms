import { z } from 'zod';
import { logger } from '../../../logger.js';
import { SessionStore } from './store.js';
import type { ThreadInfo } from './types.js';
import { ThreadInfoSchema } from './types.js';

export class ThreadInfoManager {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  getThreadInfo(sessionId: string): ThreadInfo | null {
    const sessionData = this.store.getSession(sessionId);
    return sessionData?.threadInfo || null;
  }

  async setThreadInfo(
    sessionId: string,
    threadInfo: ThreadInfo
  ): Promise<ThreadInfo | null> {
    const sessionData = this.store.getSession(sessionId);
    if (!sessionData) return null;

    const validated = ThreadInfoSchema.safeParse(threadInfo);
    if (!validated.success) {
      logger.warn('[ThreadInfo] 验证失败:', validated.error.issues);
      return null;
    }

    const writer = this.store.getWriter();
    const firstLine = JSON.stringify({
      session: sessionData.metadata,
      messages: [],
      ...sessionData,
      threadInfo: validated.data,
    });

    const result = await writer.rewriteFirstLine(sessionId, firstLine);
    if (result.success) {
      this.store.getCache().invalidateSessionData(sessionId);
      return validated.data;
    }

    return null;
  }

  async updateThreadInfo(
    sessionId: string,
    updates: Partial<ThreadInfo>
  ): Promise<ThreadInfo | null> {
    const current = this.getThreadInfo(sessionId);
    if (!current) return null;

    return this.setThreadInfo(sessionId, {
      ...current,
      ...updates,
    });
  }

  async clearThreadInfo(sessionId: string): Promise<boolean> {
    const sessionData = this.store.getSession(sessionId);
    if (!sessionData) return false;

    const writer = this.store.getWriter();
    const { threadInfo, ...rest } = sessionData;
    const firstLine = JSON.stringify({
      session: sessionData.metadata,
      messages: [],
      ...rest,
    });

    const result = await writer.rewriteFirstLine(sessionId, firstLine);
    if (result.success) {
      this.store.getCache().invalidateSessionData(sessionId);
      return true;
    }

    return false;
  }

  getThreadId(sessionId: string): string | null {
    const info = this.getThreadInfo(sessionId);
    return info?.threadId || null;
  }

  getParentThreadId(sessionId: string): string | null {
    const info = this.getThreadInfo(sessionId);
    return info?.parentThreadId || null;
  }

  getRootThreadId(sessionId: string): string | null {
    const info = this.getThreadInfo(sessionId);
    return info?.rootThreadId || null;
  }

  getDepth(sessionId: string): number {
    const info = this.getThreadInfo(sessionId);
    return info?.depth || 0;
  }

  async setBranchFromMessage(
    sessionId: string,
    messageId: string
  ): Promise<ThreadInfo | null> {
    return this.updateThreadInfo(sessionId, {
      branchFromMessageId: messageId,
    });
  }

  isRootThread(sessionId: string): boolean {
    const info = this.getThreadInfo(sessionId);
    return !info || info.depth === 0 || info.rootThreadId === info.threadId;
  }

  hasParentThread(sessionId: string): boolean {
    const info = this.getThreadInfo(sessionId);
    return !!info?.parentThreadId;
  }

  async createChildThread(
    parentSessionId: string,
    childSessionId: string,
    options: { branchFromMessageId?: string } = {}
  ): Promise<ThreadInfo | null> {
    const parentInfo = this.getThreadInfo(parentSessionId);
    const parentDepth = parentInfo?.depth || 0;

    const childThreadInfo: ThreadInfo = {
      threadId: childSessionId,
      parentThreadId: parentSessionId,
      rootThreadId: parentInfo?.rootThreadId || parentSessionId,
      depth: parentDepth + 1,
      branchFromMessageId: options.branchFromMessageId,
    };

    return this.setThreadInfo(childSessionId, childThreadInfo);
  }
}
