import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import { SessionStore } from '../store.js';
import type { SessionStatus } from '../types.js';

export interface PurgeOptions {
  olderThan?: string;
  status?: SessionStatus[];
  excludeTags?: string[];
  dryRun?: boolean;
  force?: boolean;
}

export interface PurgeResult {
  deletedCount: number;
  skippedCount: number;
  spaceReclaimedBytes: number;
  errors: string[];
  dryRun: boolean;
}

export class SessionPurge {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  async purge(options: PurgeOptions = {}): Promise<PurgeResult> {
    const opts: PurgeOptions = {
      olderThan: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: ['deleted', 'archived', 'daily_reset'],
      excludeTags: [],
      dryRun: false,
      force: false,
      ...options,
    };

    if (!opts.force && !opts.dryRun) {
      logger.warn('[SessionPurge] 未设置 force 标志，执行 dry run');
      opts.dryRun = true;
    }

    const result: PurgeResult = {
      deletedCount: 0,
      skippedCount: 0,
      spaceReclaimedBytes: 0,
      errors: [],
      dryRun: opts.dryRun ?? false,
    };

    logger.info('[SessionPurge] 开始清理...');

    try {
      await this.purgeByStatus(result, opts);
    } catch (err) {
      result.errors.push(`清理异常: ${String(err)}`);
      logger.error('[SessionPurge] 清理异常:', err);
    }

    logger.info(
      `[SessionPurge] 清理完成: ${result.deletedCount} 个删除, ` +
      `节省 ${(result.spaceReclaimedBytes / 1024 / 1024).toFixed(2)}MB`
    );

    return result;
  }

  private async purgeByStatus(result: PurgeResult, opts: PurgeOptions): Promise<void> {
    const statusList = opts.status || ['deleted', 'archived', 'daily_reset'];

    for (const status of statusList) {
      const sessions = this.store.listSessions({ status }).sessions;

      for (const session of sessions) {
        if (this.shouldExclude(session, opts.excludeTags || [])) {
          result.skippedCount++;
          continue;
        }

        if (session.createdAt >= opts.olderThan!) {
          result.skippedCount++;
          continue;
        }

        try {
          const paths = this.store.getPaths();
          const baseDir = session.status === 'archived' ? paths.archivedDir : paths.baseDir;
          const filePath = path.join(baseDir, `${session.id}.jsonl`);

          let size = 0;
          if (fs.existsSync(filePath)) {
            size = fs.statSync(filePath).size;
          }

          if (!result.dryRun) {
            const success = await this.store.deleteSession(session.id, true);
            if (success) {
              result.deletedCount++;
              result.spaceReclaimedBytes += size;
              logger.info('[SessionPurge] 删除:', session.id, session.title);
            }
          } else {
            result.deletedCount++;
            result.spaceReclaimedBytes += size;
            logger.info('[SessionPurge] 模拟删除:', session.id, session.title);
          }
        } catch (err) {
          result.errors.push(`${session.id}: ${String(err)}`);
          logger.error('[SessionPurge] 删除失败:', session.id, err);
        }
      }
    }
  }

  private shouldExclude(session: { tags: string[] }, excludeTags: string[]): boolean {
    if (excludeTags.length === 0) return false;
    return session.tags.some(tag => excludeTags.includes(tag));
  }

  async purgeAll(): Promise<PurgeResult> {
    logger.warn('[SessionPurge] 正在删除所有会话...');

    const result: PurgeResult = {
      deletedCount: 0,
      skippedCount: 0,
      spaceReclaimedBytes: 0,
      errors: [],
      dryRun: false,
    };

    const allSessions = this.store.listSessions().sessions;

    for (const session of allSessions) {
      try {
        const success = await this.store.deleteSession(session.id, true);
        if (success) {
          result.deletedCount++;
          logger.info('[SessionPurge] 删除:', session.id);
        }
      } catch (err) {
        result.errors.push(`${session.id}: ${String(err)}`);
      }
    }

    logger.info(`[SessionPurge] 已删除 ${result.deletedCount} 个会话`);
    return result;
  }

  async purgeByDateRange(dateFrom: string, dateTo: string): Promise<PurgeResult> {
    const result: PurgeResult = {
      deletedCount: 0,
      skippedCount: 0,
      spaceReclaimedBytes: 0,
      errors: [],
      dryRun: false,
    };

    logger.info(`[SessionPurge] 删除日期范围: ${dateFrom} - ${dateTo}`);

    const allSessions = this.store.listSessions().sessions;

    for (const session of allSessions) {
      if (session.sessionDate >= dateFrom && session.sessionDate <= dateTo) {
        try {
          const success = await this.store.deleteSession(session.id, true);
          if (success) {
            result.deletedCount++;
          }
        } catch (err) {
          result.errors.push(`${session.id}: ${String(err)}`);
        }
      }
    }

    return result;
  }
}