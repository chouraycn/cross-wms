import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { listSessionFiles, listArchivedSessionFiles } from './session-file.js';
import { SessionStore } from './store.js';
import type { SessionStatus } from './types.js';

export interface CleanupConfig {
  maxAgeMs: number;
  maxArchivedAgeMs: number;
  maxDeletedAgeMs: number;
  cleanupIntervalMs: number;
  autoCleanup: boolean;
  dryRun: boolean;
}

export const defaultCleanupConfig: CleanupConfig = {
  maxAgeMs: 90 * 24 * 60 * 60 * 1000,
  maxArchivedAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxDeletedAgeMs: 7 * 24 * 60 * 60 * 1000,
  cleanupIntervalMs: 24 * 60 * 60 * 1000,
  autoCleanup: true,
  dryRun: false,
};

export interface CleanupResult {
  deletedActive: number;
  deletedArchived: number;
  deletedTemp: number;
  spaceReclaimedBytes: number;
  errors: string[];
  dryRun: boolean;
}

export class CleanupService {
  private store: SessionStore;
  private config: CleanupConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(store: SessionStore, config: Partial<CleanupConfig> = {}) {
    this.store = store;
    this.config = { ...defaultCleanupConfig, ...config };
  }

  start(): void {
    if (!this.config.autoCleanup) {
      logger.info('[CleanupService] 自动清理已禁用');
      return;
    }

    if (this.timer) return;

    this.timer = setInterval(() => {
      this.runCleanup().catch(err => {
        logger.error('[CleanupService] 自动清理失败:', err);
      });
    }, this.config.cleanupIntervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }

    logger.info('[CleanupService] 清理服务已启动');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('[CleanupService] 清理服务已停止');
  }

  async runCleanup(): Promise<CleanupResult> {
    if (this.isRunning) {
      logger.warn('[CleanupService] 清理正在进行中，跳过本次');
      return {
        deletedActive: 0,
        deletedArchived: 0,
        deletedTemp: 0,
        spaceReclaimedBytes: 0,
        errors: ['Cleanup already in progress'],
        dryRun: this.config.dryRun,
      };
    }

    this.isRunning = true;
    const result: CleanupResult = {
      deletedActive: 0,
      deletedArchived: 0,
      deletedTemp: 0,
      spaceReclaimedBytes: 0,
      errors: [],
      dryRun: this.config.dryRun,
    };

    logger.info('[CleanupService] 开始清理...');

    try {
      await this.cleanupOldActiveSessions(result);
      await this.cleanupOldArchivedSessions(result);
      this.cleanupTempFiles(result);
      this.cleanupOrphanedMetadata(result);
    } catch (err) {
      result.errors.push(`清理异常: ${String(err)}`);
      logger.error('[CleanupService] 清理异常:', err);
    } finally {
      this.isRunning = false;
    }

    logger.info(
      `[CleanupService] 清理完成: active=${result.deletedActive}, ` +
      `archived=${result.deletedArchived}, ` +
      `temp=${result.deletedTemp}, ` +
      `space=${(result.spaceReclaimedBytes / 1024 / 1024).toFixed(2)}MB`
    );

    return result;
  }

  private async cleanupOldActiveSessions(result: CleanupResult): Promise<void> {
    const paths = this.store.getPaths();
    const sessionIds = listSessionFiles(paths.baseDir);
    const now = Date.now();

    for (const sessionId of sessionIds) {
      try {
        const filePath = path.join(paths.baseDir, `${sessionId}.jsonl`);
        const stats = fs.statSync(filePath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > this.config.maxAgeMs) {
          const metadata = this.store.getMetadata(sessionId);
          if (metadata?.status === 'deleted') {
            if (ageMs > this.config.maxDeletedAgeMs) {
              if (!this.config.dryRun) {
                await this.store.deleteSession(sessionId, true);
              }
              result.deletedActive++;
              result.spaceReclaimedBytes += stats.size;
              logger.debug('[CleanupService] 删除已删除状态的旧会话:', sessionId);
            }
          } else if (metadata?.status === 'daily_reset') {
            if (ageMs > this.config.maxAgeMs) {
              if (!this.config.dryRun) {
                await this.store.archiveSession(sessionId);
              }
              result.deletedActive++;
              logger.debug('[CleanupService] 归档旧的 daily_reset 会话:', sessionId);
            }
          }
        }
      } catch (err) {
        result.errors.push(`${sessionId}: ${String(err)}`);
      }
    }
  }

  private async cleanupOldArchivedSessions(result: CleanupResult): Promise<void> {
    const paths = this.store.getPaths();
    const sessionIds = listArchivedSessionFiles(paths.archivedDir);
    const now = Date.now();

    for (const sessionId of sessionIds) {
      try {
        const filePath = path.join(paths.archivedDir, `${sessionId}.jsonl`);
        const stats = fs.statSync(filePath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > this.config.maxArchivedAgeMs) {
          if (!this.config.dryRun) {
            await this.store.deleteSession(sessionId, true);
          }
          result.deletedArchived++;
          result.spaceReclaimedBytes += stats.size;
          logger.debug('[CleanupService] 删除旧归档会话:', sessionId);
        }
      } catch (err) {
        result.errors.push(`archived/${sessionId}: ${String(err)}`);
      }
    }
  }

  private cleanupTempFiles(result: CleanupResult): void {
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
            if (!this.config.dryRun) {
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
      const activeIds = new Set(listSessionFiles(paths.baseDir));
      const metaFiles = fs.readdirSync(metaDir).filter(f => f.endsWith('.json'));

      for (const metaFile of metaFiles) {
        const sessionId = metaFile.replace('.json', '');
        if (!activeIds.has(sessionId)) {
          const metaPath = path.join(metaDir, metaFile);
          try {
            const size = fs.statSync(metaPath).size;
            if (!this.config.dryRun) {
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

  getStatus(): { isRunning: boolean; config: CleanupConfig } {
    return {
      isRunning: this.isRunning,
      config: { ...this.config },
    };
  }

  updateConfig(config: Partial<CleanupConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[CleanupService] 配置已更新');
  }

  /**
   * 立即执行一次清理，等同于 runCleanup 的语义别名。
   * 提供 runOnce 接口以便与 openclaw 的清理服务保持调用方式一致。
   */
  async runOnce(): Promise<CleanupResult> {
    return this.runCleanup();
  }

  /**
   * 以指定间隔（毫秒）调度周期性清理。
   * 若已有定时器在运行则会先停止再重建，保证仅保留一个调度。
   */
  schedule(intervalMs: number): void {
    this.stop();
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      logger.warn('[CleanupService] 无效的调度间隔，忽略:', intervalMs);
      return;
    }
    this.config.cleanupIntervalMs = intervalMs;
    this.start();
  }
}

/**
 * 创建清理服务时所需的选项。
 */
export interface CleanupOptions {
  /** 关联的会话存储实例 */
  store: SessionStore;
  /** 可选的清理配置覆盖项 */
  config?: Partial<CleanupConfig>;
}

/**
 * 工厂函数：基于选项创建一个 CleanupService 实例。
 */
export function createCleanupService(options: CleanupOptions): CleanupService {
  return new CleanupService(options.store, options.config);
}
