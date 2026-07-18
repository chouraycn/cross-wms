import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import { SessionStore } from '../store.js';
import type { SessionStatus } from '../types.js';

export interface CleanupOptions {
  maxAgeMs?: number;
  maxArchivedAgeMs?: number;
  maxDeletedAgeMs?: number;
  dryRun?: boolean;
}

export interface CleanupResult {
  deletedActive: number;
  deletedArchived: number;
  deletedTemp: number;
  spaceReclaimedBytes: number;
  errors: string[];
  dryRun: boolean;
}

export class SessionCleanup {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  async cleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
    const opts = {
      maxAgeMs: 90 * 24 * 60 * 60 * 1000,
      maxArchivedAgeMs: 30 * 24 * 60 * 60 * 1000,
      maxDeletedAgeMs: 7 * 24 * 60 * 60 * 1000,
      dryRun: false,
      ...options,
    };

    const result: CleanupResult = {
      deletedActive: 0,
      deletedArchived: 0,
      deletedTemp: 0,
      spaceReclaimedBytes: 0,
      errors: [],
      dryRun: opts.dryRun,
    };

    logger.info('[SessionCleanup] 开始清理...');

    try {
      await this.cleanupOldActiveSessions(result, opts);
      await this.cleanupOldArchivedSessions(result, opts);
      this.cleanupTempFiles(result, opts);
      this.cleanupOrphanedMetadata(result);
    } catch (err) {
      result.errors.push(`清理异常: ${String(err)}`);
      logger.error('[SessionCleanup] 清理异常:', err);
    }

    logger.info(
      `[SessionCleanup] 清理完成: active=${result.deletedActive}, ` +
      `archived=${result.deletedArchived}, ` +
      `temp=${result.deletedTemp}, ` +
      `space=${(result.spaceReclaimedBytes / 1024 / 1024).toFixed(2)}MB`
    );

    return result;
  }

  private async cleanupOldActiveSessions(
    result: CleanupResult,
    opts: CleanupOptions
  ): Promise<void> {
    const paths = this.store.getPaths();
    const now = Date.now();

    try {
      const files = fs.readdirSync(paths.baseDir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;

        const sessionId = file.replace('.jsonl', '');
        const filePath = path.join(paths.baseDir, file);

        try {
          const stats = fs.statSync(filePath);
          const ageMs = now - stats.mtimeMs;

          const metadata = this.store.getMetadata(sessionId);

          if (metadata?.status === 'deleted') {
            if (ageMs > (opts.maxDeletedAgeMs || 7 * 24 * 60 * 60 * 1000)) {
              if (!result.dryRun) {
                await this.store.deleteSession(sessionId, true);
              }
              result.deletedActive++;
              result.spaceReclaimedBytes += stats.size;
            }
          } else if (metadata?.status === 'daily_reset') {
            if (ageMs > (opts.maxAgeMs || 90 * 24 * 60 * 60 * 1000)) {
              if (!result.dryRun) {
                await this.store.archiveSession(sessionId);
              }
              result.deletedActive++;
            }
          }
        } catch (err) {
          result.errors.push(`${sessionId}: ${String(err)}`);
        }
      }
    } catch (err) {
      result.errors.push(`active sessions cleanup: ${String(err)}`);
    }
  }

  private async cleanupOldArchivedSessions(
    result: CleanupResult,
    opts: CleanupOptions
  ): Promise<void> {
    const paths = this.store.getPaths();
    const now = Date.now();

    try {
      if (!fs.existsSync(paths.archivedDir)) return;

      const files = fs.readdirSync(paths.archivedDir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;

        const sessionId = file.replace('.jsonl', '');
        const filePath = path.join(paths.archivedDir, file);

        try {
          const stats = fs.statSync(filePath);
          const ageMs = now - stats.mtimeMs;

          if (ageMs > (opts.maxArchivedAgeMs || 30 * 24 * 60 * 60 * 1000)) {
            if (!result.dryRun) {
              await this.store.deleteSession(sessionId, true);
            }
            result.deletedArchived++;
            result.spaceReclaimedBytes += stats.size;
          }
        } catch (err) {
          result.errors.push(`archived/${sessionId}: ${String(err)}`);
        }
      }
    } catch (err) {
      result.errors.push(`archived sessions cleanup: ${String(err)}`);
    }
  }

  private cleanupTempFiles(result: CleanupResult, opts: CleanupOptions): void {
    const paths = this.store.getPaths();
    const tempDir = paths.tempDir;

    if (!fs.existsSync(tempDir)) return;

    const now = Date.now();
    const maxTempAgeMs = 24 * 60 * 60 * 1000;

    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > maxTempAgeMs) {
            if (!result.dryRun) {
              fs.unlinkSync(filePath);
            }
            result.deletedTemp++;
            result.spaceReclaimedBytes += stats.size;
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      result.errors.push(`temp cleanup: ${String(err)}`);
    }
  }

  private cleanupOrphanedMetadata(result: CleanupResult): void {
    const paths = this.store.getPaths();
    const metaDir = path.join(paths.baseDir, 'metadata');

    if (!fs.existsSync(metaDir)) return;

    try {
      const activeIds = new Set(this.store.listSessions().sessions.map(s => s.id));
      const metaFiles = fs.readdirSync(metaDir).filter(f => f.endsWith('.json'));

      for (const metaFile of metaFiles) {
        const sessionId = metaFile.replace('.json', '');
        if (!activeIds.has(sessionId)) {
          const metaPath = path.join(metaDir, metaFile);
          try {
            const size = fs.statSync(metaPath).size;
            if (!result.dryRun) {
              fs.unlinkSync(metaPath);
            }
            result.spaceReclaimedBytes += size;
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      result.errors.push(`orphan cleanup: ${String(err)}`);
    }
  }
}