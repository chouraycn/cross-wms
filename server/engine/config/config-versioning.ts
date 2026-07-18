import { logger } from '../../logger.js';
import { resolveConfigDir } from './paths.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const ConfigSnapshotSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  config: z.record(z.string(), z.unknown()),
  hash: z.string(),
});

export type ConfigSnapshot = z.infer<typeof ConfigSnapshotSchema>;

const ConfigVersionHistorySchema = z.object({
  currentVersion: z.string(),
  snapshots: z.array(ConfigSnapshotSchema),
  maxSnapshots: z.number().int().positive(),
});

export type ConfigVersionHistory = z.infer<typeof ConfigVersionHistorySchema>;

const VERSION_HISTORY_FILE = '.config-versions.json';
const SNAPSHOTS_DIR = 'config-snapshots';
const DEFAULT_MAX_SNAPSHOTS = 10;

async function createHash(config: unknown): Promise<string> {
  const crypto = await import('node:crypto');
  return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

export function getVersionHistoryFilePath(): string {
  return join(resolveConfigDir(), VERSION_HISTORY_FILE);
}

export function getSnapshotsDir(): string {
  return join(resolveConfigDir(), SNAPSHOTS_DIR);
}

export function readVersionHistory(): ConfigVersionHistory {
  const path = getVersionHistoryFilePath();

  if (!existsSync(path)) {
    return {
      currentVersion: '1.0.0',
      snapshots: [],
      maxSnapshots: DEFAULT_MAX_SNAPSHOTS,
    };
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    return ConfigVersionHistorySchema.parse(parsed);
  } catch (err) {
    logger.error(`[ConfigVersioning] 读取版本历史失败: ${err}`);
    return {
      currentVersion: '1.0.0',
      snapshots: [],
      maxSnapshots: DEFAULT_MAX_SNAPSHOTS,
    };
  }
}

export function writeVersionHistory(history: ConfigVersionHistory): void {
  const path = getVersionHistoryFilePath();
  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(history, null, 2), 'utf-8');
}

export async function createSnapshot(config: unknown, version?: string): Promise<{ success: boolean; snapshot?: ConfigSnapshot }> {
  const hash = await createHash(config);
  const timestamp = new Date().toISOString();
  const snapshotVersion = version ?? `v${Date.now()}`;

  const snapshot: ConfigSnapshot = {
    version: snapshotVersion,
    timestamp,
    config: config as Record<string, unknown>,
    hash,
  };

  const history = readVersionHistory();
  const snapshotsDir = getSnapshotsDir();

  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }

  const snapshotPath = join(snapshotsDir, `${snapshotVersion}.json`);
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');

  history.snapshots.unshift(snapshot);

  if (history.snapshots.length > history.maxSnapshots) {
    const toRemove = history.snapshots.splice(history.maxSnapshots);
    for (const oldSnapshot of toRemove) {
      const oldPath = join(snapshotsDir, `${oldSnapshot.version}.json`);
      if (existsSync(oldPath)) {
        try {
          renameSync(oldPath, `${oldPath}.bak`);
        } catch {
          logger.warn(`[ConfigVersioning] 无法清理旧快照: ${oldSnapshot.version}`);
        }
      }
    }
  }

  history.currentVersion = snapshotVersion;
  writeVersionHistory(history);

  logger.info(`[ConfigVersioning] 创建配置快照: ${snapshotVersion}`);
  return { success: true, snapshot };
}

export function getSnapshot(version: string): ConfigSnapshot | null {
  const snapshotsDir = getSnapshotsDir();
  const path = join(snapshotsDir, `${version}.json`);

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    return ConfigSnapshotSchema.parse(parsed);
  } catch (err) {
    logger.error(`[ConfigVersioning] 读取快照失败: ${err}`);
    return null;
  }
}

export function listSnapshots(): ConfigSnapshot[] {
  const history = readVersionHistory();
  return history.snapshots;
}

export async function restoreSnapshot(version: string): Promise<{ success: boolean; config?: unknown; message?: string }> {
  const snapshot = getSnapshot(version);
  if (!snapshot) {
    return { success: false, message: `快照不存在: ${version}` };
  }

  const configPath = join(resolveConfigDir(), 'config.json');
  writeFileSync(configPath, JSON.stringify(snapshot.config, null, 2), 'utf-8');

  const history = readVersionHistory();
  history.currentVersion = version;
  writeVersionHistory(history);

  logger.info(`[ConfigVersioning] 恢复配置快照: ${version}`);
  return { success: true, config: snapshot.config };
}

export function deleteSnapshot(version: string): boolean {
  const snapshotsDir = getSnapshotsDir();
  const path = join(snapshotsDir, `${version}.json`);

  if (!existsSync(path)) {
    return false;
  }

  try {
    renameSync(path, `${path}.deleted`);
    const history = readVersionHistory();
    history.snapshots = history.snapshots.filter(s => s.version !== version);
    writeVersionHistory(history);
    logger.info(`[ConfigVersioning] 删除配置快照: ${version}`);
    return true;
  } catch (err) {
    logger.error(`[ConfigVersioning] 删除快照失败: ${err}`);
    return false;
  }
}

export function getVersionHistoryStats(): {
  totalSnapshots: number;
  currentVersion: string;
  oldestVersion: string | null;
  newestVersion: string | null;
} {
  const history = readVersionHistory();
  return {
    totalSnapshots: history.snapshots.length,
    currentVersion: history.currentVersion,
    oldestVersion: history.snapshots.length > 0 ? history.snapshots[history.snapshots.length - 1].version : null,
    newestVersion: history.snapshots.length > 0 ? history.snapshots[0].version : null,
  };
}

export async function compareSnapshots(version1: string, version2: string): Promise<{
  success: boolean;
  diff?: Record<string, { before: unknown; after: unknown }>;
  message?: string;
}> {
  const snapshot1 = getSnapshot(version1);
  const snapshot2 = getSnapshot(version2);

  if (!snapshot1 || !snapshot2) {
    return { success: false, message: '快照不存在' };
  }

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const allKeys = new Set([...Object.keys(snapshot1.config), ...Object.keys(snapshot2.config)]);

  for (const key of allKeys) {
    if (JSON.stringify(snapshot1.config[key]) !== JSON.stringify(snapshot2.config[key])) {
      diff[key] = {
        before: snapshot1.config[key],
        after: snapshot2.config[key],
      };
    }
  }

  return { success: true, diff };
}

export function setMaxSnapshots(max: number): void {
  const history = readVersionHistory();
  history.maxSnapshots = max;

  while (history.snapshots.length > max) {
    const toRemove = history.snapshots.pop();
    if (toRemove) {
      const path = join(getSnapshotsDir(), `${toRemove.version}.json`);
      if (existsSync(path)) {
        try {
          renameSync(path, `${path}.bak`);
        } catch {
          logger.warn(`[ConfigVersioning] 无法清理旧快照: ${toRemove.version}`);
        }
      }
    }
  }

  writeVersionHistory(history);
}