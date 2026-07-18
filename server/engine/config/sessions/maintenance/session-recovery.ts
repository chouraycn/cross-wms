import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import { SessionStore } from '../store.js';
import type { SessionMetadata } from '../types.js';
import { SessionMetadataSchema } from '../types.js';

export interface RecoveryOptions {
  dryRun?: boolean;
  restoreFromArchive?: boolean;
}

export interface RecoveryResult {
  recoveredCount: number;
  repairedCount: number;
  errors: string[];
  dryRun: boolean;
}

export class SessionRecovery {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  async recover(options: RecoveryOptions = {}): Promise<RecoveryResult> {
    const opts = {
      dryRun: false,
      restoreFromArchive: true,
      ...options,
    };

    const result: RecoveryResult = {
      recoveredCount: 0,
      repairedCount: 0,
      errors: [],
      dryRun: opts.dryRun,
    };

    logger.info('[SessionRecovery] 开始恢复...');

    try {
      this.repairCorruptedFiles(result, opts);

      if (opts.restoreFromArchive) {
        await this.restoreFromArchive(result, opts);
      }

      this.rebuildRegistry(result);
    } catch (err) {
      result.errors.push(`恢复异常: ${String(err)}`);
      logger.error('[SessionRecovery] 恢复异常:', err);
    }

    logger.info(
      `[SessionRecovery] 恢复完成: ${result.recoveredCount} 个恢复, ${result.repairedCount} 个修复`
    );

    return result;
  }

  private repairCorruptedFiles(result: RecoveryResult, opts: RecoveryOptions): void {
    const paths = this.store.getPaths();
    this.repairDirectory(paths.baseDir, false, result, opts);
    this.repairDirectory(paths.archivedDir, true, result, opts);
  }

  private repairDirectory(
    dir: string,
    isArchived: boolean,
    result: RecoveryResult,
    opts: RecoveryOptions
  ): void {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      const filePath = path.join(dir, file);

      try {
        const repaired = this.repairFile(filePath, sessionId);
        if (repaired) {
          result.repairedCount++;
          logger.info('[SessionRecovery] 修复:', sessionId);
        }
      } catch (err) {
        result.errors.push(`${sessionId}: ${String(err)}`);
        logger.error('[SessionRecovery] 修复失败:', sessionId, err);
      }
    }
  }

  private repairFile(filePath: string, sessionId: string): boolean {
    if (!fs.existsSync(filePath)) return false;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);

    if (lines.length === 0) {
      logger.warn('[SessionRecovery] 空文件，删除:', sessionId);
      fs.unlinkSync(filePath);
      return true;
    }

    let hasValidFirstLine = false;
    try {
      const firstLine = JSON.parse(lines[0]);
      hasValidFirstLine = !!(firstLine.session || firstLine.metadata);
    } catch {
      hasValidFirstLine = false;
    }

    if (!hasValidFirstLine) {
      logger.warn('[SessionRecovery] 首行无效，尝试重建:', sessionId);
      const now = new Date().toISOString();
      const reconstructedFirstLine = JSON.stringify({
        session: {
          id: sessionId,
          title: '恢复的会话',
          status: 'active',
          createdAt: now,
          updatedAt: now,
          lastActiveAt: now,
          sessionDate: now.split('T')[0],
          messageCount: Math.max(0, lines.length - 1),
          schemaVersion: '1.0.0',
          model: 'auto',
          tags: [],
          extra: {},
        },
        messages: [],
        goals: [],
        artifacts: [],
        targets: [],
        extra: {},
      });

      const newContent = [reconstructedFirstLine, ...lines.slice(1)].join('\n') + '\n';
      fs.writeFileSync(filePath, newContent, 'utf-8');
      return true;
    }

    return false;
  }

  private async restoreFromArchive(result: RecoveryResult, opts: RecoveryOptions): Promise<void> {
    const paths = this.store.getPaths();
    if (!fs.existsSync(paths.archivedDir)) return;

    const files = fs.readdirSync(paths.archivedDir).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      const activePath = path.join(paths.baseDir, file);

      if (!fs.existsSync(activePath)) {
        if (!opts.dryRun) {
          const success = await this.store.restoreSession(sessionId);
          if (success) {
            result.recoveredCount++;
            logger.info('[SessionRecovery] 从归档恢复:', sessionId);
          }
        } else {
          result.recoveredCount++;
        }
      }
    }
  }

  private rebuildRegistry(result: RecoveryResult): void {
    const paths = this.store.getPaths();
    try {
      fs.writeFileSync(paths.registryFile, JSON.stringify({ entries: [], version: '1.0.0' }, null, 2), 'utf-8');
      logger.info('[SessionRecovery] 注册表重建完成');
    } catch (err) {
      result.errors.push(`registry rebuild: ${String(err)}`);
      logger.error('[SessionRecovery] 注册表重建失败:', err);
    }
  }

  checkHealth(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];

    try {
      const maintenance = this.store.getMaintenance();
      const health = maintenance.quickCheck();
      if (!health.healthy) {
        issues.push(...health.issues);
      }
    } catch (err) {
      issues.push(`健康检查失败: ${String(err)}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }
}