// ============================================================================
// 0004_v9_jsonl.ts — v9.0: 会话从 SQLite 迁移到 JSONL
//
// 将旧 sessions/messages 表数据导出到 FileStorage JSONL 文件。
// 逻辑提取自 storage/migration.ts，幂等：通过 app_settings 中的
// v9_jsonl_migrated 标记保护。
// ============================================================================

import type Database from 'better-sqlite3';
import { migrateSessionsToJsonl } from '../storage/migration.js';

export const version = '0004';
export const description = 'v9.0: 会话从 SQLite 迁移到 JSONL';

export async function up(db: Database.Database): Promise<void> {
  // migrateSessionsToJsonl 内部已确保 app_settings 存在并做幂等检查
  migrateSessionsToJsonl(db);
}

export async function down(db: Database.Database): Promise<void> {
  // JSONL 迁移不可逆（旧 SQLite 表数据已导出，不删除 JSONL）
  void db;
}
