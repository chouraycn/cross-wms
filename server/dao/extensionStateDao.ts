/**
 * Extension State DAO — 扩展启用状态与配置持久化
 *
 * 持久化扩展的 enabled 状态和 config，使服务器重启后能自动恢复已启用扩展
 * （调用其 register 重新注册能力到 server 端各注册表）。
 *
 * 表结构：extensions_state(id TEXT PK, enabled INTEGER, config TEXT, updated_at INTEGER)
 */

import type Database from 'better-sqlite3';
import { initDb } from '../db.js';
import { logger } from '../logger.js';

export interface ExtensionStateRow {
  id: string;
  enabled: number; // 0 | 1
  config: string; // JSON string
  updated_at: number; // epoch ms
}

/** 初始化 extensions_state 表（幂等） */
export function initExtensionStateTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS extensions_state (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      config TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `);
}

/** 读取单个扩展的持久化状态 */
export function getExtensionState(id: string): ExtensionStateRow | null {
  const db = initDb();
  const row = db
    .prepare('SELECT id, enabled, config, updated_at FROM extensions_state WHERE id = ?')
    .get(id) as ExtensionStateRow | undefined;
  return row ?? null;
}

/** 读取所有已启用（enabled=1）的扩展状态 */
export function listEnabledExtensionStates(): ExtensionStateRow[] {
  const db = initDb();
  return db
    .prepare('SELECT id, enabled, config, updated_at FROM extensions_state WHERE enabled = 1')
    .all() as ExtensionStateRow[];
}

/** 标记扩展为已启用并保存配置 */
export function setExtensionEnabled(id: string, config: Record<string, unknown>): void {
  const db = initDb();
  const configJson = JSON.stringify(config ?? {});
  const now = Date.now();
  db.prepare(
    `INSERT INTO extensions_state (id, enabled, config, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET enabled = 1, config = excluded.config, updated_at = excluded.updated_at`,
  ).run(id, 1, configJson, now);
  logger.debug(`[ExtensionState] 已持久化启用状态: ${id}`);
}

/** 标记扩展为已禁用（保留 config 以便下次启用恢复） */
export function setExtensionDisabled(id: string): void {
  const db = initDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO extensions_state (id, enabled, config, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET enabled = 0, updated_at = excluded.updated_at`,
  ).run(id, 0, '{}', now);
  logger.debug(`[ExtensionState] 已持久化禁用状态: ${id}`);
}

/** 删除扩展的持久化状态（扩展被删除时调用） */
export function deleteExtensionState(id: string): void {
  const db = initDb();
  db.prepare('DELETE FROM extensions_state WHERE id = ?').run(id);
}
