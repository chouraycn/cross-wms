// ============================================================================
// 0003_add_columns.ts — ALTER TABLE 添加列
//
// 汇总 WMS 各表的新增列（提取自 db-wms.ts）。每列均通过 pragma_table_info
// 做存在性检查，保证幂等。首次运行时列已由 initWmsTables 添加，此处跳过。
// ============================================================================

import type Database from 'better-sqlite3';
import { logger } from '../logger.js';

export const version = '0003';
export const description = 'ALTER TABLE 添加列（WMS 各表新增字段）';

interface ColumnSpec {
  table: string;
  column: string;
  definition: string;
}

const COLUMNS_TO_ADD: ColumnSpec[] = [
  // v1.0.76
  { table: 'inventory_items', column: 'autoCreated', definition: 'INTEGER NOT NULL DEFAULT 0' },
  // v1.0.76
  { table: 'inbound_records', column: 'supplier', definition: "TEXT NOT NULL DEFAULT ''" },
  { table: 'inbound_records', column: 'batchNo', definition: "TEXT NOT NULL DEFAULT ''" },
  { table: 'outbound_records', column: 'customer', definition: "TEXT NOT NULL DEFAULT ''" },
  { table: 'outbound_records', column: 'orderNo', definition: "TEXT NOT NULL DEFAULT ''" },
  // v1.6.0
  { table: 'inventory_items', column: 'minStock', definition: 'INTEGER NOT NULL DEFAULT 0' },
  // v1.4.0: partner FK
  { table: 'inbound_records', column: 'supplier_id', definition: 'TEXT DEFAULT NULL' },
  { table: 'outbound_records', column: 'customer_id', definition: 'TEXT DEFAULT NULL' },
];

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const row = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('${table}') WHERE name='${column}'`).get() as { cnt: number };
  return row.cnt > 0;
}

export async function up(db: Database.Database): Promise<void> {
  let added = 0;
  for (const { table, column, definition } of COLUMNS_TO_ADD) {
    if (columnExists(db, table, column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    added++;
    logger.info(`[Migration 0003] ✅ 添加列 ${table}.${column}`);
  }

  // v1.4.0: partner FK 列索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inbound_supplier_id ON inbound_records(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_outbound_customer_id ON outbound_records(customer_id);
  `);

  if (added === 0) {
    logger.info('[Migration 0003] 所有列已存在，跳过');
  }
}

export async function down(db: Database.Database): Promise<void> {
  // SQLite 不支持 DROP COLUMN（旧版本），回滚需重建表，此处不实现
  void db;
}
