import { logger } from '../../logger.js';
import { resolveConfigDir, resolvePaths } from './paths.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const ConfigVersionSchema = z.object({
  version: z.string(),
  migratedAt: z.string(),
  migrationHistory: z.array(z.object({
    fromVersion: z.string(),
    toVersion: z.string(),
    timestamp: z.string(),
    success: z.boolean(),
    message: z.string().optional(),
  })),
});

export type ConfigVersion = z.infer<typeof ConfigVersionSchema>;

const CONFIG_VERSION_FILE = '.config-version.json';
const CURRENT_CONFIG_VERSION = '1.0.0';

const MIGRATIONS: Record<string, (config: unknown) => unknown> = {
  '0.9.0_to_1.0.0': (config: unknown) => {
    const obj = config as Record<string, unknown>;
    if (!obj.gateway) {
      obj.gateway = {
        port: 3000,
        host: '127.0.0.1',
        auth: { mode: 'none' },
      };
    }
    if (!obj.models) {
      obj.models = { providers: {} };
    }
    if (!obj.plugins) {
      obj.plugins = { directories: [], enabled: [] };
    }
    return obj;
  },
};

export function getConfigVersionFilePath(): string {
  return join(resolveConfigDir(), CONFIG_VERSION_FILE);
}

export function getCurrentConfigVersion(): string {
  return CURRENT_CONFIG_VERSION;
}

export function readConfigVersion(): ConfigVersion | null {
  const path = getConfigVersionFilePath();
  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    return ConfigVersionSchema.parse(parsed);
  } catch (err) {
    logger.error(`[ConfigMigration] 读取配置版本失败: ${err}`);
    return null;
  }
}

export function writeConfigVersion(version: ConfigVersion): void {
  const path = getConfigVersionFilePath();
  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(version, null, 2), 'utf-8');
}

export function needsConfigMigration(): boolean {
  const version = readConfigVersion();
  if (!version) return true;
  return version.version !== CURRENT_CONFIG_VERSION;
}

export function getConfigMigrationStatus(): {
  currentVersion: string | null;
  targetVersion: string;
  needsMigration: boolean;
} {
  const version = readConfigVersion();
  return {
    currentVersion: version?.version ?? null,
    targetVersion: CURRENT_CONFIG_VERSION,
    needsMigration: needsConfigMigration(),
  };
}

export function runConfigMigration(): { success: boolean; message: string } {
  const version = readConfigVersion();
  const currentVersion = version?.version ?? '0.0.0';

  logger.info(`[ConfigMigration] 开始迁移配置: ${currentVersion} -> ${CURRENT_CONFIG_VERSION}`);

  try {
    const configPath = join(resolveConfigDir(), 'config.json');
    let config: unknown = {};

    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    }

    for (const [key, migrate] of Object.entries(MIGRATIONS)) {
      const [from, to] = key.split('_to_');
      if (compareVersions(currentVersion, from) < 0 && compareVersions(currentVersion, to) < 0) {
        logger.info(`[ConfigMigration] 应用迁移: ${from} -> ${to}`);
        config = migrate(config);
      }
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const newVersion: ConfigVersion = {
      version: CURRENT_CONFIG_VERSION,
      migratedAt: new Date().toISOString(),
      migrationHistory: [
        ...(version?.migrationHistory ?? []),
        {
          fromVersion: currentVersion,
          toVersion: CURRENT_CONFIG_VERSION,
          timestamp: new Date().toISOString(),
          success: true,
          message: 'Config migrated successfully',
        },
      ],
    };

    writeConfigVersion(newVersion);
    logger.info(`[ConfigMigration] 配置迁移完成: ${CURRENT_CONFIG_VERSION}`);

    return { success: true, message: `配置已迁移到版本 ${CURRENT_CONFIG_VERSION}` };
  } catch (err) {
    logger.error(`[ConfigMigration] 配置迁移失败: ${err}`);
    return { success: false, message: `配置迁移失败: ${err}` };
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 !== p2) return p1 - p2;
  }

  return 0;
}

export function initConfigVersion(): void {
  const path = getConfigVersionFilePath();
  if (!existsSync(path)) {
    const version: ConfigVersion = {
      version: CURRENT_CONFIG_VERSION,
      migratedAt: new Date().toISOString(),
      migrationHistory: [],
    };
    writeConfigVersion(version);
  }
}