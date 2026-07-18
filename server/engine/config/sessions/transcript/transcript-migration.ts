import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import { listSessionFiles } from '../session-file.js';
import { readTranscriptJSONL } from '../transcript-jsonl.js';
import type { TranscriptMessage } from '../types.js';
import { SQLiteTranscriptStore } from './transcript-store.sqlite.js';

export interface TranscriptMigrationResult {
  success: boolean;
  migratedSessions: number;
  migratedMessages: number;
  failedSessions: number;
  errors: string[];
}

const CURRENT_TRANSCRIPT_VERSION = '1.0.0';

export async function migrateTranscriptsToSQLite(
  baseDir: string,
  dbPath: string
): Promise<TranscriptMigrationResult> {
  const result: TranscriptMigrationResult = {
    success: true,
    migratedSessions: 0,
    migratedMessages: 0,
    failedSessions: 0,
    errors: [],
  };

  logger.info('[TranscriptMigration] 开始迁移转录数据到 SQLite...');

  try {
    const store = new SQLiteTranscriptStore(dbPath);
    store.init();

    const sessionIds = listSessionFiles(baseDir);
    logger.info(`[TranscriptMigration] 发现 ${sessionIds.length} 个会话文件`);

    for (const sessionId of sessionIds) {
      try {
        const transcript = readTranscriptJSONL(baseDir, sessionId);

        if (transcript.messages.length === 0) {
          continue;
        }

        const entries = store.insertEntries(sessionId, transcript.messages);
        result.migratedMessages += entries.length;
        result.migratedSessions++;

        if (result.migratedSessions % 100 === 0) {
          logger.info(`[TranscriptMigration] 已迁移 ${result.migratedSessions} 个会话`);
        }
      } catch (err) {
        result.failedSessions++;
        result.errors.push(`${sessionId}: ${String(err)}`);
        logger.error('[TranscriptMigration] 迁移会话失败:', sessionId, err);
      }
    }

    store.close();

    saveMigrationMarker(dbPath);

    logger.info(`[TranscriptMigration] 迁移完成: ${result.migratedSessions} 个会话, ${result.migratedMessages} 条消息`);
  } catch (err) {
    result.success = false;
    result.errors.push(`迁移异常: ${String(err)}`);
    logger.error('[TranscriptMigration] 迁移异常:', err);
  }

  return result;
}

export function needsTranscriptMigration(baseDir: string, dbPath: string): boolean {
  const markerPath = getMigrationMarkerPath(dbPath);
  if (fs.existsSync(markerPath)) {
    const marker = fs.readFileSync(markerPath, 'utf-8').trim();
    if (marker === CURRENT_TRANSCRIPT_VERSION) {
      return false;
    }
  }

  const sessionIds = listSessionFiles(baseDir);
  return sessionIds.length > 0;
}

export function getTranscriptMigrationStatus(dbPath: string): {
  migrated: boolean;
  version: string;
} {
  const markerPath = getMigrationMarkerPath(dbPath);
  if (fs.existsSync(markerPath)) {
    const version = fs.readFileSync(markerPath, 'utf-8').trim();
    return { migrated: version === CURRENT_TRANSCRIPT_VERSION, version };
  }
  return { migrated: false, version: '0.0.0' };
}

function saveMigrationMarker(dbPath: string): void {
  const markerPath = getMigrationMarkerPath(dbPath);
  const dir = path.dirname(markerPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(markerPath, CURRENT_TRANSCRIPT_VERSION, 'utf-8');
}

function getMigrationMarkerPath(dbPath: string): string {
  const dir = path.dirname(dbPath);
  return path.join(dir, '.transcript-version');
}