import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import { listSessionFiles, readSessionFirstLine } from '../session-file.js';
import type { SessionMetadata } from '../types.js';
import type { Migration, MigrationStepResult } from './migration-types.js';

export const MIGRATIONS: Migration[] = [
  {
    id: 'v0.9-to-v1.0',
    fromVersion: '0.9',
    toVersion: '1.0.0',
    description: '升级会话 schema 从 v0.9 到 v1.0.0',
    up: migrateFromV09ToV10,
  },
];

async function migrateFromV09ToV10(
  baseDir: string,
  archivedDir: string
): Promise<MigrationStepResult> {
  const result: MigrationStepResult = {
    success: true,
    migrated: 0,
    failed: 0,
    errors: [],
    fromVersion: '0.9',
    toVersion: '1.0.0',
  };

  const migrateDir = async (dir: string) => {
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

  await migrateDir(baseDir);
  await migrateDir(archivedDir);

  return result;
}