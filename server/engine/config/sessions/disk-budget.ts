import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { listSessionFiles, listArchivedSessionFiles } from './session-file.js';
import { SessionStore } from './store.js';
import type { DiskBudgetConfig } from './types.js';

export interface DiskBudgetStatus {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  activeBytes: number;
  archivedBytes: number;
  tempBytes: number;
  isWarning: boolean;
  isCritical: boolean;
}

export interface BudgetCleanupResult {
  bytesToFree: number;
  bytesFreed: number;
  sessionsDeleted: number;
  archivedDeleted: number;
  errors: string[];
}

export class DiskBudgetManager {
  private store: SessionStore;
  private config: DiskBudgetConfig;

  constructor(store: SessionStore, config: Partial<DiskBudgetConfig> = {}) {
    this.store = store;
    this.config = {
      maxTotalBytes: 1 * 1024 * 1024 * 1024,
      maxSessionSizeBytes: 50 * 1024 * 1024,
      warningThresholdPercent: 80,
      cleanupStrategy: 'archived_first',
      ...config,
    };
  }

  getStatus(): DiskBudgetStatus {
    const maintenance = this.store.getMaintenance();
    const diskUsage = maintenance.getDiskUsage();

    const usedPercent = this.config.maxTotalBytes > 0
      ? (diskUsage.totalBytes / this.config.maxTotalBytes) * 100
      : 0;

    return {
      totalBytes: this.config.maxTotalBytes,
      usedBytes: diskUsage.totalBytes,
      availableBytes: Math.max(0, this.config.maxTotalBytes - diskUsage.totalBytes),
      usedPercent: Math.min(100, usedPercent),
      activeBytes: diskUsage.activeBytes,
      archivedBytes: diskUsage.archivedBytes,
      tempBytes: diskUsage.tempBytes,
      isWarning: usedPercent >= this.config.warningThresholdPercent,
      isCritical: usedPercent >= 95,
    };
  }

  checkBudget(): { ok: boolean; status: DiskBudgetStatus } {
    const status = this.getStatus();
    const ok = !status.isCritical;

    if (status.isCritical) {
      logger.error('[DiskBudget] 磁盘预算严重不足:', Math.round(status.usedPercent) + '%');
    } else if (status.isWarning) {
      logger.warn('[DiskBudget] 磁盘预算警告:', Math.round(status.usedPercent) + '%');
    }

    return { ok, status };
  }

  canWrite(sizeBytes: number): boolean {
    const status = this.getStatus();
    return status.availableBytes >= sizeBytes;
  }

  async ensureSpace(neededBytes: number): Promise<BudgetCleanupResult> {
    const status = this.getStatus();
    const result: BudgetCleanupResult = {
      bytesToFree: 0,
      bytesFreed: 0,
      sessionsDeleted: 0,
      archivedDeleted: 0,
      errors: [],
    };

    if (status.availableBytes >= neededBytes) {
      return result;
    }

    result.bytesToFree = neededBytes - status.availableBytes;
    logger.warn('[DiskBudget] 空间不足，需要清理:', Math.round(result.bytesToFree / 1024 / 1024) + 'MB');

    switch (this.config.cleanupStrategy) {
      case 'archived_first':
        await this.cleanupArchivedFirst(result);
        break;
      case 'oldest_first':
        await this.cleanupOldestFirst(result);
        break;
      case 'largest_first':
        await this.cleanupLargestFirst(result);
        break;
      default:
        await this.cleanupArchivedFirst(result);
    }

    return result;
  }

  private async cleanupArchivedFirst(result: BudgetCleanupResult): Promise<void> {
    const paths = this.store.getPaths();
    const archivedIds = listArchivedSessionFiles(paths.archivedDir);

    const sorted = archivedIds.map(id => {
      const info = this.getSessionInfo(paths.archivedDir, id);
      return { id, size: info?.size || 0, modifiedAt: info?.modifiedAt || new Date(0) };
    }).sort((a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime());

    for (const { id, size } of sorted) {
      if (result.bytesFreed >= result.bytesToFree) break;

      try {
        const success = await this.store.deleteSession(id, true);
        if (success) {
          result.archivedDeleted++;
          result.bytesFreed += size;
        }
      } catch (err) {
        result.errors.push(`${id}: ${String(err)}`);
      }
    }
  }

  private async cleanupOldestFirst(result: BudgetCleanupResult): Promise<void> {
    const paths = this.store.getPaths();
    const activeIds = listSessionFiles(paths.baseDir);

    const sorted = activeIds.map(id => {
      const info = this.getSessionInfo(paths.baseDir, id);
      return { id, size: info?.size || 0, modifiedAt: info?.modifiedAt || new Date(0) };
    }).sort((a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime());

    for (const { id, size } of sorted) {
      if (result.bytesFreed >= result.bytesToFree) break;

      try {
        const success = await this.store.deleteSession(id, true);
        if (success) {
          result.sessionsDeleted++;
          result.bytesFreed += size;
        }
      } catch (err) {
        result.errors.push(`${id}: ${String(err)}`);
      }
    }
  }

  private async cleanupLargestFirst(result: BudgetCleanupResult): Promise<void> {
    const paths = this.store.getPaths();
    const activeIds = listSessionFiles(paths.baseDir);

    const sorted = activeIds.map(id => {
      const info = this.getSessionInfo(paths.baseDir, id);
      return { id, size: info?.size || 0 };
    }).sort((a, b) => b.size - a.size);

    for (const { id, size } of sorted) {
      if (result.bytesFreed >= result.bytesToFree) break;

      try {
        const success = await this.store.deleteSession(id, true);
        if (success) {
          result.sessionsDeleted++;
          result.bytesFreed += size;
        }
      } catch (err) {
        result.errors.push(`${id}: ${String(err)}`);
      }
    }
  }

  private getSessionInfo(dir: string, sessionId: string): { size: number; modifiedAt: Date } | null {
    const filePath = path.join(dir, `${sessionId}.jsonl`);
    try {
      const stats = fs.statSync(filePath);
      return { size: stats.size, modifiedAt: stats.mtime };
    } catch {
      return null;
    }
  }

  checkSessionBudget(sessionId: string, additionalBytes: number): boolean {
    const paths = this.store.getPaths();
    const filePath = path.join(paths.baseDir, `${sessionId}.jsonl`);

    try {
      let currentSize = 0;
      if (fs.existsSync(filePath)) {
        currentSize = fs.statSync(filePath).size;
      }
      return currentSize + additionalBytes <= this.config.maxSessionSizeBytes;
    } catch {
      return true;
    }
  }

  getConfig(): DiskBudgetConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<DiskBudgetConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[DiskBudget] 配置已更新');
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
}
