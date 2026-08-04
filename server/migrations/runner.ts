// ============================================================================
// server/migrations/runner.ts — 增量迁移运行器
//
// 职责：
//   1. 读取 migrations/ 目录下的所有迁移文件（按 version 排序）
//   2. 检查 app_settings 表中已执行的迁移版本
//   3. 执行未运行的迁移（每个迁移包裹在事务内）
//   4. 记录迁移状态到 app_settings
//
// 设计要点：
//   - 使用 better-sqlite3 同步 API，runMigrations 为同步函数，可在同步的
//     initDb() 中直接调用。
//   - 迁移文件通过静态 import 注册（保证同步加载），同时用 readdirSync
//     读取目录做一致性校验，提醒开发者注册新增的迁移文件。
//   - 首次运行时，表已由 initDb() 中的 initXxxTables 创建，迁移内部的
//     CREATE TABLE IF NOT EXISTS / ALTER 会幂等跳过，仅记录迁移版本。
//
// 独立运行：
//   npm run db:migrate           — 执行未运行的迁移
//   npm run db:migrate:status    — 查看迁移状态（不执行）
// ============================================================================

import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logger } from '../logger.js';

// 静态注册所有迁移（保持同步加载，适配 better-sqlite3 同步 API）
import * as m0001 from './0001_initial_schema.js';
import * as m0002 from './0002_v1_5_0_inv_txn.js';
import * as m0003 from './0003_add_columns.js';
import * as m0004 from './0004_v9_jsonl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = __dirname;
const MIGRATION_KEY_PREFIX = 'schema_migration:';

export interface Migration {
  version: string;
  description: string;
  up(db: Database.Database): void | Promise<void>;
  down(db: Database.Database): void | Promise<void>;
}

export interface RunOptions {
  statusOnly?: boolean;
}

/** 已注册的迁移（新增迁移文件时在此追加 import 与条目） */
const REGISTRY: Migration[] = [
  m0001 as unknown as Migration,
  m0002 as unknown as Migration,
  m0003 as unknown as Migration,
  m0004 as unknown as Migration,
];

/**
 * 读取 migrations/ 目录，按 version 排序返回已注册的迁移。
 * 同时校验：目录中若存在未注册的迁移文件，输出警告提醒开发者补齐 import。
 */
function discoverMigrations(): Migration[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => /^\d{4}_.+\.ts$/.test(f))
      .sort();
  } catch {
    // 目录读取失败时退化为仅使用静态注册表
  }

  const registered = new Set(REGISTRY.map(m => m.version));
  for (const f of files) {
    const v = f.slice(0, 4);
    if (!registered.has(v)) {
      logger.warn(`[Migrations] 发现未注册的迁移文件: ${f}（请在 runner.ts 中添加 import 并注册）`);
    }
  }

  return REGISTRY.slice().sort((a, b) => a.version.localeCompare(b.version));
}

function isExecuted(db: Database.Database, version: string): boolean {
  const row = db.prepare('SELECT 1 FROM app_settings WHERE key = ?').get(`${MIGRATION_KEY_PREFIX}${version}`);
  return !!row;
}

function recordMigration(db: Database.Database, m: Migration): void {
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
    `${MIGRATION_KEY_PREFIX}${m.version}`,
    JSON.stringify({ version: m.version, description: m.description, runAt: new Date().toISOString() })
  );
}

function printStatus(db: Database.Database, migrations: Migration[]): void {
  console.log('\n数据库迁移状态:');
  console.log('─'.repeat(64));
  let applied = 0;
  for (const m of migrations) {
    const done = isExecuted(db, m.version);
    if (done) applied++;
    console.log(`  [${done ? '✓ applied' : '  pending'}] ${m.version}  ${m.description}`);
  }
  console.log('─'.repeat(64));
  console.log(`已应用 ${applied}/${migrations.length} 个迁移\n`);
}

/**
 * 运行所有未执行的迁移（增量、幂等）。
 *
 * 注意：better-sqlite3 为同步 API，迁移的 up() 虽声明为 async 但内部不包含
 * await，因此同步调用即可完成全部副作用；返回的 Promise（已 resolved）被忽略。
 */
export function runMigrations(db: Database.Database, opts: RunOptions = {}): void {
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

  const migrations = discoverMigrations();
  if (migrations.length === 0) {
    logger.info('[Migrations] 未发现迁移文件');
    return;
  }

  if (opts.statusOnly) {
    printStatus(db, migrations);
    return;
  }

  let executed = 0;
  let skipped = 0;

  for (const m of migrations) {
    if (isExecuted(db, m.version)) {
      skipped++;
      continue;
    }

    logger.info(`[Migrations] 执行 ${m.version}: ${m.description}`);
    db.exec('BEGIN');
    try {
      // up() 声明为 async 但 better-sqlite3 操作同步完成，无需 await
      m.up(db);
      recordMigration(db, m);
      db.exec('COMMIT');
      executed++;
      logger.info(`[Migrations] ✅ ${m.version} 完成`);
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      logger.error(`[Migrations] ❌ ${m.version} 失败，已回滚:`, e);
      throw e;
    }
  }

  logger.info(`[Migrations] 完成 executed=${executed} skipped=${skipped} total=${migrations.length}`);
}

// ===================== 独立运行入口 =====================
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  void (async () => {
    const statusOnly = process.argv.includes('--status');
    const { AppPaths } = await import('../config/appPaths.js');
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(AppPaths.chatDbFile);
    try {
      runMigrations(db, { statusOnly });
    } catch (e) {
      console.error('[Migrations] 运行失败:', e);
      process.exitCode = 1;
    } finally {
      db.close();
    }
  })();
}
