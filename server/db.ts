import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = path.join(os.homedir(), '.cdf-know-clow', 'chat.db');

// ===================== Chat Session Types =====================

export interface Session {
  id: string;
  title: string;
  model: string;
  agentId?: string;
  folderId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: string;
  toolCalls?: string;
  skillId?: string | null; // 关联的技能 ID
  thinking?: string | null;
  thinkingDuration?: number | null;
  attachments?: string | null; // JSON 序列化的附件数组
}

// ===================== Business Data Types =====================

export interface WarehouseRow {
  id: string;
  name: string;
  country: string;
  city: string;
  totalVolume: number;
  usedVolume: number;
  totalItems: number;
  usedItems: number;
  status: string;
  address: string;
  manager: string;
  phone: string;
  createdAt: string;
}

export interface InventoryItemRow {
  id: string;
  sku: string;
  name: string;
  warehouseId: string;
  quantity: number;
  volumePerUnit: number;
  totalVolume: number;
  inboundDate: string;
  valuePerUnit: number;
  totalValue: number;
  category: string;
  isAgeWarning: number; // 0 or 1 in SQLite
  autoCreated: number; // 0 or 1 in SQLite — 1 if auto-created during inbound
}

export interface TransitOrderRow {
  id: string;
  trackingNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  category: string;
  weight: number;
  volume: number;
  transportMode: string;
  estimatedArrival: string;
  actualArrival: string | null;
  status: string;
  createdAt: string;
  carrier: string;
  value: number;
}

export interface StatusHistoryRow {
  id: string;
  transitOrderId: string;
  status: string;
  time: string;
  location: string;
  remark: string;
}

export interface InventoryTransactionRow {
  id: number;
  sku: string;
  type: string; // 'inbound' | 'outbound' | 'adjustment'
  quantity: number;
  warehouseId: string;
  operator: string;
  sourceId: string;
  sourceType: string; // 'inbound_record' | 'outbound_record' | 'manual_adjustment'
  remark: string;
  createdAt: string;
}

export interface InboundRecordRow {
  id: string;
  warehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  volume: number;
  createdAt: string;
  operator: string;
  status: string;
  supplier: string;
  batchNo: string;
  supplier_id: string | null;  // v1.4.0: partner FK
}

export interface OutboundRecordRow {
  id: string;
  warehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  volume: number;
  createdAt: string;
  operator: string;
  destination: string;
  customer: string;
  orderNo: string;
  customer_id: string | null;  // v1.4.0: partner FK
}

// ===================== Transfer Order Types (v1.5.0) =====================

export interface TransferOrderRow {
  id: string;
  transferNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  volume: number;
  status: string; // 'draft' | 'submitted' | 'in_transit' | 'completed'
  transitOrderId: string | null;
  createdBy: string;
  submittedAt: string | null;
  submittedBy: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  remark: string;
  createdAt: string;
  updatedAt: string;
}

// ===================== Partner Types (v1.4.0) =====================

export interface PartnerRow {
  id: string;
  name: string;
  type: 'supplier' | 'customer';
  contact: string;
  phone: string;
  address: string;
  remark: string;
  created_at: string;
  updated_at: string;
}

export interface UserSkillRow {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: string;
  path: string;
  trigger: string | null;
  detail: string | null;
  tags: string | null; // JSON string
  status: string;
  version: string | null;
  featured: number; // 0 or 1
  shortcut: string | null;
  installedAt: number;
  promptTemplate: string | null;
  executionMode: string | null;
}

export interface BuiltinStatusPatchRow {
  skillId: string;
  status: string;
}

export interface AppSettingsRow {
  key: string;
  value: string; // JSON string
}

// ===================== Automation Types =====================

export interface AutomationRow {
  id: string;
  name: string;
  description: string;
  status: string;
  schedule_type: string;
  rrule: string;
  scheduled_at: string | null;
  schedule_label: string;
  prompt: string;
  task_type: string;
  task_config: string; // JSON string
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  trigger_type: string;
  event_trigger: string | null; // JSON string
  webhook_config: string | null; // JSON string (encrypted secret)
  execution_policy: string | null; // JSON string
  notification_config: string | null; // JSON string
}

export interface AutomationRunRow {
  id: string;
  automation_id: string;
  task_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration: number | null;
  result: string | null;
  steps: string; // JSON string
  is_retry: number;
  trigger_source: string;
  trigger_detail: string | null; // JSON string
  retry_count: number;
}

let db: Database.Database | null = null;

export function initDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);

  // Enable foreign keys
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Existing chat tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      agentId TEXT,
      folderId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (folderId) REFERENCES folders(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      timestamp TEXT NOT NULL,
      toolCalls TEXT,
      skillId TEXT DEFAULT NULL,
      FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (parentId) REFERENCES folders(id) ON DELETE CASCADE
    );
  `);

  // New business data tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      totalVolume REAL NOT NULL DEFAULT 0,
      usedVolume REAL NOT NULL DEFAULT 0,
      totalItems INTEGER NOT NULL DEFAULT 0,
      usedItems INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'normal',
      address TEXT NOT NULL DEFAULT '',
      manager TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      warehouseId TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      volumePerUnit REAL NOT NULL DEFAULT 0,
      totalVolume REAL NOT NULL DEFAULT 0,
      inboundDate TEXT NOT NULL DEFAULT '',
      valuePerUnit REAL NOT NULL DEFAULT 0,
      totalValue REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT '',
      isAgeWarning INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transit_orders (
      id TEXT PRIMARY KEY,
      trackingNo TEXT NOT NULL DEFAULT '',
      fromWarehouseId TEXT NOT NULL DEFAULT '',
      toWarehouseId TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      weight REAL NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      transportMode TEXT NOT NULL DEFAULT 'sea',
      estimatedArrival TEXT NOT NULL DEFAULT '',
      actualArrival TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'dispatched',
      createdAt TEXT NOT NULL,
      carrier TEXT NOT NULL DEFAULT '',
      value REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transit_status_history (
      id TEXT PRIMARY KEY,
      transitOrderId TEXT NOT NULL,
      status TEXT NOT NULL,
      time TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (transitOrderId) REFERENCES transit_orders(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS inbound_records (
      id TEXT PRIMARY KEY,
      warehouseId TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS outbound_records (
      id TEXT PRIMARY KEY,
      warehouseId TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS user_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "desc" TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Extension',
      category TEXT NOT NULL DEFAULT 'tool',
      path TEXT NOT NULL DEFAULT '',
      trigger TEXT DEFAULT '',
      detail TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      version TEXT DEFAULT '',
      featured INTEGER NOT NULL DEFAULT 0,
      shortcut TEXT DEFAULT '',
      installedAt INTEGER NOT NULL DEFAULT 0,
      promptTemplate TEXT DEFAULT '',
      executionMode TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS builtin_status_patches (
      skillId TEXT PRIMARY KEY,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_warehouseId ON inventory_items(warehouseId);
    CREATE INDEX IF NOT EXISTS idx_transit_status ON transit_orders(status);
    CREATE INDEX IF NOT EXISTS idx_transit_from ON transit_orders(fromWarehouseId);
    CREATE INDEX IF NOT EXISTS idx_transit_to ON transit_orders(toWarehouseId);
    CREATE INDEX IF NOT EXISTS idx_inbound_warehouseId ON inbound_records(warehouseId);
    CREATE INDEX IF NOT EXISTS idx_outbound_warehouseId ON outbound_records(warehouseId);
    CREATE INDEX IF NOT EXISTS idx_status_history_orderId ON transit_status_history(transitOrderId);
  `);

  // inventory_transactions table (v1.0.76)
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_transactions (
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
    CREATE INDEX IF NOT EXISTS idx_inv_trans_sku ON inventory_transactions(sku);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions(type);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_warehouse ON inventory_transactions(warehouseId);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_created ON inventory_transactions(createdAt);
  `);

  // Add autoCreated column to inventory_items (v1.0.76)
  const extraColumns: Array<{ table: string; column: string; definition: string }> = [
    { table: 'inventory_items', column: 'autoCreated', definition: "INTEGER NOT NULL DEFAULT 0" },
  ];
  for (const { table, column, definition } of extraColumns) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('${table}') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // Add skillId column to messages table (v1.0.94) — 幂等迁移
  const messagesSkillIdExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('messages') WHERE name='skillId'`).get() as { cnt: number };
  if (messagesSkillIdExists.cnt === 0) {
    db.exec(`ALTER TABLE messages ADD COLUMN skillId TEXT DEFAULT NULL`);
  }

  // Add thinking columns to messages table — 幂等迁移
  const thinkingColumns: Array<{ column: string; definition: string }> = [
    { column: 'thinking', definition: 'TEXT' },
    { column: 'thinkingDuration', definition: 'INTEGER' },
    { column: 'attachments', definition: 'TEXT' },
  ];
  for (const { column, definition } of thinkingColumns) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('messages') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE messages ADD COLUMN ${column} ${definition}`);
    }
  }

  // Add new columns to existing tables (v1.0.76) — safe ALTER with column-existence check
  const columnsToAdd: Array<{ table: string; column: string; definition: string }> = [
    { table: 'inbound_records', column: 'supplier', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'inbound_records', column: 'batchNo', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'outbound_records', column: 'customer', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'outbound_records', column: 'orderNo', definition: "TEXT NOT NULL DEFAULT ''" },
    // v1.0.86: user_skills 新增 promptTemplate + executionMode
    { table: 'user_skills', column: 'promptTemplate', definition: "TEXT DEFAULT ''" },
    { table: 'user_skills', column: 'executionMode', definition: "TEXT DEFAULT ''" },
  ];
  for (const { table, column, definition } of columnsToAdd) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('${table}') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // ===================== v1.5.0: Transfer Orders =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS transfer_orders (
      id TEXT PRIMARY KEY,
      transferNo TEXT NOT NULL DEFAULT '',
      fromWarehouseId TEXT NOT NULL,
      toWarehouseId TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      transitOrderId TEXT DEFAULT NULL,
      createdBy TEXT NOT NULL DEFAULT '',
      submittedAt TEXT DEFAULT NULL,
      submittedBy TEXT DEFAULT NULL,
      receivedAt TEXT DEFAULT NULL,
      receivedBy TEXT DEFAULT NULL,
      completedAt TEXT DEFAULT NULL,
      completedBy TEXT DEFAULT NULL,
      remark TEXT DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (fromWarehouseId) REFERENCES warehouses(id),
      FOREIGN KEY (toWarehouseId) REFERENCES warehouses(id),
      FOREIGN KEY (transitOrderId) REFERENCES transit_orders(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transfer_status ON transfer_orders(status);
    CREATE INDEX IF NOT EXISTS idx_transfer_from ON transfer_orders(fromWarehouseId);
    CREATE INDEX IF NOT EXISTS idx_transfer_to ON transfer_orders(toWarehouseId);
    CREATE INDEX IF NOT EXISTS idx_transfer_sku ON transfer_orders(sku);
    CREATE INDEX IF NOT EXISTS idx_transfer_transit ON transfer_orders(transitOrderId);
  `);

  // v1.5.0: Expand inventory_transactions CHECK constraint to include transfer_out / transfer_in
  // SQLite does not support ALTER CONSTRAINT, so we rebuild the table.
  const v150CheckMigrationKey = 'migration_v1.5.0_inv_txn_check';
  const v150CheckMigrationExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(v150CheckMigrationKey) as { value: string } | undefined;
  if (!v150CheckMigrationExists) {
    console.log('[Migrate v1.5.0] 扩展 inventory_transactions CHECK 约束...');
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
    // Recreate indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inv_trans_sku ON inventory_transactions(sku);
      CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions(type);
      CREATE INDEX IF NOT EXISTS idx_inv_trans_warehouse ON inventory_transactions(warehouseId);
      CREATE INDEX IF NOT EXISTS idx_inv_trans_created ON inventory_transactions(createdAt);
    `);
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(v150CheckMigrationKey, JSON.stringify({ migratedAt: new Date().toISOString() }));
    console.log('[Migrate v1.5.0] ✅ CHECK 约束扩展完成');
  }

  // ===================== v1.6.0: Replenishment Suggestions =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS replenishment_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      current_stock INTEGER NOT NULL DEFAULT 0,
      in_transit_qty INTEGER NOT NULL DEFAULT 0,
      safety_stock INTEGER NOT NULL DEFAULT 0,
      daily_consumption REAL NOT NULL DEFAULT 0,
      target_stock INTEGER NOT NULL DEFAULT 0,
      suggested_qty INTEGER NOT NULL DEFAULT 0,
      source_warehouse_id TEXT,
      priority TEXT NOT NULL DEFAULT 'low' CHECK(priority IN ('critical', 'high', 'medium', 'low')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'ignored', 'deferred')),
      transfer_order_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (transfer_order_id) REFERENCES transfer_orders(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_replenishment_sku ON replenishment_suggestions(sku);
    CREATE INDEX IF NOT EXISTS idx_replenishment_warehouse ON replenishment_suggestions(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_replenishment_status ON replenishment_suggestions(status);
    CREATE INDEX IF NOT EXISTS idx_replenishment_priority ON replenishment_suggestions(priority);
  `);

  // v1.6.0: Add minStock column to inventory_items (idempotent)
  const minStockExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('inventory_items') WHERE name='minStock'`).get() as { cnt: number };
  if (minStockExists.cnt === 0) {
    db.exec(`ALTER TABLE inventory_items ADD COLUMN minStock INTEGER NOT NULL DEFAULT 0`);
    console.log('[Migrate v1.6.0] ✅ 添加 minStock 列到 inventory_items');
  }

  // ===================== v1.4.0: Partners Table =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'supplier' CHECK(type IN ('supplier', 'customer')),
      contact TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_name_type ON partners(name, type);
    CREATE INDEX IF NOT EXISTS idx_partners_type ON partners(type);
  `);

  // v1.4.0: Add supplier_id / customer_id columns (idempotent)
  const v140Columns: Array<{ table: string; column: string; definition: string }> = [
    { table: 'inbound_records', column: 'supplier_id', definition: 'TEXT DEFAULT NULL' },
    { table: 'outbound_records', column: 'customer_id', definition: 'TEXT DEFAULT NULL' },
  ];
  for (const { table, column, definition } of v140Columns) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('${table}') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // v1.4.0: Create indexes for partner FK columns
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inbound_supplier_id ON inbound_records(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_outbound_customer_id ON outbound_records(customer_id);
  `);

  // ===================== v1.4.0: Data Migration =====================

  const migrationKey = 'migration_v1.4.0_partners';
  const migrationExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(migrationKey) as { value: string } | undefined;

  if (!migrationExists) {
    console.log('[Migrate v1.4.0] 开始客商数据迁移...');

    // --- Normalization helper ---
    const normalize = (s: string): string => {
      let t = s.trim();
      // Full-width parentheses → half-width
      t = t.replace(/\uff08/g, '(').replace(/\uff09/g, ')');
      // Normalize spaces: collapse multiple spaces to single
      t = t.replace(/\s+/g, ' ');
      return t;
    };

    // ---- Phase A: Collect & deduplicate ----

    // Suppliers from inbound_records
    const supplierRows = db.prepare(
      "SELECT DISTINCT TRIM(supplier) as name FROM inbound_records WHERE supplier IS NOT NULL AND supplier != ''"
    ).all() as Array<{ name: string }>;

    // Customers from outbound_records
    const customerRows = db.prepare(
      "SELECT DISTINCT TRIM(customer) as name FROM outbound_records WHERE customer IS NOT NULL AND customer != ''"
    ).all() as Array<{ name: string }>;

    // Group by normalized name, pick most frequent original
    const groupByName = (rows: Array<{ name: string }>): Map<string, string> => {
      const map = new Map<string, { original: string; count: number }>();
      for (const row of rows) {
        const key = normalize(row.name).toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.count++;
          // Prefer shorter name as canonical
          if (row.name.length < existing.original.length) {
            existing.original = row.name;
          }
        } else {
          map.set(key, { original: row.name, count: 1 });
        }
      }
      const result = new Map<string, string>();
      for (const [key, val] of map) {
        result.set(key, val.original);
      }
      return result;
    };

    const supplierMap = groupByName(supplierRows);
    const customerMap = groupByName(customerRows);

    console.log(`[Migrate v1.4.0] 扫描: 入库供应商 ${supplierRows.length} 条, 出库客户 ${customerRows.length} 条`);
    console.log(`[Migrate v1.4.0] 去重: 唯一供应商 ${supplierMap.size} 个, 唯一客户 ${customerMap.size} 个`);

    // ---- Phase B: Create partners & backfill ----

    const now = new Date().toISOString();
    const insertPartner = db.prepare(
      `INSERT INTO partners (id, name, type, contact, phone, address, remark, created_at, updated_at)
       VALUES (?, ?, ?, '', '', '', '', ?, ?)
       ON CONFLICT(name, type) DO NOTHING`
    );

    let supplierCreated = 0;
    let customerCreated = 0;

    for (const [normalizedKey, originalName] of supplierMap) {
      const id = uuidv4();
      const info = insertPartner.run(id, originalName, 'supplier', now, now);
      if (info.changes > 0) supplierCreated++;
    }

    for (const [normalizedKey, originalName] of customerMap) {
      const id = uuidv4();
      const info = insertPartner.run(id, originalName, 'customer', now, now);
      if (info.changes > 0) customerCreated++;
    }

    console.log(`[Migrate v1.4.0] 创建: 供应商 ${supplierCreated} 个, 客户 ${customerCreated} 个`);

    // Backfill supplier_id in inbound_records
    const backfillSupplier = db.prepare(
      `UPDATE inbound_records SET supplier_id = (
         SELECT p.id FROM partners p
         WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(inbound_records.supplier))
           AND p.type = 'supplier'
         LIMIT 1
       )
       WHERE supplier IS NOT NULL AND supplier != '' AND supplier_id IS NULL`
    );
    const supplierBackfillResult = backfillSupplier.run();
    console.log(`[Migrate v1.4.0] 回填入库供应商外键: ${supplierBackfillResult.changes} 条`);

    // Backfill customer_id in outbound_records
    const backfillCustomer = db.prepare(
      `UPDATE outbound_records SET customer_id = (
         SELECT p.id FROM partners p
         WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(outbound_records.customer))
           AND p.type = 'customer'
         LIMIT 1
       )
       WHERE customer IS NOT NULL AND customer != '' AND customer_id IS NULL`
    );
    const customerBackfillResult = backfillCustomer.run();
    console.log(`[Migrate v1.4.0] 回填出库客户外键: ${customerBackfillResult.changes} 条`);

    // ---- Phase C: Write migration marker ----
    const stats = {
      scanned: supplierRows.length + customerRows.length,
      deduped: supplierMap.size + customerMap.size,
      created: supplierCreated + customerCreated,
      linked_inbound: supplierBackfillResult.changes,
      linked_outbound: customerBackfillResult.changes,
    };
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
      migrationKey,
      JSON.stringify(stats)
    );
    console.log('[Migrate v1.4.0] ✅ 迁移完成:', JSON.stringify(stats));
  } else {
    console.log('[Migrate v1.4.0] 迁移已执行，跳过');
  }

  // Skill chain tables (v1.1.0)
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_chains (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      fail_strategy TEXT NOT NULL DEFAULT 'stop',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS skill_chain_nodes (
      id TEXT PRIMARY KEY,
      chain_id TEXT NOT NULL REFERENCES skill_chains(id) ON DELETE CASCADE,
      skill_id TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      skill_icon TEXT DEFAULT 'Extension',
      data_pass_mode TEXT NOT NULL DEFAULT 'full',
      selected_fields TEXT DEFAULT '[]',
      custom_mapping TEXT DEFAULT '{}',
      timeout INTEGER NOT NULL DEFAULT 30000,
      retry_count INTEGER NOT NULL DEFAULT 0,
      node_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(chain_id, node_order)
    );
    CREATE TABLE IF NOT EXISTS skill_chain_executions (
      id TEXT PRIMARY KEY,
      chain_id TEXT NOT NULL REFERENCES skill_chains(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'running',
      fail_strategy TEXT NOT NULL DEFAULT 'stop',
      steps TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      duration INTEGER
    );
    CREATE TABLE IF NOT EXISTS skill_audits (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      skill_version TEXT NOT NULL,
      score INTEGER NOT NULL,
      level TEXT NOT NULL,
      report_json TEXT NOT NULL DEFAULT '{}',
      report_markdown TEXT NOT NULL DEFAULT '',
      triggered_by TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, skill_version)
    );
  `);

  // Add description column to skill_chains if missing (idempotent migration)
  const chainDescExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('skill_chains') WHERE name='description'`).get() as { cnt: number };
  if (chainDescExists.cnt === 0) {
    db.exec(`ALTER TABLE skill_chains ADD COLUMN description TEXT DEFAULT ''`);
  }

  // v1.0.99: Add node_results and result columns to skill_chain_executions
  const execColumnsToAdd: Array<{ table: string; column: string; definition: string }> = [
    { table: 'skill_chain_executions', column: 'node_results', definition: "TEXT NOT NULL DEFAULT '[]'" },
    { table: 'skill_chain_executions', column: 'result', definition: "TEXT NOT NULL DEFAULT '{}'" },
  ];
  for (const { table, column, definition } of execColumnsToAdd) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('${table}') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // v2.0: Automation engine tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      schedule_type TEXT NOT NULL DEFAULT 'recurring',
      rrule TEXT DEFAULT '',
      scheduled_at TEXT DEFAULT NULL,
      schedule_label TEXT DEFAULT '',
      prompt TEXT DEFAULT '',
      task_type TEXT NOT NULL DEFAULT 'custom',
      task_config TEXT DEFAULT '{}',
      valid_from TEXT DEFAULT NULL,
      valid_until TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_run_at TEXT DEFAULT NULL,
      next_run_at TEXT DEFAULT NULL,
      run_count INTEGER NOT NULL DEFAULT 0,
      trigger_type TEXT NOT NULL DEFAULT 'schedule',
      event_trigger TEXT DEFAULT NULL,
      webhook_config TEXT DEFAULT NULL,
      execution_policy TEXT DEFAULT NULL,
      notification_config TEXT DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      completed_at TEXT DEFAULT NULL,
      duration INTEGER DEFAULT NULL,
      result TEXT DEFAULT NULL,
      steps TEXT DEFAULT '[]',
      is_retry INTEGER NOT NULL DEFAULT 0,
      trigger_source TEXT NOT NULL DEFAULT 'manual',
      trigger_detail TEXT DEFAULT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (automation_id) REFERENCES automations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_automations_status ON automations(status);
    CREATE INDEX IF NOT EXISTS idx_automations_trigger_type ON automations(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_id ON automation_runs(automation_id);
    CREATE INDEX IF NOT EXISTS idx_automation_runs_started_at ON automation_runs(started_at);
  `);

  // v2.1: Marketplace & Embedding tables (migration 004)
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "desc" TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Extension',
      category TEXT NOT NULL DEFAULT 'tool',
      sub_category TEXT DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '1.0.0',
      rating REAL NOT NULL DEFAULT 0,
      download_count INTEGER NOT NULL DEFAULT 0,
      tags TEXT DEFAULT '[]',
      prompt_template TEXT DEFAULT '',
      execution_mode TEXT DEFAULT 'chat',
      permissions TEXT DEFAULT '[]',
      dependencies TEXT DEFAULT '[]',
      detail TEXT DEFAULT '',
      trigger TEXT DEFAULT '',
      icon_url TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      cached_at TEXT NOT NULL DEFAULT (datetime('now')),
      cache_expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS installed_skill_versions (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      remote_id TEXT DEFAULT '',
      installed_version TEXT NOT NULL DEFAULT '',
      latest_version TEXT NOT NULL DEFAULT '',
      auto_update INTEGER NOT NULL DEFAULT 0,
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, remote_id)
    );
    CREATE TABLE IF NOT EXISTS skill_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT NOT NULL,
      content_hash TEXT NOT NULL DEFAULT '',
      embedding BLOB NOT NULL,
      model_name TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
      dimensions INTEGER NOT NULL DEFAULT 384,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, model_name)
    );
    CREATE TABLE IF NOT EXISTS match_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      match_mode TEXT NOT NULL DEFAULT 'hybrid',
      match_score REAL NOT NULL DEFAULT 0,
      is_relevant INTEGER NOT NULL DEFAULT 0,
      user_feedback INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS match_engine_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS skill_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT NOT NULL,
      remote_id TEXT DEFAULT '',
      rating INTEGER NOT NULL DEFAULT 0,
      review_text TEXT DEFAULT '',
      reviewer TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_category ON marketplace_skills(category);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_author ON marketplace_skills(author);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_rating ON marketplace_skills(rating);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_downloads ON marketplace_skills(download_count);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_cache_expires ON marketplace_skills(cache_expires_at);
    CREATE INDEX IF NOT EXISTS idx_installed_skill_versions_skill_id ON installed_skill_versions(skill_id);
    CREATE INDEX IF NOT EXISTS idx_installed_skill_versions_remote_id ON installed_skill_versions(remote_id);
    CREATE INDEX IF NOT EXISTS idx_skill_embeddings_skill_id ON skill_embeddings(skill_id);
    CREATE INDEX IF NOT EXISTS idx_skill_embeddings_model ON skill_embeddings(model_name);
    CREATE INDEX IF NOT EXISTS idx_match_feedback_skill_id ON match_feedback(skill_id);
    CREATE INDEX IF NOT EXISTS idx_match_feedback_mode ON match_feedback(match_mode);
    CREATE INDEX IF NOT EXISTS idx_match_feedback_created ON match_feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_skill_reviews_skill_id ON skill_reviews(skill_id);
    CREATE INDEX IF NOT EXISTS idx_skill_reviews_remote_id ON skill_reviews(remote_id);
  `);

  // Projects and Tasks tables (v2.1)
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','archived','completed')),
      category TEXT DEFAULT 'custom' CHECK(category IN ('custom','template','fixed')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
      assignee TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      due_date TEXT DEFAULT '',
      project_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
  `);

  // Initialize default match engine config if empty
  const configCount = db.prepare('SELECT COUNT(*) as cnt FROM match_engine_config').get() as { cnt: number };
  if (configCount.cnt === 0) {
    const now = new Date().toISOString();
    const defaults: Array<{ key: string; value: string }> = [
      { key: 'semantic_weight', value: '0.6' },
      { key: 'keyword_weight', value: '0.4' },
      { key: 'default_threshold', value: '0.3' },
      { key: 'default_top_k', value: '10' },
      { key: 'cache_ttl_ms', value: '300000' },
      { key: 'enable_feedback_learning', value: '1' },
      { key: 'context_window_size', value: '5' },
    ];
    const insertConfig = db.prepare(
      'INSERT OR IGNORE INTO match_engine_config (key, value, updated_at) VALUES (?, ?, ?)'
    );
    for (const { key, value } of defaults) {
      insertConfig.run(key, value, now);
    }
  }

  // v1.9.3: Add folderId column to sessions if missing (idempotent migration)
  try {
    const folderIdColExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('sessions') WHERE name='folderId'`).get() as { cnt: number };
    if (folderIdColExists.cnt === 0) {
      db.exec(`ALTER TABLE sessions ADD COLUMN folderId TEXT`);
      console.log('[Migrate v1.9.3] 添加 folderId 列到 sessions 表');
    }
  } catch (e) {
    console.warn('[Migrate v1.9.3] 添加 folderId 列失败（可能表不存在）:', e);
  }

  // v1.9.3: Add agentId column to sessions if missing (idempotent migration)
  try {
    const agentIdColExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('sessions') WHERE name='agentId'`).get() as { cnt: number };
    if (agentIdColExists.cnt === 0) {
      db.exec(`ALTER TABLE sessions ADD COLUMN agentId TEXT`);
      console.log('[Migrate v1.9.3] 添加 agentId 列到 sessions 表');
    }
  } catch (e) {
    console.warn('[Migrate v1.9.3] 添加 agentId 列失败（可能表不存在）:', e);
  }

  return db;
}

// ===================== Project & Task Types =====================

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  status: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  tags: string;
  due_date: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

// ===================== Skill Chain Types =====================

export interface SkillChainNodeRow {
  id: string;
  chain_id: string;
  skill_id: string;
  skill_name: string;
  skill_icon: string;
  data_pass_mode: string;
  selected_fields: string;
  custom_mapping: string;
  timeout: number;
  retry_count: number;
  node_order: number;
}

export interface SkillChainRow {
  id: string;
  name: string;
  description: string;
  fail_strategy: string;
  created_at: string;
  updated_at: string;
}

export interface SkillChainExecutionRow {
  id: string;
  chain_id: string;
  status: string;
  fail_strategy: string;
  steps: string;
  node_results: string;
  result: string;
  started_at: string;
  completed_at: string | null;
  duration: number | null;
}

export interface SkillAuditRow {
  [key: string]: unknown;
  id: string;
  skill_id: string;
  skill_version: string;
  score: number;
  level: string;
  report_json: string;
  report_markdown: string;
  triggered_by: string;
  created_at: string;
}
