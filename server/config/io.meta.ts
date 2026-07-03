// 配置元数据
// 参考 openclaw/src/config/io.meta.ts 的设计，维护随配置写入的元数据字段
// （版本、来源、时间戳），并提供 last-known-good 配置恢复能力

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AppPaths } from './appPaths.js';
import { logger } from '../logger.js';
import { CONFIG_VERSION } from './version.js';

// ============================================================================
// 元数据字段定义
// ============================================================================

// 自动管理的配置元数据字段名
export const AUTO_MANAGED_CONFIG_META_FIELDS = {
  lastTouchedVersion: 'lastTouchedVersion',
  lastTouchedAt: 'lastTouchedAt',
  configVersion: 'configVersion',
  source: 'source',
} as const;

// 元数据字段在配置中的点分路径
export const AUTO_MANAGED_CONFIG_META_PATHS = [
  ['meta', AUTO_MANAGED_CONFIG_META_FIELDS.lastTouchedVersion],
  ['meta', AUTO_MANAGED_CONFIG_META_FIELDS.lastTouchedAt],
  ['meta', AUTO_MANAGED_CONFIG_META_FIELDS.configVersion],
  ['meta', AUTO_MANAGED_CONFIG_META_FIELDS.source],
] as const;

// ============================================================================
// 类型定义
// ============================================================================

export interface ConfigMetadata {
  // 最后修改配置的二进制版本号
  lastTouchedVersion?: string;
  // 最后修改时间（ISO 字符串）
  lastTouchedAt?: string;
  // 配置 schema 版本号
  configVersion?: string;
  // 配置来源（file / env / cli / default 等）
  source?: string;
  // 配置文件路径
  configPath?: string;
  // 配置内容的 SHA-256 哈希
  configHash?: string;
}

export type ConfigRecord = Record<string, unknown>;

// ============================================================================
// 元数据写入
// ============================================================================

// 在配置对象上盖戳元数据字段（lastTouchedVersion / lastTouchedAt / configVersion / source）
export function stampConfigWriteMetadata(
  cfg: ConfigRecord,
  now: string = new Date().toISOString(),
  version: string = CONFIG_VERSION,
  source: string = 'file',
): ConfigRecord {
  const existingMeta = (cfg.meta && typeof cfg.meta === 'object' ? cfg.meta : {}) as ConfigRecord;
  return {
    ...cfg,
    meta: {
      ...existingMeta,
      [AUTO_MANAGED_CONFIG_META_FIELDS.lastTouchedVersion]: version,
      [AUTO_MANAGED_CONFIG_META_FIELDS.lastTouchedAt]: now,
      [AUTO_MANAGED_CONFIG_META_FIELDS.configVersion]: CONFIG_VERSION,
      [AUTO_MANAGED_CONFIG_META_FIELDS.source]: source,
    },
  };
}

// ============================================================================
// 元数据读取
// ============================================================================

// 从配置对象中提取元数据
export function getConfigMetadata(cfg: unknown): ConfigMetadata {
  if (!cfg || typeof cfg !== 'object') {
    return {};
  }
  const root = cfg as ConfigRecord;
  const meta = root.meta;
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  const metaRecord = meta as ConfigRecord;
  return {
    lastTouchedVersion: typeof metaRecord.lastTouchedVersion === 'string' ? metaRecord.lastTouchedVersion : undefined,
    lastTouchedAt: typeof metaRecord.lastTouchedAt === 'string' ? metaRecord.lastTouchedAt : undefined,
    configVersion: typeof metaRecord.configVersion === 'string' ? metaRecord.configVersion : undefined,
    source: typeof metaRecord.source === 'string' ? metaRecord.source : undefined,
  };
}

// ============================================================================
// Last-Known-Good 恢复
// ============================================================================

// last-known-good 配置的存储路径（与主配置文件同目录，使用 .lkg 后缀）
export function resolveLastKnownGoodPath(configPath: string): string {
  return `${configPath}.lkg`;
}

// 保存当前配置为 last-known-good
export async function saveLastKnownGood(configPath: string, data: unknown): Promise<void> {
  const lkgPath = resolveLastKnownGoodPath(configPath);
  const dir = path.dirname(lkgPath);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmpPath = `${lkgPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const content = JSON.stringify(data, null, 2);
  try {
    await fs.promises.writeFile(tmpPath, content, 'utf-8');
    await fs.promises.rename(tmpPath, lkgPath);
  } catch (err) {
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      // 忽略清理失败
    }
    throw err;
  }
}

// 从 last-known-good 恢复配置，返回恢复后的配置对象；不存在时返回 null
export async function recoverConfigFromLastKnownGood(configPath: string): Promise<ConfigRecord | null> {
  const lkgPath = resolveLastKnownGoodPath(configPath);
  let content: string;
  try {
    content = await fs.promises.readFile(lkgPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.warn(`[config] last-known-good 不存在: ${lkgPath}`);
      return null;
    }
    throw err;
  }
  try {
    const parsed = JSON.parse(content) as ConfigRecord;
    logger.info(`[config] 已从 last-known-good 恢复配置: ${lkgPath}`);
    return parsed;
  } catch (err) {
    logger.error(`[config] last-known-good 解析失败: ${lkgPath}`, err);
    return null;
  }
}

// ============================================================================
// 配置快照元数据
// ============================================================================

// 配置快照元数据：包含快照时刻的版本、来源、时间戳与哈希
export interface ConfigSnapshotMetadata {
  version: string;
  source: string;
  timestamp: string;
  configPath: string;
  configHash: string;
  bytes: number;
}

// 从原始配置内容字符串计算快照元数据
export function buildConfigSnapshotMetadata(params: {
  rawContent: string;
  configPath: string;
  version?: string;
  source?: string;
  timestamp?: string;
}): ConfigSnapshotMetadata {
  const hash = crypto.createHash('sha256');
  hash.update(params.rawContent, 'utf-8');
  return {
    version: params.version ?? CONFIG_VERSION,
    source: params.source ?? 'file',
    timestamp: params.timestamp ?? new Date().toISOString(),
    configPath: params.configPath,
    configHash: hash.digest('hex'),
    bytes: Buffer.byteLength(params.rawContent, 'utf-8'),
  };
}

// ============================================================================
// 配置备份
// ============================================================================

// 配置备份路径（与主配置文件同目录，使用 .bak 后缀）
export function resolveConfigBackupPath(configPath: string): string {
  return `${configPath}.bak`;
}

// 创建配置文件备份（best-effort，失败仅记录日志不抛出）
export async function backupConfigFile(configPath: string): Promise<boolean> {
  const backupPath = resolveConfigBackupPath(configPath);
  try {
    await fs.promises.copyFile(configPath, backupPath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // 源文件不存在，无需备份
      return false;
    }
    logger.warn(`[config] 配置备份失败: ${configPath} -> ${backupPath}`, err);
    return false;
  }
}

// 解析配置目录（统一从 AppPaths 取，便于测试覆盖）
export function resolveConfigDir(): string {
  return AppPaths.configDir;
}
