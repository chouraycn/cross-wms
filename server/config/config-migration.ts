/**
 * 配置迁移与版本管理
 *
 * 借鉴 OpenClaw 的 config-migration 模式：
 * - 维护配置 schema 版本（CURRENT_CONFIG_VERSION）
 * - 注册从 v(n) 到 v(n+1) 的迁移函数
 * - 检测旧版本配置并自动应用迁移
 * - 支持迁移回滚（可选）
 * - 记录迁移历史
 */

/** 当前配置 schema 版本 */
export const CURRENT_CONFIG_VERSION = 3;

/** 配置根类型 */
export type AppConfig = Record<string, unknown> & {
  configVersion?: number;
};

/** 迁移上下文 */
export interface MigrationContext {
  /** 当前配置版本（迁移前） */
  fromVersion: number;
  /** 目标配置版本（迁移后） */
  toVersion: number;
  /** 迁移时间戳 */
  timestamp: number;
  /** 是否为 dry-run */
  dryRun: boolean;
}

/** 迁移结果 */
export interface MigrationResult {
  /** 是否成功 */
  success: boolean;
  /** 迁移前版本 */
  fromVersion: number;
  /** 迁移后版本 */
  toVersion: number;
  /** 应用的迁移步骤 */
  appliedMigrations: string[];
  /** 跳过的迁移步骤（如 dryRun） */
  skippedMigrations: string[];
  /** 迁移耗时（ms） */
  durationMs: number;
  /** 错误信息（如有） */
  error?: string;
  /** 迁移后的配置 */
  migratedConfig: AppConfig;
  /** 迁移过程日志 */
  logs: MigrationLogEntry[];
}

/** 迁移日志条目 */
export interface MigrationLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  migrationName?: string;
}

/** 迁移函数 */
export type MigrationFn = (config: AppConfig, ctx: MigrationContext) => AppConfig | Promise<AppConfig>;

/** 注册的迁移定义 */
export interface MigrationDefinition {
  /** 从哪个版本迁移 */
  fromVersion: number;
  /** 迁移到哪个版本 */
  toVersion: number;
  /** 迁移名称（用于日志和回滚查找） */
  name: string;
  /** 迁移描述 */
  description?: string;
  /** 执行迁移的函数 */
  migrate: MigrationFn;
  /** 回滚函数（可选） */
  rollback?: MigrationFn;
}

/** 配置验证器（可选） */
export type ConfigValidator = (config: AppConfig) => { valid: boolean; errors: string[] };

export class ConfigMigrationManager {
  private migrations = new Map<string, MigrationDefinition>();
  private logs: MigrationLogEntry[] = [];
  private validators: ConfigValidator[] = [];

  /** 注册一个迁移 */
  registerMigration(migration: MigrationDefinition): void {
    const key = this.migrationKey(migration.fromVersion, migration.toVersion);
    if (this.migrations.has(key)) {
      throw new Error(`Migration ${key} already registered`);
    }
    this.migrations.set(key, migration);
  }

  /** 注册配置验证器 */
  registerValidator(validator: ConfigValidator): void {
    this.validators.push(validator);
  }

  /** 获取注册的所有迁移 */
  listMigrations(): MigrationDefinition[] {
    return Array.from(this.migrations.values()).sort((a, b) => a.fromVersion - b.fromVersion);
  }

  /**
   * 迁移配置到目标版本
   *
   * @param config 当前配置
   * @param targetVersion 目标版本（默认 CURRENT_CONFIG_VERSION）
   * @param options.dryRun 仅模拟，不实际修改
   * @param options.force 即使版本相同也尝试迁移
   */
  async migrate(
    config: AppConfig,
    targetVersion: number = CURRENT_CONFIG_VERSION,
    options?: { dryRun?: boolean; force?: boolean },
  ): Promise<MigrationResult> {
    const start = Date.now();
    const logs: MigrationLogEntry[] = [];
    const appliedMigrations: string[] = [];
    const skippedMigrations: string[] = [];

    const fromVersion = this.getConfigVersion(config);
    const ctx: MigrationContext = {
      fromVersion,
      toVersion: targetVersion,
      timestamp: start,
      dryRun: options?.dryRun ?? false,
    };

    log(logs, 'info', `Starting migration: v${fromVersion} -> v${targetVersion}`);

    if (!options?.force && fromVersion === targetVersion) {
      log(logs, 'info', 'Config already at target version, no migration needed');
      return {
        success: true,
        fromVersion,
        toVersion: targetVersion,
        appliedMigrations,
        skippedMigrations,
        durationMs: Date.now() - start,
        migratedConfig: { ...config, configVersion: targetVersion },
        logs,
      };
    }

    if (fromVersion > targetVersion) {
      const msg = `Cannot downgrade from v${fromVersion} to v${targetVersion}`;
      log(logs, 'error', msg);
      return {
        success: false,
        fromVersion,
        toVersion: targetVersion,
        appliedMigrations,
        skippedMigrations,
        durationMs: Date.now() - start,
        error: msg,
        migratedConfig: config,
        logs,
      };
    }

    // 构建迁移路径
    const path = this.buildMigrationPath(fromVersion, targetVersion);
    if (!path) {
      const msg = `No migration path found from v${fromVersion} to v${targetVersion}`;
      log(logs, 'error', msg);
      return {
        success: false,
        fromVersion,
        toVersion: targetVersion,
        appliedMigrations,
        skippedMigrations,
        durationMs: Date.now() - start,
        error: msg,
        migratedConfig: config,
        logs,
      };
    }

    let currentConfig: AppConfig = { ...config };
    let currentVersion = fromVersion;

    for (const migration of path) {
      if (options?.dryRun) {
        log(logs, 'info', `[dry-run] Would apply migration "${migration.name}"`, migration.name);
        skippedMigrations.push(migration.name);
        continue;
      }

      try {
        log(logs, 'info', `Applying migration "${migration.name}"`, migration.name);
        const result = await migration.migrate(currentConfig, ctx);
        currentConfig = result;
        currentConfig.configVersion = migration.toVersion;
        currentVersion = migration.toVersion;
        appliedMigrations.push(migration.name);
        log(logs, 'info', `Migration "${migration.name}" completed`, migration.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(logs, 'error', `Migration "${migration.name}" failed: ${msg}`, migration.name);
        return {
          success: false,
          fromVersion,
          toVersion: currentVersion,
          appliedMigrations,
          skippedMigrations,
          durationMs: Date.now() - start,
          error: msg,
          migratedConfig: currentConfig,
          logs,
        };
      }
    }

    // 验证最终配置
    const validationErrors = this.validate(currentConfig);
    if (validationErrors.length > 0) {
      log(logs, 'warn', `Config validation produced ${validationErrors.length} warning(s)`);
      for (const e of validationErrors) {
        log(logs, 'warn', `Validation: ${e}`);
      }
    }

    if (!options?.dryRun) {
      currentConfig.configVersion = targetVersion;
    }

    return {
      success: true,
      fromVersion,
      toVersion: options?.dryRun ? fromVersion : targetVersion,
      appliedMigrations,
      skippedMigrations,
      durationMs: Date.now() - start,
      migratedConfig: currentConfig,
      logs,
    };
  }

  /** 回滚到指定版本（需要所有迁移都提供 rollback 函数） */
  async rollback(
    config: AppConfig,
    targetVersion: number,
    options?: { dryRun?: boolean },
  ): Promise<MigrationResult> {
    const start = Date.now();
    const logs: MigrationLogEntry[] = [];
    const appliedMigrations: string[] = [];
    const skippedMigrations: string[] = [];

    const fromVersion = this.getConfigVersion(config);

    log(logs, 'info', `Starting rollback: v${fromVersion} -> v${targetVersion}`);

    if (fromVersion < targetVersion) {
      const msg = `Cannot rollback to a higher version (v${fromVersion} -> v${targetVersion})`;
      log(logs, 'error', msg);
      return {
        success: false,
        fromVersion,
        toVersion: targetVersion,
        appliedMigrations,
        skippedMigrations,
        durationMs: Date.now() - start,
        error: msg,
        migratedConfig: config,
        logs,
      };
    }

    if (fromVersion === targetVersion) {
      return {
        success: true,
        fromVersion,
        toVersion: targetVersion,
        appliedMigrations,
        skippedMigrations,
        durationMs: Date.now() - start,
        migratedConfig: config,
        logs,
      };
    }

    // 反向构建回滚路径
    const rollbackPath: MigrationDefinition[] = [];
    let cur = fromVersion;
    while (cur > targetVersion) {
      const key = this.migrationKey(cur - 1, cur);
      const migration = this.migrations.get(key);
      if (!migration) {
        const msg = `Migration ${key} not found for rollback`;
        log(logs, 'error', msg);
        return {
          success: false,
          fromVersion,
          toVersion: cur,
          appliedMigrations,
          skippedMigrations,
          durationMs: Date.now() - start,
          error: msg,
          migratedConfig: config,
          logs,
        };
      }
      if (!migration.rollback) {
        const msg = `Migration "${migration.name}" does not support rollback`;
        log(logs, 'error', msg);
        return {
          success: false,
          fromVersion,
          toVersion: cur,
          appliedMigrations,
          skippedMigrations,
          durationMs: Date.now() - start,
          error: msg,
          migratedConfig: config,
          logs,
        };
      }
      rollbackPath.push(migration);
      cur--;
    }

    let currentConfig: AppConfig = { ...config };

    for (const migration of rollbackPath) {
      if (options?.dryRun) {
        log(logs, 'info', `[dry-run] Would rollback "${migration.name}"`, migration.name);
        skippedMigrations.push(migration.name);
        continue;
      }

      try {
        if (!migration.rollback) continue; // 已在前面检查过
        const ctx: MigrationContext = {
          fromVersion: this.getConfigVersion(currentConfig),
          toVersion: migration.fromVersion,
          timestamp: Date.now(),
          dryRun: options?.dryRun ?? false,
        };
        currentConfig = await migration.rollback(currentConfig, ctx);
        currentConfig.configVersion = migration.fromVersion;
        appliedMigrations.push(migration.name);
        log(logs, 'info', `Rollback "${migration.name}" completed`, migration.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(logs, 'error', `Rollback "${migration.name}" failed: ${msg}`, migration.name);
        return {
          success: false,
          fromVersion,
          toVersion: this.getConfigVersion(currentConfig),
          appliedMigrations,
          skippedMigrations,
          durationMs: Date.now() - start,
          error: msg,
          migratedConfig: currentConfig,
          logs,
        };
      }
    }

    return {
      success: true,
      fromVersion,
      toVersion: targetVersion,
      appliedMigrations,
      skippedMigrations,
      durationMs: Date.now() - start,
      migratedConfig: currentConfig,
      logs,
    };
  }

  /** 获取配置版本 */
  getConfigVersion(config: AppConfig): number {
    const v = config.configVersion;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
      return v;
    }
    // 没有 configVersion 字段时，假设为 v1
    return 1;
  }

  /** 获取历史日志 */
  getLogs(): MigrationLogEntry[] {
    return [...this.logs];
  }

  /** 清空日志 */
  clearLogs(): void {
    this.logs = [];
  }

  /** 验证配置 */
  private validate(config: AppConfig): string[] {
    const errors: string[] = [];
    for (const v of this.validators) {
      const result = v(config);
      errors.push(...result.errors);
    }
    return errors;
  }

  private buildMigrationPath(from: number, to: number): MigrationDefinition[] | null {
    const path: MigrationDefinition[] = [];
    let cur = from;
    while (cur < to) {
      const key = this.migrationKey(cur, cur + 1);
      const migration = this.migrations.get(key);
      if (!migration) return null;
      path.push(migration);
      cur++;
    }
    return path;
  }

  private migrationKey(from: number, to: number): string {
    return `v${from}->v${to}`;
  }
}

function log(
  logs: MigrationLogEntry[],
  level: MigrationLogEntry['level'],
  message: string,
  migrationName?: string,
): void {
  logs.push({ timestamp: Date.now(), level, message, migrationName });
}

/** 全局默认实例 */
export const configMigrationManager = new ConfigMigrationManager();

/**
 * 内置迁移：v1 -> v2
 *
 * - 将 `port` 字段重命名为 `server.port`
 * - 添加 `logging.level` 默认值
 */
configMigrationManager.registerMigration({
  fromVersion: 1,
  toVersion: 2,
  name: 'restructure-server-config',
  description: '将顶层 port 字段迁移到 server.port，添加 logging.level 默认值',
  migrate: (config) => {
    const next: AppConfig = { ...config };
    if (typeof next.port === 'number') {
      next.server = {
        ...((next.server as Record<string, unknown>) ?? {}),
        port: next.port,
      };
      delete next.port;
    }
    if (!next.logging) {
      next.logging = { level: 'info' };
    }
    return next;
  },
  rollback: (config) => {
    const next: AppConfig = { ...config };
    const server = next.server as Record<string, unknown> | undefined;
    if (server && typeof server.port === 'number') {
      next.port = server.port;
      delete next.server;
    }
    if (next.logging && typeof next.logging === 'object') {
      const logging = next.logging as Record<string, unknown>;
      if (logging.level === 'info' && Object.keys(logging).length === 1) {
        delete next.logging;
      }
    }
    return next;
  },
});

/**
 * 内置迁移：v2 -> v3
 *
 * - 添加 `ai.defaultModel` 默认值（gpt-4o-mini）
 * - 将 `apiKey` 字段迁移到 `ai.providers.openai.apiKey`
 */
configMigrationManager.registerMigration({
  fromVersion: 2,
  toVersion: 3,
  name: 'restructure-ai-config',
  description: '将顶层 apiKey 迁移到 ai.providers.openai.apiKey，添加默认模型配置',
  migrate: (config) => {
    const next: AppConfig = { ...config };
    const apiKey = next.apiKey as string | undefined;
    if (apiKey) {
      const ai = (next.ai as Record<string, unknown>) ?? {};
      const providers = (ai.providers as Record<string, unknown>) ?? {};
      next.ai = {
        ...ai,
        defaultModel: ai.defaultModel ?? 'gpt-4o-mini',
        providers: { ...providers, openai: { ...((providers.openai as Record<string, unknown>) ?? {}), apiKey } },
      };
      delete next.apiKey;
    } else if (!next.ai) {
      next.ai = { defaultModel: 'gpt-4o-mini' };
    }
    return next;
  },
  rollback: (config) => {
    const next: AppConfig = { ...config };
    const ai = next.ai as Record<string, unknown> | undefined;
    if (ai) {
      const providers = ai.providers as Record<string, unknown> | undefined;
      const openai = providers?.openai as Record<string, unknown> | undefined;
      if (openai && typeof openai.apiKey === 'string') {
        next.apiKey = openai.apiKey;
        delete next.ai;
      }
    }
    return next;
  },
});
