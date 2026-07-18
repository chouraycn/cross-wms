/**
 * 轨迹清理
 *
 * 提供轨迹数据的清理和维护功能，
 * 包括策略化清理、保留规则、磁盘空间管理等。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import type {
  CleanupPolicy,
  CleanupPolicyType,
  TrajectoryCleanupResult,
  TrajectorySessionInfo,
  TrajectoryStatus,
} from './types.js';

export type TrajectoryCleanupOptions = {
  maxAgeDays?: number;
  maxTotalBytes?: number;
  minSessionsToKeep?: number;
  dryRun?: boolean;
};

export { TrajectoryCleanupResult, TrajectorySessionInfo };

const DEFAULT_MAX_AGE_DAYS = 30;
const DEFAULT_MIN_SESSIONS_TO_KEEP = 10;

export class TrajectoryCleanupManager {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async listSessions(): Promise<TrajectorySessionInfo[]> {
    const sessions: TrajectorySessionInfo[] = [];

    try {
      const entries = await fs.readdir(this.rootDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const sessionDir = path.join(this.rootDir, entry.name);
        const trajectoryFile = path.join(sessionDir, 'trajectory.jsonl');

        try {
          const stats = await fs.stat(trajectoryFile);
          const dirStats = await fs.stat(sessionDir);

          let eventCount: number | undefined;
          let status: TrajectoryStatus | undefined;
          let tags: string[] | undefined;

          try {
            const metadataPath = path.join(sessionDir, 'metadata.json');
            const metadataContent = await fs.readFile(metadataPath, 'utf-8');
            const metadata = JSON.parse(metadataContent);
            eventCount = metadata.eventCount;
            status = metadata.status;
            tags = metadata.tags;
          } catch {
            // ignore missing metadata
          }

          sessions.push({
            sessionId: entry.name,
            directory: sessionDir,
            sizeBytes: stats.size,
            modifiedAt: stats.mtime,
            createdAt: dirStats.birthtime,
            eventCount,
            status,
            tags,
          });
        } catch {
          // skip sessions without trajectory files
        }
      }

      sessions.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    } catch (err) {
      logger.error(`[Trajectory Cleanup] Failed to list sessions: ${String(err)}`);
    }

    return sessions;
  }

  private async getDirectorySize(dir: string): Promise<number> {
    let totalSize = 0;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          try {
            const stats = await fs.stat(fullPath);
            totalSize += stats.size;
          } catch {
            // skip files we can't stat
          }
        }
      }
    } catch {
      // return 0;
    }

    return totalSize;
  }

  private shouldPreserve(session: TrajectorySessionInfo, policy: CleanupPolicy): boolean {
    if (policy.preserveTags && policy.preserveTags.length > 0 && session.tags) {
      const sessionTags = new Set(session.tags);
      if (policy.preserveTags.some((tag) => sessionTags.has(tag))) {
        return true;
      }
    }

    if (policy.preservePattern) {
      if (policy.preservePattern.test(session.sessionId)) {
        return true;
      }
    }

    return false;
  }

  async cleanupByAge(maxAgeDays: number, dryRun = false): Promise<TrajectoryCleanupResult> {
    const policy: CleanupPolicy = {
      type: 'age',
      maxAgeDays,
      dryRun,
    };
    return this.executeCleanup(policy);
  }

  async cleanupBySize(
    maxTotalBytes: number,
    minSessionsToKeep = DEFAULT_MIN_SESSIONS_TO_KEEP,
    dryRun = false,
  ): Promise<TrajectoryCleanupResult> {
    const policy: CleanupPolicy = {
      type: 'size',
      maxTotalBytes,
      minSessionsToKeep,
      dryRun,
    };
    return this.executeCleanup(policy);
  }

  async cleanupByCount(
    maxSessionCount: number,
    minSessionsToKeep = DEFAULT_MIN_SESSIONS_TO_KEEP,
    dryRun = false,
  ): Promise<TrajectoryCleanupResult> {
    const policy: CleanupPolicy = {
      type: 'count',
      maxSessionCount,
      minSessionsToKeep,
      dryRun,
    };
    return this.executeCleanup(policy);
  }

  async executeCleanup(policy: CleanupPolicy): Promise<TrajectoryCleanupResult> {
    const sessions = await this.listSessions();
    let totalBytes = sessions.reduce((sum, s) => sum + s.sizeBytes, 0);

    const result: TrajectoryCleanupResult = {
      deletedSessions: [],
      freedBytes: 0,
      totalSessionsBefore: sessions.length,
      totalSessionsAfter: sessions.length,
      totalBytesBefore: totalBytes,
      totalBytesAfter: totalBytes,
      policy,
      errors: [],
    };

    const minSessionsToKeep = policy.minSessionsToKeep ?? DEFAULT_MIN_SESSIONS_TO_KEEP;

    const candidates = sessions.filter((s) => !this.shouldPreserve(s, policy));
    const preserved = sessions.filter((s) => this.shouldPreserve(s, policy));

    let toDelete: TrajectorySessionInfo[] = [];

    switch (policy.type) {
      case 'age': {
        const maxAgeMs = (policy.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;
        const now = Date.now();
        toDelete = candidates.filter((session) => {
          const age = now - session.modifiedAt.getTime();
          return age > maxAgeMs;
        });
        break;
      }
      case 'size': {
        const maxTotalBytes = policy.maxTotalBytes ?? 0;
        if (totalBytes <= maxTotalBytes) {
          return result;
        }
        const sortedByAge = [...candidates].sort(
          (a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime(),
        );
        let currentBytes = totalBytes;
        for (const session of sortedByAge) {
          if (result.totalSessionsAfter - toDelete.length <= minSessionsToKeep + preserved.length) {
            break;
          }
          if (currentBytes <= maxTotalBytes) {
            break;
          }
          toDelete.push(session);
          currentBytes -= session.sizeBytes;
        }
        break;
      }
      case 'count': {
        const maxSessionCount = policy.maxSessionCount ?? 0;
        if (sessions.length <= maxSessionCount) {
          return result;
        }
        const sortedByAge = [...candidates].sort(
          (a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime(),
        );
        const deleteCount = Math.max(0, sessions.length - maxSessionCount);
        toDelete = sortedByAge.slice(0, deleteCount);
        break;
      }
      case 'manual':
      default:
        return result;
    }

    if (result.totalSessionsAfter - toDelete.length < minSessionsToKeep + preserved.length) {
      const canDelete = Math.max(0, result.totalSessionsAfter - minSessionsToKeep - preserved.length);
      toDelete = toDelete.slice(0, canDelete);
    }

    for (const session of toDelete) {
      if (!policy.dryRun) {
        try {
          await fs.rm(session.directory, { recursive: true, force: true });
          result.deletedSessions.push(session.sessionId);
          result.freedBytes += session.sizeBytes;
          result.totalSessionsAfter--;
          result.totalBytesAfter -= session.sizeBytes;
          logger.info(`[Trajectory Cleanup] Deleted session: ${session.sessionId}`);
        } catch (err) {
          result.errors.push({
            sessionId: session.sessionId,
            error: String(err),
          });
          logger.error(`[Trajectory Cleanup] Failed to delete session ${session.sessionId}: ${String(err)}`);
        }
      } else {
        result.deletedSessions.push(session.sessionId);
        result.freedBytes += session.sizeBytes;
        result.totalSessionsAfter--;
        result.totalBytesAfter -= session.sizeBytes;
      }
    }

    logger.info(
      `[Trajectory Cleanup] Cleanup complete: deleted ${result.deletedSessions.length} sessions, freed ${formatBytes(result.freedBytes)}`,
    );

    return result;
  }

  async cleanup(options: TrajectoryCleanupOptions = {}): Promise<TrajectoryCleanupResult> {
    const {
      maxAgeDays = DEFAULT_MAX_AGE_DAYS,
      maxTotalBytes,
      minSessionsToKeep = DEFAULT_MIN_SESSIONS_TO_KEEP,
      dryRun = false,
    } = options;

    let policy: CleanupPolicy = {
      type: 'age',
      maxAgeDays,
      minSessionsToKeep,
      dryRun,
    };

    if (maxTotalBytes !== undefined) {
      policy = {
        type: 'size',
        maxTotalBytes,
        minSessionsToKeep,
        dryRun,
      };
    }

    return this.executeCleanup(policy);
  }

  async getTotalSize(): Promise<number> {
    return this.getDirectorySize(this.rootDir);
  }

  async getDiskUsage(): Promise<{
    totalBytes: number;
    sessionCount: number;
    averageSize: number;
    largestSession?: { sessionId: string; sizeBytes: number };
    oldestSession?: { sessionId: string; modifiedAt: Date };
  }> {
    const sessions = await this.listSessions();
    const totalBytes = sessions.reduce((sum, s) => sum + s.sizeBytes, 0);
    const averageSize = sessions.length > 0 ? totalBytes / sessions.length : 0;

    let largestSession: { sessionId: string; sizeBytes: number } | undefined;
    let oldestSession: { sessionId: string; modifiedAt: Date } | undefined;

    for (const session of sessions) {
      if (!largestSession || session.sizeBytes > largestSession.sizeBytes) {
        largestSession = { sessionId: session.sessionId, sizeBytes: session.sizeBytes };
      }
      if (!oldestSession || session.modifiedAt < oldestSession.modifiedAt) {
        oldestSession = { sessionId: session.sessionId, modifiedAt: session.modifiedAt };
      }
    }

    return {
      totalBytes,
      sessionCount: sessions.length,
      averageSize,
      largestSession,
      oldestSession,
    };
  }

  async estimateCleanupImpact(policy: CleanupPolicy): Promise<{
    wouldDelete: number;
    wouldFreeBytes: number;
    wouldRemain: number;
    wouldRemainBytes: number;
  }> {
    const dryRunPolicy = { ...policy, dryRun: true };
    const result = await this.executeCleanup(dryRunPolicy);

    return {
      wouldDelete: result.deletedSessions.length,
      wouldFreeBytes: result.freedBytes,
      wouldRemain: result.totalSessionsAfter,
      wouldRemainBytes: result.totalBytesAfter,
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function createTrajectoryCleanupManager(rootDir: string): TrajectoryCleanupManager {
  return new TrajectoryCleanupManager(rootDir);
}
