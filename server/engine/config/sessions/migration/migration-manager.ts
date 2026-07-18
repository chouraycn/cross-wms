import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import { listSessionFiles, readSessionFirstLine } from '../session-file.js';
import type { Migration, MigrationResult, MigrationStatus, MigrationOptions } from './migration-types.js';
import { MIGRATIONS } from './migration-steps.js';
import { CURRENT_SCHEMA_VERSION, versionCompare } from './migration-versions.js';

export class MigrationManager {
  private baseDir: string;
  private archivedDir: string;

  constructor(baseDir: string, archivedDir: string) {
    this.baseDir = baseDir;
    this.archivedDir = archivedDir;
  }

  async runMigrations(options: MigrationOptions = {}): Promise<MigrationResult> {
    const opts = {
      targetVersion: CURRENT_SCHEMA_VERSION,
      dryRun: false,
      force: false,
      ...options,
    };

    logger.info('[MigrationManager] 开始检查数据迁移...');

    const overallResult: MigrationResult = {
      success: true,
      migrated: 0,
      failed: 0,
      errors: [],
      fromVersion: '',
      toVersion: opts.targetVersion,
      appliedMigrations: [],
    };

    try {
      const currentVersion = this.detectSchemaVersion();
      overallResult.fromVersion = currentVersion;

      if (currentVersion === opts.targetVersion) {
        logger.info('[MigrationManager] Schema 已是最新版本:', opts.targetVersion);
        return overallResult;
      }

      if (versionCompare(currentVersion, opts.targetVersion) > 0) {
        logger.warn('[MigrationManager] 当前版本高于目标版本，无法迁移');
        overallResult.success = false;
        overallResult.errors.push(`Current version ${currentVersion} > target ${opts.targetVersion}`);
        return overallResult;
      }

      const pendingMigrations = this.getPendingMigrations(currentVersion, opts.targetVersion);

      if (pendingMigrations.length === 0) {
        logger.info('[MigrationManager] 没有待执行的迁移');
        return overallResult;
      }

      logger.info(`[MigrationManager] 发现 ${pendingMigrations.length} 个待执行迁移`);

      for (const migration of pendingMigrations) {
        logger.info(`[MigrationManager] 执行迁移: ${migration.id}`);

        if (!opts.dryRun) {
          const result = await migration.up(this.baseDir, this.archivedDir);

          overallResult.migrated += result.migrated;
          overallResult.failed += result.failed;
          overallResult.errors.push(...result.errors);

          if (!result.success) {
            overallResult.success = false;
            logger.error(`[MigrationManager] 迁移失败: ${migration.id}`);
            break;
          }

          overallResult.appliedMigrations.push(migration.id);
        } else {
          logger.info(`[MigrationManager] 模拟迁移: ${migration.id}`);
          overallResult.appliedMigrations.push(migration.id);
        }
      }

      if (overallResult.success && !opts.dryRun) {
        this.updateSchemaVersion(opts.targetVersion);
      }

      logger.info(
        `[MigrationManager] 迁移完成: ${overallResult.migrated} 个成功, ` +
        `${overallResult.failed} 个失败`
      );
    } catch (err) {
      overallResult.success = false;
      overallResult.errors.push(`迁移异常: ${String(err)}`);
      logger.error('[MigrationManager] 迁移异常:', err);
    }

    return overallResult;
  }

  getStatus(): MigrationStatus {
    const currentVersion = this.detectSchemaVersion();
    const targetVersion = CURRENT_SCHEMA_VERSION;
    const needsMigration = versionCompare(currentVersion, targetVersion) < 0;

    const pending = this.getPendingMigrations(currentVersion, targetVersion);
    const completed = this.getCompletedMigrations(currentVersion);

    return {
      currentVersion,
      targetVersion,
      needsMigration,
      pendingMigrations: pending,
      completedMigrations: completed,
    };
  }

  needsMigration(targetVersion: string = CURRENT_SCHEMA_VERSION): boolean {
    const currentVersion = this.detectSchemaVersion();
    return versionCompare(currentVersion, targetVersion) < 0;
  }

  getCurrentSchemaVersion(): string {
    return this.detectSchemaVersion();
  }

  getAvailableMigrations(): Migration[] {
    return [...MIGRATIONS];
  }

  private detectSchemaVersion(): string {
    const versionFile = path.join(this.baseDir, '.schema-version');

    try {
      if (fs.existsSync(versionFile)) {
        const version = fs.readFileSync(versionFile, 'utf-8').trim();
        if (version) return version;
      }
    } catch {
      // ignore
    }

    const sessionIds = listSessionFiles(this.baseDir);
    if (sessionIds.length === 0) {
      return CURRENT_SCHEMA_VERSION;
    }

    for (const sessionId of sessionIds.slice(0, 5)) {
      const firstLine = readSessionFirstLine(this.baseDir, sessionId);
      if (firstLine) {
        try {
          const data = JSON.parse(firstLine);
          const metadata = data.session || data.metadata;
          if (metadata?.schemaVersion) {
            return metadata.schemaVersion;
          }
        } catch {
          // ignore
        }
      }
    }

    return '0.9';
  }

  private updateSchemaVersion(version: string): void {
    try {
      const versionFile = path.join(this.baseDir, '.schema-version');
      const dir = path.dirname(versionFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(versionFile, version, 'utf-8');
    } catch (err) {
      logger.warn('[MigrationManager] 更新版本文件失败:', err);
    }
  }

  private getPendingMigrations(fromVersion: string, toVersion: string): Migration[] {
    return MIGRATIONS.filter(m => {
      return versionCompare(m.fromVersion, fromVersion) >= 0
        && versionCompare(m.toVersion, toVersion) <= 0;
    }).sort((a, b) => versionCompare(a.fromVersion, b.fromVersion));
  }

  private getCompletedMigrations(currentVersion: string): Migration[] {
    return MIGRATIONS.filter(m => {
      return versionCompare(m.toVersion, currentVersion) <= 0;
    }).sort((a, b) => versionCompare(a.toVersion, b.toVersion));
  }
}