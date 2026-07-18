import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { listSessionFiles, readSessionFirstLine } from './session-file.js';
import type { SessionMetadata } from './types.js';

export interface MigrationResult {
  success: boolean;
  migrated: number;
  failed: number;
  errors: string[];
  fromVersion: string;
  toVersion: string;
}

export interface Migration {
  id: string;
  fromVersion: string;
  toVersion: string;
  description: string;
  up: (baseDir: string, archivedDir: string) => Promise<MigrationResult>;
}

const CURRENT_SCHEMA_VERSION = '1.0.0';

const MIGRATIONS: Migration[] = [
  {
    id: 'v0.9-to-v1.0',
    fromVersion: '0.9',
    toVersion: '1.0.0',
    description: '升级会话 schema 从 v0.9 到 v1.0.0',
    up: migrateFromV09ToV10,
  },
];

export async function runMigrations(
  baseDir: string,
  archivedDir: string,
  targetVersion: string = CURRENT_SCHEMA_VERSION
): Promise<MigrationResult> {
  logger.info('[StoreMigrations] 开始检查数据迁移...');

  const overallResult: MigrationResult = {
    success: true,
    migrated: 0,
    failed: 0,
    errors: [],
    fromVersion: '',
    toVersion: targetVersion,
  };

  try {
    const currentVersion = detectSchemaVersion(baseDir);
    overallResult.fromVersion = currentVersion;

    if (currentVersion === targetVersion) {
      logger.info('[StoreMigrations] Schema 已是最新版本:', targetVersion);
      return overallResult;
    }

    const pendingMigrations = MIGRATIONS.filter(m => {
      return versionCompare(m.fromVersion, currentVersion) >= 0
        && versionCompare(m.toVersion, targetVersion) <= 0;
    });

    for (const migration of pendingMigrations) {
      logger.info(`[StoreMigrations] 执行迁移: ${migration.id}`);
      const result = await migration.up(baseDir, archivedDir);

      overallResult.migrated += result.migrated;
      overallResult.failed += result.failed;
      overallResult.errors.push(...result.errors);

      if (!result.success) {
        overallResult.success = false;
        logger.error(`[StoreMigrations] 迁移失败: ${migration.id}`);
        break;
      }
    }

    updateSchemaVersion(baseDir, targetVersion);
    logger.info(`[StoreMigrations] 迁移完成: ${overallResult.migrated} 个成功, ${overallResult.failed} 个失败`);
  } catch (err) {
    overallResult.success = false;
    overallResult.errors.push(`迁移异常: ${String(err)}`);
    logger.error('[StoreMigrations] 迁移异常:', err);
  }

  return overallResult;
}

function detectSchemaVersion(baseDir: string): string {
  const versionFile = path.join(baseDir, '.schema-version');

  try {
    if (fs.existsSync(versionFile)) {
      const version = fs.readFileSync(versionFile, 'utf-8').trim();
      if (version) return version;
    }
  } catch {
    // ignore
  }

  const sessionIds = listSessionFiles(baseDir);
  if (sessionIds.length === 0) {
    return CURRENT_SCHEMA_VERSION;
  }

  for (const sessionId of sessionIds.slice(0, 5)) {
    const firstLine = readSessionFirstLine(baseDir, sessionId);
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

function updateSchemaVersion(baseDir: string, version: string): void {
  try {
    const versionFile = path.join(baseDir, '.schema-version');
    const dir = path.dirname(versionFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(versionFile, version, 'utf-8');
  } catch (err) {
    logger.warn('[StoreMigrations] 更新版本文件失败:', err);
  }
}

async function migrateFromV09ToV10(
  baseDir: string,
  archivedDir: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    migrated: 0,
    failed: 0,
    errors: [],
    fromVersion: '0.9',
    toVersion: '1.0.0',
  };

  const migrateDir = async (dir: string, _isArchived: boolean) => {
    const sessionIds = listSessionFiles(dir);

    for (const sessionId of sessionIds) {
      try {
        const filePath = path.join(dir, `${sessionId}.jsonl`);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);

        if (lines.length === 0) continue;

        const firstLine = JSON.parse(lines[0]);
        const metadata: Partial<SessionMetadata> = firstLine.session || firstLine.metadata || {};

        if (metadata.schemaVersion === '1.0.0') continue;

        const now = new Date().toISOString();
        const updatedMetadata = {
          ...metadata,
          id: metadata.id || sessionId,
          schemaVersion: '1.0.0',
          status: metadata.status || 'active',
          createdAt: metadata.createdAt || now,
          updatedAt: now,
          lastActiveAt: metadata.lastActiveAt || now,
          sessionDate: metadata.sessionDate || now.split('T')[0],
          title: metadata.title || '未命名会话',
          model: metadata.model || 'auto',
          tags: metadata.tags || [],
          messageCount: metadata.messageCount || Math.max(0, lines.length - 1),
        };

        const newFirstLine = JSON.stringify({
          session: updatedMetadata,
          messages: firstLine.messages || [],
          goals: firstLine.goals || [],
          artifacts: firstLine.artifacts || [],
          targets: firstLine.targets || [],
          extra: firstLine.extra || {},
        });

        const newContent = [newFirstLine, ...lines.slice(1)].join('\n');
        fs.writeFileSync(filePath, newContent, 'utf-8');

        result.migrated++;
      } catch (err) {
        result.failed++;
        result.errors.push(`${sessionId}: ${String(err)}`);
      }
    }
  };

  await migrateDir(baseDir, false);
  await migrateDir(archivedDir, true);

  return result;
}

function versionCompare(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

export function needsMigration(baseDir: string, targetVersion: string = CURRENT_SCHEMA_VERSION): boolean {
  const currentVersion = detectSchemaVersion(baseDir);
  return versionCompare(currentVersion, targetVersion) < 0;
}

export function getCurrentSchemaVersion(baseDir: string): string {
  return detectSchemaVersion(baseDir);
}

export function getAvailableMigrations(): Migration[] {
  return [...MIGRATIONS];
}
