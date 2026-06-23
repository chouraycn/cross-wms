// ============================================================================
// storage/migration.ts — v9.0 会话迁移：从 SQLite 迁移到 JSONL
//
// 将旧 SQLite 数据库中 sessions 和 messages 表的数据导出到
// FileStorage JSONL 文件中，完成后在 app_settings 中标记迁移完成。
// ============================================================================

import Database from 'better-sqlite3';
import { FileStorage } from './FileStorage.js';
import { logger } from '../logger.js';

/**
 * 将旧 SQLite 中的 sessions/messages 数据导出到 JSONL 文件。
 * 幂等：检查 app_settings 中 v9_jsonl_migrated 标记，已迁移则跳过。
 */
export function migrateSessionsToJsonl(db: Database.Database): void {
  // 检查是否已迁移（在 app_settings 中标记）
  const alreadyMigrated = db.prepare(
    "SELECT value FROM app_settings WHERE key='v9_jsonl_migrated'"
  ).get() as { value: string } | undefined;
  if (alreadyMigrated) return;

  // 确保会话目录存在
  FileStorage.ensureDirectories();

  // 检查 sessions 表是否存在（首次初始化时可能没有旧数据）
  try {
    db.prepare('SELECT count(*) as cnt FROM sessions').get();
  } catch {
    // sessions 表不存在，直接标记迁移完成
    try {
      db.prepare(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('v9_jsonl_migrated', '1')"
      ).run();
    } catch {
      // app_settings 表可能也不存在，忽略
    }
    logger.info('[Migration] 无旧 sessions 表，跳过迁移');
    return;
  }

  // 读取所有 sessions
  const sessions = db.prepare('SELECT * FROM sessions').all() as any[];
  let migratedCount = 0;

  for (const session of sessions) {
    // 读取该 session 的所有 messages
    const messages = db.prepare(
      'SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp ASC'
    ).all(session.id) as any[];

    // 写入 JSONL
    const sessionData = { session, messages };
    try {
      FileStorage.appendSessionLine(session.id, sessionData);
      migratedCount++;
    } catch (e) {
      logger.warn(`[Migration] 会话 ${session.id} 迁移失败:`, e);
    }
  }

  // 标记迁移完成
  db.prepare(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('v9_jsonl_migrated', '1')"
  ).run();

  logger.info(`[Migration] 已迁移 ${migratedCount} 个会话到 JSONL`);
}