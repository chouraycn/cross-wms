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

// 重新导出 DiskBudgetConfig 类型，便于外部直接从本模块引入
export type { DiskBudgetConfig } from './types.js';

// ===== 基于路径的精简磁盘配额管理 =====

/**
 * 递归统计指定路径下的磁盘占用字节数。
 * 仅统计普通文件，跳过目录本身。
 */
export function getDiskUsage(targetPath: string): number {
  if (!targetPath || !fs.existsSync(targetPath)) return 0;

  try {
    const stat = fs.statSync(targetPath);
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;
  } catch {
    return 0;
  }

  let totalBytes = 0;
  const stack: string[] = [targetPath];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      try {
        if (entry.isFile()) {
          totalBytes += fs.statSync(entryPath).size;
        } else if (entry.isDirectory()) {
          stack.push(entryPath);
        }
      } catch {
        // 单文件统计失败时跳过，不影响整体结果
      }
    }
  }
  return totalBytes;
}

/**
 * 检查指定路径是否在磁盘配额范围内。
 * 返回 { ok, usedBytes, maxBytes, usedPercent } 形式的状态对象。
 */
export function checkDiskBudget(
  targetPath: string,
  config: DiskBudgetConfig,
): { ok: boolean; usedBytes: number; maxBytes: number; usedPercent: number } {
  const usedBytes = getDiskUsage(targetPath);
  const maxBytes = config.maxTotalBytes;
  const usedPercent = maxBytes > 0 ? Math.min(100, (usedBytes / maxBytes) * 100) : 0;
  const ok = usedPercent < config.warningThresholdPercent;

  if (!ok && usedPercent >= 95) {
    logger.error('[DiskBudget] 路径磁盘配额严重不足:', targetPath, `${Math.round(usedPercent)}%`);
  } else if (!ok) {
    logger.warn('[DiskBudget] 路径磁盘配额警告:', targetPath, `${Math.round(usedPercent)}%`);
  }

  return { ok, usedBytes, maxBytes, usedPercent };
}

/**
 * 按配置强制执行磁盘配额：当超出 maxTotalBytes 时，
 * 依据 cleanupStrategy 删除文件直到降到 warningThresholdPercent 对应的水位以下。
 * 返回释放的字节数与删除的文件数。
 */
export function enforceDiskBudget(
  targetPath: string,
  config: DiskBudgetConfig,
): { freedBytes: number; removedFiles: number } {
  const usage = getDiskUsage(targetPath);
  const highWaterBytes = Math.floor(
    config.maxTotalBytes * (config.warningThresholdPercent / 100),
  );

  if (usage <= highWaterBytes) {
    return { freedBytes: 0, removedFiles: 0 };
  }

  // 收集目标路径下的所有文件及其 mtime
  const files: Array<{ path: string; size: number; mtimeMs: number }> = [];
  const stack: string[] = [targetPath];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      try {
        if (entry.isFile()) {
          const stat = fs.statSync(entryPath);
          files.push({ path: entryPath, size: stat.size, mtimeMs: stat.mtimeMs });
        } else if (entry.isDirectory()) {
          stack.push(entryPath);
        }
      } catch {
        // 跳过无法访问的条目
      }
    }
  }

  // 按策略排序
  switch (config.cleanupStrategy) {
    case 'oldest_first':
      files.sort((a, b) => a.mtimeMs - b.mtimeMs);
      break;
    case 'largest_first':
      files.sort((a, b) => b.size - a.size);
      break;
    case 'archived_first':
      // 归档优先：带 archived 标记的文件排前面，其余按最旧优先
      files.sort((a, b) => {
        const aArchived = a.path.includes('archived') ? 0 : 1;
        const bArchived = b.path.includes('archived') ? 0 : 1;
        if (aArchived !== bArchived) return aArchived - bArchived;
        return a.mtimeMs - b.mtimeMs;
      });
      break;
  }

  let freedBytes = 0;
  let removedFiles = 0;
  let currentUsage = usage;

  for (const file of files) {
    if (currentUsage <= highWaterBytes) break;
    try {
      fs.unlinkSync(file.path);
      freedBytes += file.size;
      removedFiles += 1;
      currentUsage -= file.size;
    } catch (err) {
      logger.warn('[DiskBudget] 删除文件失败:', file.path, err);
    }
  }

  if (removedFiles > 0) {
    logger.info(
      '[DiskBudget] 配额清理完成:',
      targetPath,
      `释放 ${(freedBytes / 1024 / 1024).toFixed(2)}MB,`,
      `删除 ${removedFiles} 个文件`,
    );
  }

  return { freedBytes, removedFiles };
}
