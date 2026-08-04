// ============================================================================
// 0002_v1_5_0_inv_txn.ts — v1.5.0: 扩展 inventory_transactions CHECK 约束
//
// SQLite 不支持 ALTER CONSTRAINT，需重建表以扩展 type 的 CHECK 约束，
// 加入 transfer_out / transfer_in。逻辑提取自 db-wms.ts，幂等：
// 通过 app_settings 中的 migration_v1.5.0_inv_txn_check 标记保护。
// ============================================================================

import type Database from 'better-sqlite3';
import { logger } from '../logger.js';

export const version = '0002';
export const description = 'v1.5.0: 扩展 inventory_transactions CHECK 约束（transfer_out/transfer_in）';

const MIGRATION_KEY = 'migration_v1.5.0_inv_txn_check';

export async function up(db: Database.Database): Promise<void> {
  const done = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(MIGRATION_KEY) as { value: string } | undefined;
  if (done) {
    logger.info('[Migration 0002] 已执行过，跳过');
    return;
  }

  logger.info('[Migration 0002] 扩展 inventory_transactions CHECK 约束...');
  db.exec(`
    CREATE TABLE inventory_transactions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('inbound', 'outbound', 'adjustment', 'transfer_out', 'transfer_in')),
      quantity INTEGER NOT NULL,
      warehouseId TEXT NOT NULL,
      operator TEXT DEFAULT '',
      sourceId TEXT DEFAULT '',
      sourceType TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (warehouseId) REFERENCES warehouses(id)
    );
    INSERT INTO inventory_transactions_new SELECT * FROM inventory_transactions;
    DROP TABLE inventory_transactions;
    ALTER TABLE inventory_transactions_new RENAME TO inventory_transactions;
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inv_trans_sku ON inventory_transactions(sku);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions(type);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_warehouse ON inventory_transactions(warehouseId);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_created ON inventory_transactions(createdAt);
  `);

  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
    MIGRATION_KEY,
    JSON.stringify({ migratedAt: new Date().toISOString() })
  );
  logger.info('[Migration 0002] ✅ CHECK 约束扩展完成');
}

export async function down(db: Database.Database): Promise<void> {
  // 回滚为原始 CHECK 约束（不含 transfer_out/transfer_in）
  db.exec(`
    CREATE TABLE inventory_transactions_old (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('inbound', 'outbound', 'adjustment')),
      quantity INTEGER NOT NULL,
      warehouseId TEXT NOT NULL,
      operator TEXT DEFAULT '',
      sourceId TEXT DEFAULT '',
      sourceType TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (warehouseId) REFERENCES warehouses(id)
    );
    INSERT INTO inventory_transactions_old
      SELECT id, sku, type, quantity, warehouseId, operator, sourceId, sourceType, remark, createdAt
      FROM inventory_transactions
      WHERE type IN ('inbound', 'outbound', 'adjustment');
    DROP TABLE inventory_transactions;
    ALTER TABLE inventory_transactions_old RENAME TO inventory_transactions;
  `);
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(MIGRATION_KEY);
}
