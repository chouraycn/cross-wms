import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import { SessionStore } from '../store.js';
import type { SessionStatus, SessionMetadata } from '../types.js';

export interface ArchiveOptions {
  minAgeMs?: number;
  maxActiveSessions?: number;
  excludeTags?: string[];
  dryRun?: boolean;
}

export interface ArchiveResult {
  archivedCount: number;
  skippedCount: number;
  errors: string[];
  dryRun: boolean;
}

export class SessionArchive {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  async archive(options: ArchiveOptions = {}): Promise<ArchiveResult> {
    const opts = {
      minAgeMs: 24 * 60 * 60 * 1000,
      maxActiveSessions: 100,
      excludeTags: [] as string[],
      dryRun: false,
      ...options,
    };

    const result: ArchiveResult = {
      archivedCount: 0,
      skippedCount: 0,
      errors: [],
      dryRun: opts.dryRun,
    };

    logger.info('[SessionArchive] 开始归档...');

    try {
      await this.archiveIdleSessions(result, opts);

      if (opts.maxActiveSessions) {
        await this.enforceMaxActiveSessions(result, opts);
      }
    } catch (err) {
      result.errors.push(`归档异常: ${String(err)}`);
      logger.error('[SessionArchive] 归档异常:', err);
    }

    logger.info(
      `[SessionArchive] 归档完成: ${result.archivedCount} 个归档, ${result.skippedCount} 个跳过`
    );

    return result;
  }

  private async archiveIdleSessions(
    result: ArchiveResult,
    opts: ArchiveOptions
  ): Promise<void> {
    const threshold = new Date(Date.now() - (opts.minAgeMs || 24 * 60 * 60 * 1000)).toISOString();
    const activeSessions = this.store.listSessions({ status: 'active' }).sessions;

    for (const session of activeSessions) {
      if (this.shouldExclude(session, opts.excludeTags || [])) {
        result.skippedCount++;
        continue;
      }

      if (session.lastActiveAt < threshold) {
        try {
          if (!result.dryRun) {
            const success = await this.store.archiveSession(session.id);
            if (success) {
              result.archivedCount++;
              logger.info('[SessionArchive] 已归档:', session.id, session.title);
            } else {
              result.skippedCount++;
            }
          } else {
            result.archivedCount++;
            logger.info('[SessionArchive] 模拟归档:', session.id, session.title);
          }
        } catch (err) {
          result.errors.push(`${session.id}: ${String(err)}`);
          logger.error('[SessionArchive] 归档失败:', session.id, err);
        }
      }
    }
  }

  private async enforceMaxActiveSessions(
    result: ArchiveResult,
    opts: ArchiveOptions
  ): Promise<void> {
    const maxActive = opts.maxActiveSessions || 100;
    const activeSessions = this.store.listSessions({
      status: 'active',
      sortBy: 'lastActiveAt',
      sortOrder: 'asc',
    }).sessions;

    if (activeSessions.length <= maxActive) {
      return;
    }

    const sessionsToArchive = activeSessions.slice(0, activeSessions.length - maxActive);

    for (const session of sessionsToArchive) {
      if (this.shouldExclude(session, opts.excludeTags || [])) {
        result.skippedCount++;
        continue;
      }

      try {
        if (!result.dryRun) {
          const success = await this.store.archiveSession(session.id);
          if (success) {
            result.archivedCount++;
            logger.info('[SessionArchive] 强制归档:', session.id, session.title);
          }
        } else {
          result.archivedCount++;
        }
      } catch (err) {
        result.errors.push(`${session.id}: ${String(err)}`);
      }
    }
  }

  private shouldExclude(session: SessionMetadata, excludeTags: string[]): boolean {
    if (excludeTags.length === 0) return false;
    return session.tags.some(tag => excludeTags.includes(tag));
  }

  async restore(sessionId: string): Promise<boolean> {
    try {
      const success = await this.store.restoreSession(sessionId);
      if (success) {
        logger.info('[SessionArchive] 已恢复:', sessionId);
      }
      return success;
    } catch (err) {
      logger.error('[SessionArchive] 恢复失败:', sessionId, err);
      return false;
    }
  }

  listArchived(): SessionMetadata[] {
    return this.store.listSessions({ status: 'archived' }).sessions;
  }
}