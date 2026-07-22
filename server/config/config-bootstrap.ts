/**
 * 启动时配置迁移与校验
 *
 * 把 configMigrationManager + configValidator + 配置持久化整合为统一入口：
 *   1. 加载磁盘配置
 *   2. 自动迁移到当前 schema 版本
 *   3. 校验迁移后配置
 *   4. 若有 error 拒绝启动
 *   5. 通过后写回磁盘（带 configVersion 字段）
 *   6. 失败时记录快照供回滚
 *
 * 设计目标：让 config-migration / config-validator 不再是孤岛。
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import {
  configMigrationManager,
  CURRENT_CONFIG_VERSION,
  type AppConfig,
  type MigrationResult,
} from './config-migration.js';
import { configValidator, type ConfigValidationResult } from './config-validator.js';

/** Bootstrap 结果 */
export interface ConfigBootstrapResult {
  /** 是否成功 */
  success: boolean;
  /** 最终配置（迁移后） */
  config: AppConfig;
  /** 迁移结果（如执行了迁移） */
  migration?: MigrationResult;
  /** 校验结果 */
  validation: ConfigValidationResult;
  /** 配置文件路径 */
  configPath: string;
  /** 是否写回了磁盘 */
  persisted: boolean;
  /** 错误信息（如有） */
  error?: string;
}

/** Bootstrap 选项 */
export interface ConfigBootstrapOptions {
  /** 配置文件路径 */
  configPath: string;
  /** 是否在启动时拒绝 error 级别校验问题（默认 true） */
  failOnError?: boolean;
  /** 是否在迁移后写回磁盘（默认 true） */
  persistAfterMigrate?: boolean;
  /** 迁移失败时是否回滚到上一版本（默认 true） */
  rollbackOnFailure?: boolean;
  /** 备份目录（默认与配置同目录） */
  backupDir?: string;
  /** 是否创建备份文件（默认 true） */
  createBackup?: boolean;
}

/** 加载 JSON 配置文件（不存在时返回空对象） */
export function loadConfigFile(configPath: string): AppConfig {
  try {
    if (!fs.existsSync(configPath)) {
      return {};
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as AppConfig;
  } catch (err) {
    logger.warn(`[ConfigBootstrap] Failed to load ${configPath}:`, err);
    return {};
  }
}

/** 写入配置文件（带原子写入） */
export function writeConfigFile(configPath: string, config: AppConfig): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${configPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmpPath, configPath);
}

/** 创建配置备份 */
export function backupConfig(
  configPath: string,
  backupDir: string = path.dirname(configPath),
): string | undefined {
  if (!fs.existsSync(configPath)) return undefined;
  const basename = path.basename(configPath, '.json');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${basename}.backup-${timestamp}.json`);
  fs.copyFileSync(configPath, backupPath);
  logger.info(`[ConfigBootstrap] Created backup: ${backupPath}`);
  return backupPath;
}

/**
 * 执行启动时配置引导
 *
 * 流程：
 * 1. 加载磁盘配置
 * 2. 自动迁移到 CURRENT_CONFIG_VERSION
 * 3. 校验迁移后配置
 * 4. 如有 error 且 failOnError=true，拒绝启动
 * 5. 通过后写回磁盘
 */
export async function bootstrapConfig(options: ConfigBootstrapOptions): Promise<ConfigBootstrapResult> {
  const { configPath } = options;
  const failOnError = options.failOnError ?? true;
  const persistAfterMigrate = options.persistAfterMigrate ?? true;
  const rollbackOnFailure = options.rollbackOnFailure ?? true;
  const createBackup = options.createBackup ?? true;

  logger.info(`[ConfigBootstrap] Bootstrapping config from ${configPath}`);

  // 1. 加载
  let config = loadConfigFile(configPath);
  const originalConfig = { ...config };
  const originalVersion = (config.configVersion as number) ?? 1;

  // 2. 备份
  let backupPath: string | undefined;
  if (createBackup && fs.existsSync(configPath)) {
    backupPath = backupConfig(configPath, options.backupDir);
  }

  // 3. 迁移
  let migrationResult: MigrationResult | undefined;
  try {
    migrationResult = await configMigrationManager.migrate(config, CURRENT_CONFIG_VERSION);
    if (!migrationResult.success) {
      const msg = `Config migration failed: ${migrationResult.error ?? 'unknown error'}`;
      logger.error(`[ConfigBootstrap] ${msg}`);

      if (rollbackOnFailure && migrationResult.migratedConfig) {
        logger.warn(`[ConfigBootstrap] Rolling back to original config`);
        config = originalConfig;
      } else {
        config = migrationResult.migratedConfig;
      }

      return {
        success: false,
        config,
        migration: migrationResult,
        validation: configValidator.validate(config),
        configPath,
        persisted: false,
        error: msg,
      };
    }

    config = migrationResult.migratedConfig;
    if (migrationResult.appliedMigrations.length > 0) {
      logger.info(
        `[ConfigBootstrap] Migrated v${originalVersion} -> v${CURRENT_CONFIG_VERSION} (applied: ${migrationResult.appliedMigrations.join(', ')})`,
      );
    } else {
      logger.debug(`[ConfigBootstrap] No migration needed (v${originalVersion})`);
    }
  } catch (err) {
    const msg = `Config migration threw: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(`[ConfigBootstrap] ${msg}`);
    return {
      success: false,
      config: originalConfig,
      validation: configValidator.validate(originalConfig),
      configPath,
      persisted: false,
      error: msg,
    };
  }

  // 4. 校验
  const validation = configValidator.validate(config);
  if (!validation.isValid && failOnError) {
    const errors = validation.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.path}: ${i.message}`)
      .join('; ');
    const msg = `Config validation failed: ${errors}`;
    logger.error(`[ConfigBootstrap] ${msg}`);
    return {
      success: false,
      config,
      migration: migrationResult,
      validation,
      configPath,
      persisted: false,
      error: msg,
    };
  }

  if (validation.warningCount > 0) {
    logger.warn(`[ConfigBootstrap] Config validation produced ${validation.warningCount} warnings`);
  }

  // 5. 持久化
  let persisted = false;
  if (persistAfterMigrate && migrationResult?.appliedMigrations?.length > 0) {
    try {
      writeConfigFile(configPath, config);
      persisted = true;
      logger.info(`[ConfigBootstrap] Persisted migrated config to ${configPath}`);
    } catch (err) {
      const msg = `Failed to persist config: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(`[ConfigBootstrap] ${msg}`);
      return {
        success: false,
        config,
        migration: migrationResult,
        validation,
        configPath,
        persisted: false,
        error: msg,
      };
    }
  }

  logger.info(
    `[ConfigBootstrap] Config ready (v${config.configVersion ?? CURRENT_CONFIG_VERSION}, ${validation.errorCount} errors, ${validation.warningCount} warnings)`,
  );

  return {
    success: true,
    config,
    migration: migrationResult,
    validation,
    configPath,
    persisted,
  };
}

/** 清空旧备份文件（保留最近 N 个） */
export function pruneBackups(configPath: string, keep: number = 5): number {
  const dir = path.dirname(configPath);
  const basename = path.basename(configPath, '.json');
  if (!fs.existsSync(dir)) return 0;

  const files = fs.readdirSync(dir);
  const backups = files
    .filter((f) => f.startsWith(`${basename}.backup-`) && f.endsWith('.json'))
    .map((f) => ({
      name: f,
      path: path.join(dir, f),
      mtime: fs.statSync(path.join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  let pruned = 0;
  for (const backup of backups.slice(keep)) {
    try {
      fs.unlinkSync(backup.path);
      pruned++;
    } catch {
      // 忽略
    }
  }
  return pruned;
}
