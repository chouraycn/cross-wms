import { logger } from '../../logger.js';
import { resolveConfigDir, resolvePaths } from './paths.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const BackupMetadataSchema = z.object({
  backupId: z.string(),
  timestamp: z.string(),
  version: z.string(),
  includedFiles: z.array(z.string()),
  sizeBytes: z.number().int().nonnegative(),
  hash: z.string(),
});

export type BackupMetadata = z.infer<typeof BackupMetadataSchema>;

const BACKUP_DIR = 'backups';
const BACKUP_METADATA_FILE = 'metadata.json';

function createHash(content: string): string {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function getBackupDir(): string {
  return join(resolveConfigDir(), BACKUP_DIR);
}

export function getBackupPath(backupId: string): string {
  return join(getBackupDir(), backupId);
}

export function getBackupMetadata(backupId: string): BackupMetadata | null {
  const path = join(getBackupPath(backupId), BACKUP_METADATA_FILE);
  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    return BackupMetadataSchema.parse(parsed);
  } catch (err) {
    logger.error(`[ConfigBackup] 读取备份元数据失败: ${err}`);
    return null;
  }
}

export function listBackups(): BackupMetadata[] {
  const backupDir = getBackupDir();
  if (!existsSync(backupDir)) return [];

  const backups: BackupMetadata[] = [];

  try {
    const fs = require('node:fs');
    const entries = fs.readdirSync(backupDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadata = getBackupMetadata(entry.name);
        if (metadata) {
          backups.push(metadata);
        }
      }
    }

    backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    logger.error(`[ConfigBackup] 列出备份失败: ${err}`);
  }

  return backups;
}

export function createBackup(options: {
  includeSessions?: boolean;
  includeLogs?: boolean;
  includeCache?: boolean;
  maxBackups?: number;
} = {}): { success: boolean; backupId?: string; message?: string } {
  const {
    includeSessions = true,
    includeLogs = false,
    includeCache = false,
    maxBackups = 5,
  } = options;

  const backupId = `backup_${Date.now()}`;
  const backupPath = getBackupPath(backupId);
  const configDir = resolveConfigDir();

  try {
    mkdirSync(backupPath, { recursive: true });

    const includedFiles: string[] = [];
    let totalSize = 0;
    const fs = require('node:fs');

    const filesToCopy = [
      { src: 'config.json', dest: 'config.json', always: true },
      { src: '.config-version.json', dest: '.config-version.json', always: true },
      { src: '.config-versions.json', dest: '.config-versions.json', always: true },
      { src: 'sessions', dest: 'sessions', condition: includeSessions },
      { src: 'logs', dest: 'logs', condition: includeLogs },
      { src: 'cache', dest: 'cache', condition: includeCache },
      { src: 'plugins', dest: 'plugins', condition: true },
      { src: 'data', dest: 'data', condition: true },
    ];

    for (const file of filesToCopy) {
      if (!file.condition && !file.always) continue;

      const srcPath = join(configDir, file.src);
      const destPath = join(backupPath, file.dest);

      if (!existsSync(srcPath)) continue;

      if (fs.statSync(srcPath).isDirectory()) {
        copyDirectory(srcPath, destPath);
        includedFiles.push(file.src + '/');
      } else {
        const content = readFileSync(srcPath);
        writeFileSync(destPath, content);
        totalSize += content.length;
        includedFiles.push(file.src);
      }
    }

    const version = require('../../package.json').version;
    const hash = createHash(JSON.stringify({ includedFiles, timestamp: new Date().toISOString() }));

    const metadata: BackupMetadata = {
      backupId,
      timestamp: new Date().toISOString(),
      version,
      includedFiles,
      sizeBytes: totalSize,
      hash,
    };

    writeFileSync(join(backupPath, BACKUP_METADATA_FILE), JSON.stringify(metadata, null, 2), 'utf-8');

    cleanupOldBackups(maxBackups);

    logger.info(`[ConfigBackup] 备份创建成功: ${backupId}`);
    return { success: true, backupId };
  } catch (err) {
    logger.error(`[ConfigBackup] 备份创建失败: ${err}`);
    return { success: false, message: `备份创建失败: ${err}` };
  }
}

function copyDirectory(src: string, dest: string): void {
  const fs = require('node:fs');

  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      const content = readFileSync(srcPath);
      writeFileSync(destPath, content);
    }
  }
}

function cleanupOldBackups(maxBackups: number): void {
  const backups = listBackups();

  if (backups.length <= maxBackups) return;

  const toRemove = backups.slice(maxBackups);

  for (const backup of toRemove) {
    deleteBackup(backup.backupId);
  }
}

export function deleteBackup(backupId: string): boolean {
  const backupPath = getBackupPath(backupId);
  if (!existsSync(backupPath)) return false;

  try {
    const fs = require('node:fs');
    renameSync(backupPath, `${backupPath}.deleted`);
    logger.info(`[ConfigBackup] 备份删除成功: ${backupId}`);
    return true;
  } catch (err) {
    logger.error(`[ConfigBackup] 备份删除失败: ${err}`);
    return false;
  }
}

export function getBackupStats(): {
  totalBackups: number;
  totalSizeBytes: number;
  oldestBackup: string | null;
  newestBackup: string | null;
} {
  const backups = listBackups();
  return {
    totalBackups: backups.length,
    totalSizeBytes: backups.reduce((sum, b) => sum + b.sizeBytes, 0),
    oldestBackup: backups.length > 0 ? backups[backups.length - 1].backupId : null,
    newestBackup: backups.length > 0 ? backups[0].backupId : null,
  };
}

export function validateBackup(backupId: string): { valid: boolean; issues: string[] } {
  const metadata = getBackupMetadata(backupId);
  if (!metadata) {
    return { valid: false, issues: ['元数据文件不存在'] };
  }

  const issues: string[] = [];
  const backupPath = getBackupPath(backupId);

  for (const file of metadata.includedFiles) {
    const filePath = join(backupPath, file);
    if (!existsSync(filePath)) {
      issues.push(`文件缺失: ${file}`);
    }
  }

  const configPath = join(backupPath, 'config.json');
  if (!existsSync(configPath)) {
    issues.push('配置文件缺失');
  }

  return { valid: issues.length === 0, issues };
}