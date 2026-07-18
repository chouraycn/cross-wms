import { logger } from '../../logger.js';
import { resolveConfigDir } from './paths.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getBackupMetadata, getBackupPath, validateBackup } from './config-backup.js';

export function restoreFromBackup(backupId: string, options: {
  overwrite?: boolean;
  restoreConfig?: boolean;
  restoreSessions?: boolean;
  restorePlugins?: boolean;
} = {}): { success: boolean; message?: string } {
  const {
    overwrite = true,
    restoreConfig = true,
    restoreSessions = true,
    restorePlugins = true,
  } = options;

  const validation = validateBackup(backupId);
  if (!validation.valid) {
    return { success: false, message: `备份验证失败: ${validation.issues.join(', ')}` };
  }

  const metadata = getBackupMetadata(backupId);
  if (!metadata) {
    return { success: false, message: '无法读取备份元数据' };
  }

  const backupPath = getBackupPath(backupId);
  const configDir = resolveConfigDir();

  logger.info(`[ConfigRestore] 开始从备份恢复: ${backupId}`);

  try {
    if (overwrite) {
      createPreRestoreBackup();
    }

    const fs = require('node:fs');

    if (restoreConfig && metadata.includedFiles.includes('config.json')) {
      const src = join(backupPath, 'config.json');
      const dest = join(configDir, 'config.json');
      if (existsSync(src)) {
        writeFileSync(dest, readFileSync(src));
        logger.info('[ConfigRestore] 恢复配置文件');
      }
    }

    if (restoreSessions && metadata.includedFiles.includes('sessions/')) {
      const src = join(backupPath, 'sessions');
      const dest = join(configDir, 'sessions');
      if (existsSync(src)) {
        if (existsSync(dest)) {
          renameSync(dest, `${dest}.pre-restore`);
        }
        copyDirectory(src, dest);
        logger.info('[ConfigRestore] 恢复会话数据');
      }
    }

    if (restorePlugins && metadata.includedFiles.includes('plugins/')) {
      const src = join(backupPath, 'plugins');
      const dest = join(configDir, 'plugins');
      if (existsSync(src)) {
        if (existsSync(dest)) {
          renameSync(dest, `${dest}.pre-restore`);
        }
        copyDirectory(src, dest);
        logger.info('[ConfigRestore] 恢复插件数据');
      }
    }

    const versionFiles = ['.config-version.json', '.config-versions.json'];
    for (const file of versionFiles) {
      if (metadata.includedFiles.includes(file)) {
        const src = join(backupPath, file);
        const dest = join(configDir, file);
        if (existsSync(src)) {
          writeFileSync(dest, readFileSync(src));
          logger.info(`[ConfigRestore] 恢复版本文件: ${file}`);
        }
      }
    }

    logger.info(`[ConfigRestore] 从备份恢复完成: ${backupId}`);
    return { success: true, message: `从备份 ${backupId} 恢复成功` };
  } catch (err) {
    logger.error(`[ConfigRestore] 恢复失败: ${err}`);
    return { success: false, message: `恢复失败: ${err}` };
  }
}

function createPreRestoreBackup(): void {
  const backupId = `pre-restore_${Date.now()}`;
  const configDir = resolveConfigDir();
  const backupPath = join(configDir, 'backups', backupId);

  try {
    mkdirSync(backupPath, { recursive: true });
    const fs = require('node:fs');

    const filesToCopy = ['config.json', '.config-version.json', '.config-versions.json'];
    const dirsToCopy = ['sessions', 'plugins', 'data'];

    for (const file of filesToCopy) {
      const src = join(configDir, file);
      const dest = join(backupPath, file);
      if (existsSync(src)) {
        writeFileSync(dest, readFileSync(src));
      }
    }

    for (const dir of dirsToCopy) {
      const src = join(configDir, dir);
      const dest = join(backupPath, dir);
      if (existsSync(src)) {
        copyDirectory(src, dest);
      }
    }

    logger.info(`[ConfigRestore] 创建预恢复备份: ${backupId}`);
  } catch (err) {
    logger.warn(`[ConfigRestore] 创建预恢复备份失败: ${err}`);
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

export function restoreConfigFile(backupId: string): { success: boolean; message?: string } {
  const metadata = getBackupMetadata(backupId);
  if (!metadata) {
    return { success: false, message: '无法读取备份元数据' };
  }

  if (!metadata.includedFiles.includes('config.json')) {
    return { success: false, message: '备份中不包含配置文件' };
  }

  const backupPath = getBackupPath(backupId);
  const configDir = resolveConfigDir();
  const src = join(backupPath, 'config.json');
  const dest = join(configDir, 'config.json');

  if (!existsSync(src)) {
    return { success: false, message: '配置文件不存在于备份中' };
  }

  try {
    if (existsSync(dest)) {
      writeFileSync(`${dest}.bak`, readFileSync(dest));
    }
    writeFileSync(dest, readFileSync(src));
    logger.info(`[ConfigRestore] 仅恢复配置文件: ${backupId}`);
    return { success: true, message: '配置文件恢复成功' };
  } catch (err) {
    logger.error(`[ConfigRestore] 恢复配置文件失败: ${err}`);
    return { success: false, message: `恢复配置文件失败: ${err}` };
  }
}

export function restoreSessions(backupId: string): { success: boolean; message?: string } {
  const metadata = getBackupMetadata(backupId);
  if (!metadata) {
    return { success: false, message: '无法读取备份元数据' };
  }

  if (!metadata.includedFiles.includes('sessions/')) {
    return { success: false, message: '备份中不包含会话数据' };
  }

  const backupPath = getBackupPath(backupId);
  const configDir = resolveConfigDir();
  const src = join(backupPath, 'sessions');
  const dest = join(configDir, 'sessions');

  if (!existsSync(src)) {
    return { success: false, message: '会话数据不存在于备份中' };
  }

  try {
    if (existsSync(dest)) {
      renameSync(dest, `${dest}.bak`);
    }
    copyDirectory(src, dest);
    logger.info(`[ConfigRestore] 仅恢复会话数据: ${backupId}`);
    return { success: true, message: '会话数据恢复成功' };
  } catch (err) {
    logger.error(`[ConfigRestore] 恢复会话数据失败: ${err}`);
    return { success: false, message: `恢复会话数据失败: ${err}` };
  }
}

export function cleanupPreRestoreBackups(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const backupsDir = join(resolveConfigDir(), 'backups');
  if (!existsSync(backupsDir)) return 0;

  let cleanedCount = 0;
  const fs = require('node:fs');

  try {
    const entries = fs.readdirSync(backupsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('pre-restore_')) {
        const timestampStr = entry.name.split('_')[1];
        const timestamp = parseInt(timestampStr, 10);

        if (Date.now() - timestamp > maxAgeMs) {
          const path = join(backupsDir, entry.name);
          try {
            rmSync(path, { recursive: true, force: true });
            cleanedCount++;
            logger.info(`[ConfigRestore] 清理预恢复备份: ${entry.name}`);
          } catch (err) {
            logger.warn(`[ConfigRestore] 清理预恢复备份失败: ${err}`);
          }
        }
      }
    }
  } catch (err) {
    logger.error(`[ConfigRestore] 清理预恢复备份失败: ${err}`);
  }

  return cleanedCount;
}

export function restoreFromExternalPath(externalPath: string, options: {
  overwrite?: boolean;
  restoreConfig?: boolean;
  restoreSessions?: boolean;
} = {}): { success: boolean; message?: string } {
  const {
    overwrite = true,
    restoreConfig = true,
    restoreSessions = true,
  } = options;

  if (!existsSync(externalPath)) {
    return { success: false, message: '外部路径不存在' };
  }

  const configDir = resolveConfigDir();

  try {
    if (overwrite) {
      createPreRestoreBackup();
    }

    const fs = require('node:fs');

    if (restoreConfig) {
      const src = join(externalPath, 'config.json');
      const dest = join(configDir, 'config.json');
      if (existsSync(src)) {
        writeFileSync(dest, readFileSync(src));
        logger.info('[ConfigRestore] 从外部路径恢复配置文件');
      }
    }

    if (restoreSessions) {
      const src = join(externalPath, 'sessions');
      const dest = join(configDir, 'sessions');
      if (existsSync(src)) {
        if (existsSync(dest)) {
          renameSync(dest, `${dest}.pre-restore`);
        }
        copyDirectory(src, dest);
        logger.info('[ConfigRestore] 从外部路径恢复会话数据');
      }
    }

    logger.info(`[ConfigRestore] 从外部路径恢复完成: ${externalPath}`);
    return { success: true, message: `从外部路径 ${externalPath} 恢复成功` };
  } catch (err) {
    logger.error(`[ConfigRestore] 从外部路径恢复失败: ${err}`);
    return { success: false, message: `从外部路径恢复失败: ${err}` };
  }
}