// ============================================================================
// scripts/gen-db-types.ts — 生成 Kysely 类型定义（server/types/db-types.ts）
//
// 策略：在一个临时 SQLite 文件上运行全部 initXxxTables 以获得完整 schema，
// 再用 kysely-codegen 反射出 TypeScript 类型。这样不依赖生产数据库文件存在，
// 全新环境 / CI 均可生成最新类型。生成完成后删除临时文件。
//
// 用法：npm run db:kysely:gen
// ============================================================================

import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

import { initChatTables } from '../server/db-chat.js';
import { initWmsTables } from '../server/db-wms.js';
import { initAutomationTables } from '../server/db-automation.js';
import { initMarketplaceTables } from '../server/db-marketplace.js';
import { initProjectTables } from '../server/db-project.js';
import { initPluginTables } from '../server/db-plugin.js';
import { initSkillTables } from '../server/db-skill.js';
import { initGoalTables } from '../server/engine/goalStoreTables.js';
import { initWebhookTables } from '../server/dao/webhookDaoTables.js';
import { initArchiveTables } from '../server/engine/messageArchive.js';
import { initTaskMonitorTables } from '../server/db-task-monitor.js';
import { initWorkboardTables } from '../server/db-workboard.js';
import { initStaffTables } from '../server/db-staff.js';

const tmpDbPath = path.join(os.tmpdir(), `cross-wms-kysely-gen-${process.pid}-${Date.now()}.db`);
const outPath = path.resolve(process.cwd(), 'server', 'types', 'db-types.ts');

function fail(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}

try {
  // 1) 临时数据库上跑全量表初始化，确保 schema 完整
  const db = new Database(tmpDbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  initChatTables(db);
  initWmsTables(db);
  initAutomationTables(db);
  initMarketplaceTables(db);
  initProjectTables(db);
  initPluginTables(db);
  initSkillTables(db);
  initGoalTables(db);
  initWebhookTables(db);
  initArchiveTables(db);
  initTaskMonitorTables(db);
  initWorkboardTables(db);
  initStaffTables(db);
  db.close();

  // 2) 确保输出目录存在
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 3) 调用 kysely-codegen 反射生成类型
  const result = spawnSync(
    'kysely-codegen',
    ['--dialect', 'sqlite', '--url', `sqlite:${tmpDbPath}`, '--out-path', outPath],
    { stdio: 'inherit' }
  );

  if (result.error) {
    fail(`[gen-db-types] 无法启动 kysely-codegen：${result.error.message}\n  请确认已安装：npm install -D kysely-codegen`);
  }
  if (result.status !== 0) {
    fail(`[gen-db-types] kysely-codegen 退出码 ${result.status}`, result.status ?? 1);
  }

  console.log(`[gen-db-types] ✅ 类型已生成: ${path.relative(process.cwd(), outPath)}`);
} finally {
  try { if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath); } catch { /* ignore */ }
}
