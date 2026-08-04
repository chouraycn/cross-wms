// ============================================================================
// 0001_initial_schema.ts — 初始表结构基线
//
// 汇总所有域模块的 CREATE TABLE IF NOT EXISTS（通过调用既有 initXxxTables）。
// 这些函数本身幂等：表已存在则跳过。迁移运行器首次执行时，表已由 initDb()
// 中的 initXxxTables 调用创建，此处为幂等空操作，仅用于记录基线版本。
// ============================================================================

import type Database from 'better-sqlite3';

import { initChatTables } from '../db-chat.js';
import { initWmsTables } from '../db-wms.js';
import { initAutomationTables } from '../db-automation.js';
import { initMarketplaceTables } from '../db-marketplace.js';
import { initProjectTables } from '../db-project.js';
import { initPluginTables } from '../db-plugin.js';
import { initSkillTables } from '../db-skill.js';
import { initGoalTables } from '../engine/goalStoreTables.js';
import { initWebhookTables } from '../dao/webhookDaoTables.js';
import { initArchiveTables } from '../engine/messageArchive.js';
import { initTaskMonitorTables } from '../db-task-monitor.js';
import { initWorkboardTables } from '../db-workboard.js';
import { initStaffTables } from '../db-staff.js';

export const version = '0001';
export const description = '初始表结构（所有 CREATE TABLE IF NOT EXISTS）';

export async function up(db: Database.Database): Promise<void> {
  // app_settings 必须先存在，后续迁移与各 init 函数均依赖它
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
}

export async function down(db: Database.Database): Promise<void> {
  // 初始 schema 不支持回滚（会清空全部业务数据）
  void db;
}
