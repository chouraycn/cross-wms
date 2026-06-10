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
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
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

  return db;
}

// ===================== Chat Session DAO (existing) =====================

export function getSessions(): Session[] {
  const db = initDb();
  return db.prepare('SELECT * FROM sessions ORDER BY updatedAt DESC').all() as Session[];
}

/** 搜索会话（按标题模糊匹配） */
export function searchSessions(query: string): Session[] {
  const db = initDb();
  const q = `%${query}%`;
  return db.prepare('SELECT * FROM sessions WHERE title LIKE ? ORDER BY updatedAt DESC').all(q) as Session[];
}

export function createSession(id: string, title: string, model: string, agentId?: string): Session {
  const now = new Date().toISOString();
  const db = initDb();
  db.prepare('INSERT INTO sessions (id, title, model, agentId, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(
    id, title, model, agentId || null, now, now
  );
  return { id, title, model, agentId, createdAt: now, updatedAt: now };
}

export function getSessionMessages(sessionId: string): Message[] {
  const db = initDb();
  return db.prepare('SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp ASC').all(sessionId) as Message[];
}

export function addMessage(msg: Omit<Message, 'id' | 'timestamp'> & { id?: string }): Message {
  const id = msg.id || uuidv4();
  const now = new Date().toISOString();
  const db = initDb();
  db.prepare('INSERT INTO messages (id, sessionId, role, content, model, timestamp, toolCalls, skillId) VALUES (?,?,?,?,?,?,?,?)').run(
    id, msg.sessionId, msg.role, msg.content, msg.model || null, now, msg.toolCalls || null, msg.skillId || null
  );
  db.prepare('UPDATE sessions SET updatedAt = ? WHERE id = ?').run(now, msg.sessionId);
  return { ...msg, id, timestamp: now };
}

export function deleteSession(id: string): void {
  const db = initDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

// ===================== Warehouse DAO =====================

export function getWarehouses(): WarehouseRow[] {
  const db = initDb();
  return db.prepare('SELECT * FROM warehouses ORDER BY createdAt DESC').all() as WarehouseRow[];
}

export function getWarehouseById(id: string): WarehouseRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id) as WarehouseRow | undefined;
}

export function createWarehouse(data: Omit<WarehouseRow, 'id'> & { id?: string }): WarehouseRow {
  const id = data.id || uuidv4();
  const db = initDb();
  db.prepare(`INSERT INTO warehouses (id, name, country, city, totalVolume, usedVolume, totalItems, usedItems, status, address, manager, phone, createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,
    data.name ?? '',
    data.country ?? '',
    data.city ?? '',
    data.totalVolume ?? 0,
    data.usedVolume ?? 0,
    data.totalItems ?? 1,
    data.usedItems ?? 0,
    data.status ?? 'normal',
    data.address ?? '',
    data.manager ?? '',
    data.phone ?? '',
    data.createdAt ?? new Date().toISOString().split('T')[0]
  );
  return {
    ...data,
    id,
    country: data.country ?? '',
    city: data.city ?? '',
    address: data.address ?? '',
    manager: data.manager ?? '',
    phone: data.phone ?? '',
    status: data.status ?? 'normal',
  };
}

export function updateWarehouse(id: string, data: Partial<Omit<WarehouseRow, 'id'>>): WarehouseRow | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id) as WarehouseRow | undefined;
  if (!existing) return null;
  // Defensive: coerce null/undefined to safe defaults before merging
  const safeData = { ...data };
  for (const key of ['country', 'city', 'address', 'manager', 'phone'] as const) {
    if (safeData[key] == null) safeData[key] = '' as any;
  }
  if (safeData.status == null) safeData.status = 'normal';
  const updated = { ...existing, ...safeData, id };
  db.prepare(`UPDATE warehouses SET name=?, country=?, city=?, totalVolume=?, usedVolume=?, totalItems=?, usedItems=?, status=?, address=?, manager=?, phone=?, createdAt=? WHERE id=?`).run(
    updated.name ?? '', updated.country ?? '', updated.city ?? '', updated.totalVolume ?? 0, updated.usedVolume ?? 0,
    updated.totalItems ?? 1, updated.usedItems ?? 0, updated.status ?? 'normal', updated.address ?? '', updated.manager ?? '', updated.phone ?? '', updated.createdAt, id
  );
  return updated;
}

export function deleteWarehouse(id: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM warehouses WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===================== Inventory DAO =====================

/** Convert DB row (isAgeWarning: 0|1) to frontend type (isAgeWarning: boolean) */
function inventoryRowToBoolean(row: InventoryItemRow): Record<string, unknown> {
  return { ...row, isAgeWarning: row.isAgeWarning === 1 };
}

/** Convert frontend type (isAgeWarning: boolean) to DB row (isAgeWarning: 0|1) */
function inventoryBooleanToRow(data: Record<string, unknown>): number {
  return data.isAgeWarning === true ? 1 : 0;
}

export function getInventoryItems(warehouseId?: string): Record<string, unknown>[] {
  const db = initDb();
  let rows: InventoryItemRow[];
  if (warehouseId) {
    rows = db.prepare('SELECT * FROM inventory_items WHERE warehouseId = ? ORDER BY inboundDate DESC').all(warehouseId) as InventoryItemRow[];
  } else {
    rows = db.prepare('SELECT * FROM inventory_items ORDER BY inboundDate DESC').all() as InventoryItemRow[];
  }
  return rows.map(inventoryRowToBoolean);
}

export function getInventoryItemById(id: string): Record<string, unknown> | undefined {
  const db = initDb();
  const row = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as InventoryItemRow | undefined;
  return row ? inventoryRowToBoolean(row) : undefined;
}

export function createInventoryItem(data: Record<string, unknown>): Record<string, unknown> {
  const id = (data.id as string) || uuidv4();
  const db = initDb();
  const isAgeWarning = inventoryBooleanToRow(data);
  db.prepare(`INSERT INTO inventory_items (id, sku, name, warehouseId, quantity, volumePerUnit, totalVolume, inboundDate, valuePerUnit, totalValue, category, isAgeWarning)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, data.sku ?? '', data.name ?? '', data.warehouseId ?? '', data.quantity ?? 0,
    data.volumePerUnit ?? 0, data.totalVolume ?? 0, data.inboundDate ?? '',
    data.valuePerUnit ?? 0, data.totalValue ?? 0, data.category ?? '', isAgeWarning
  );
  // Read back from DB to ensure correct type conversion
  const saved = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as InventoryItemRow | undefined;
  return saved ? inventoryRowToBoolean(saved) : inventoryRowToBoolean({ ...data, id, isAgeWarning } as unknown as InventoryItemRow);
}

export function updateInventoryItem(id: string, data: Record<string, unknown>): Record<string, unknown> | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as InventoryItemRow | undefined;
  if (!existing) return null;
  const merged: Record<string, unknown> = { ...inventoryRowToBoolean(existing), ...data, id };
  const isAgeWarning = inventoryBooleanToRow(merged);
  db.prepare(`UPDATE inventory_items SET sku=?, name=?, warehouseId=?, quantity=?, volumePerUnit=?, totalVolume=?, inboundDate=?, valuePerUnit=?, totalValue=?, category=?, isAgeWarning=? WHERE id=?`).run(
    (merged.sku as string) ?? '', (merged.name as string) ?? '', (merged.warehouseId as string) ?? '', (merged.quantity as number) ?? 0,
    (merged.volumePerUnit as number) ?? 0, (merged.totalVolume as number) ?? 0, (merged.inboundDate as string) ?? '',
    (merged.valuePerUnit as number) ?? 0, (merged.totalValue as number) ?? 0, (merged.category as string) ?? '', isAgeWarning, id
  );
  return { ...merged, isAgeWarning: isAgeWarning === 1 };
}

export function deleteInventoryItem(id: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===================== Transit Order DAO =====================

/** Fetch status history for a given transit order */
export function getStatusHistory(orderId: string): StatusHistoryRow[] {
  const db = initDb();
  return db.prepare('SELECT * FROM transit_status_history WHERE transitOrderId = ? ORDER BY time ASC').all(orderId) as StatusHistoryRow[];
}

/** Fetch all transit orders, with their statusHistory aggregated as a nested array */
export function getTransitOrders(status?: string): Record<string, unknown>[] {
  const db = initDb();
  let orders: TransitOrderRow[];
  if (status) {
    orders = db.prepare('SELECT * FROM transit_orders WHERE status = ? ORDER BY createdAt DESC').all(status) as TransitOrderRow[];
  } else {
    orders = db.prepare('SELECT * FROM transit_orders ORDER BY createdAt DESC').all() as TransitOrderRow[];
  }
  // Batch-fetch all status history for these orders
  const historyStmt = db.prepare('SELECT * FROM transit_status_history WHERE transitOrderId = ? ORDER BY time ASC');
  return orders.map(order => {
    const history = historyStmt.all(order.id) as StatusHistoryRow[];
    return {
      ...order,
      statusHistory: history.map(h => ({
        status: h.status,
        time: h.time,
        location: h.location,
        remark: h.remark,
      })),
    };
  });
}

export function getTransitOrderById(id: string): Record<string, unknown> | undefined {
  const db = initDb();
  const order = db.prepare('SELECT * FROM transit_orders WHERE id = ?').get(id) as TransitOrderRow | undefined;
  if (!order) return undefined;
  const history = getStatusHistory(id);
  return {
    ...order,
    statusHistory: history.map(h => ({
      status: h.status,
      time: h.time,
      location: h.location,
      remark: h.remark,
    })),
  };
}

export function createTransitOrder(data: Record<string, unknown>): Record<string, unknown> {
  const id = (data.id as string) || uuidv4();
  const db = initDb();
  db.prepare(`INSERT INTO transit_orders (id, trackingNo, fromWarehouseId, toWarehouseId, category, weight, volume, transportMode, estimatedArrival, actualArrival, status, createdAt, carrier, value)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, data.trackingNo ?? '', data.fromWarehouseId ?? '', data.toWarehouseId ?? '',
    data.category ?? '', data.weight ?? 0, data.volume ?? 0, data.transportMode ?? 'sea',
    data.estimatedArrival ?? '', data.actualArrival ?? null, data.status ?? 'dispatched',
    data.createdAt ?? new Date().toISOString(), data.carrier ?? '', data.value ?? 0
  );
  // Insert status history items if provided
  const statusHistory = data.statusHistory as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(statusHistory) && statusHistory.length > 0) {
    const insertHistory = db.prepare(`INSERT INTO transit_status_history (id, transitOrderId, status, time, location, remark) VALUES (?,?,?,?,?,?)`);
    for (const h of statusHistory) {
      insertHistory.run(uuidv4(), id, h.status ?? '', h.time ?? '', h.location ?? '', h.remark ?? '');
    }
  }
  return getTransitOrderById(id)!;
}

export function updateTransitOrder(id: string, data: Record<string, unknown>): Record<string, unknown> | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM transit_orders WHERE id = ?').get(id) as TransitOrderRow | undefined;
  if (!existing) return null;
  const merged = { ...existing, ...data, id };
  db.prepare(`UPDATE transit_orders SET trackingNo=?, fromWarehouseId=?, toWarehouseId=?, category=?, weight=?, volume=?, transportMode=?, estimatedArrival=?, actualArrival=?, status=?, createdAt=?, carrier=?, value=? WHERE id=?`).run(
    merged.trackingNo, merged.fromWarehouseId, merged.toWarehouseId, merged.category,
    merged.weight, merged.volume, merged.transportMode, merged.estimatedArrival,
    merged.actualArrival, merged.status, merged.createdAt, merged.carrier, merged.value, id
  );
  // If statusHistory is provided in update data, replace all history
  const statusHistory = data.statusHistory as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(statusHistory)) {
    db.prepare('DELETE FROM transit_status_history WHERE transitOrderId = ?').run(id);
    const insertHistory = db.prepare(`INSERT INTO transit_status_history (id, transitOrderId, status, time, location, remark) VALUES (?,?,?,?,?,?)`);
    for (const h of statusHistory) {
      insertHistory.run(uuidv4(), id, h.status ?? '', h.time ?? '', h.location ?? '', h.remark ?? '');
    }
  }
  return getTransitOrderById(id)!;
}

export function deleteTransitOrder(id: string): boolean {
  const db = initDb();
  // CASCADE will delete status_history rows automatically
  const result = db.prepare('DELETE FROM transit_orders WHERE id = ?').run(id);
  return result.changes > 0;
}

/** Add a single status history entry to a transit order */
export function addStatusHistory(orderId: string, data: { status: string; time: string; location?: string; remark?: string }): StatusHistoryRow {
  const id = uuidv4();
  const db = initDb();
  db.prepare(`INSERT INTO transit_status_history (id, transitOrderId, status, time, location, remark) VALUES (?,?,?,?,?,?)`).run(
    id, orderId, data.status, data.time, data.location ?? '', data.remark ?? ''
  );
  return { id, transitOrderId: orderId, status: data.status, time: data.time, location: data.location ?? '', remark: data.remark ?? '' };
}

// ===================== Inbound Record DAO =====================

export function getInboundRecords(warehouseId?: string, startDate?: string, endDate?: string): InboundRecordRow[] {
  const db = initDb();
  let sql = 'SELECT * FROM inbound_records WHERE 1=1';
  const params: unknown[] = [];
  if (warehouseId) {
    sql += ' AND warehouseId = ?';
    params.push(warehouseId);
  }
  if (startDate) {
    sql += ' AND createdAt >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND createdAt <= ?';
    params.push(endDate + 'T23:59:59.999Z');
  }
  sql += ' ORDER BY createdAt DESC';
  return db.prepare(sql).all(...params) as InboundRecordRow[];
}

export function getInboundRecordById(id: string): InboundRecordRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM inbound_records WHERE id = ?').get(id) as InboundRecordRow | undefined;
}

export function createInboundRecord(data: Omit<InboundRecordRow, 'id'> & { id?: string }): InboundRecordRow {
  const id = data.id || uuidv4();
  const db = initDb();
  db.prepare(`INSERT INTO inbound_records (id, warehouseId, sku, name, quantity, volume, createdAt, operator, status, supplier, batchNo, supplier_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, data.warehouseId, data.sku, data.name, data.quantity, data.volume, data.createdAt, data.operator, data.status,
    data.supplier ?? '', data.batchNo ?? '', data.supplier_id ?? null
  );
  return { ...data, id, supplier: data.supplier ?? '', batchNo: data.batchNo ?? '', supplier_id: data.supplier_id ?? null };
}

export function updateInboundRecord(id: string, data: Partial<Omit<InboundRecordRow, 'id'>>): InboundRecordRow | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM inbound_records WHERE id = ?').get(id) as InboundRecordRow | undefined;
  if (!existing) return null;
  const updated = { ...existing, ...data, id };
  db.prepare(`UPDATE inbound_records SET warehouseId=?, sku=?, name=?, quantity=?, volume=?, createdAt=?, operator=?, status=?, supplier=?, batchNo=?, supplier_id=? WHERE id=?`).run(
    updated.warehouseId, updated.sku, updated.name, updated.quantity, updated.volume, updated.createdAt, updated.operator, updated.status,
    updated.supplier ?? '', updated.batchNo ?? '', updated.supplier_id ?? null, id
  );
  return updated;
}

export function deleteInboundRecord(id: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM inbound_records WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===================== Outbound Record DAO =====================

export function getOutboundRecords(warehouseId?: string, startDate?: string, endDate?: string): OutboundRecordRow[] {
  const db = initDb();
  let sql = 'SELECT * FROM outbound_records WHERE 1=1';
  const params: unknown[] = [];
  if (warehouseId) {
    sql += ' AND warehouseId = ?';
    params.push(warehouseId);
  }
  if (startDate) {
    sql += ' AND createdAt >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND createdAt <= ?';
    params.push(endDate + 'T23:59:59.999Z');
  }
  sql += ' ORDER BY createdAt DESC';
  return db.prepare(sql).all(...params) as OutboundRecordRow[];
}

export function getOutboundRecordById(id: string): OutboundRecordRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM outbound_records WHERE id = ?').get(id) as OutboundRecordRow | undefined;
}

export function createOutboundRecord(data: Omit<OutboundRecordRow, 'id'> & { id?: string }): OutboundRecordRow {
  const id = data.id || uuidv4();
  const db = initDb();
  db.prepare(`INSERT INTO outbound_records (id, warehouseId, sku, name, quantity, volume, createdAt, operator, destination, customer, orderNo, customer_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, data.warehouseId, data.sku, data.name, data.quantity, data.volume, data.createdAt, data.operator, data.destination,
    data.customer ?? '', data.orderNo ?? '', data.customer_id ?? null
  );
  return { ...data, id, customer: data.customer ?? '', orderNo: data.orderNo ?? '', customer_id: data.customer_id ?? null };
}

export function updateOutboundRecord(id: string, data: Partial<Omit<OutboundRecordRow, 'id'>>): OutboundRecordRow | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM outbound_records WHERE id = ?').get(id) as OutboundRecordRow | undefined;
  if (!existing) return null;
  const updated = { ...existing, ...data, id };
  db.prepare(`UPDATE outbound_records SET warehouseId=?, sku=?, name=?, quantity=?, volume=?, createdAt=?, operator=?, destination=?, customer=?, orderNo=?, customer_id=? WHERE id=?`).run(
    updated.warehouseId, updated.sku, updated.name, updated.quantity, updated.volume, updated.createdAt, updated.operator, updated.destination,
    updated.customer ?? '', updated.orderNo ?? '', updated.customer_id ?? null, id
  );
  return updated;
}

export function deleteOutboundRecord(id: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM outbound_records WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===================== User Skills DAO =====================

/** Parse a UserSkillRow into a frontend-friendly shape */
function skillRowToClient(row: UserSkillRow): Record<string, unknown> {
  let tags: string[] = [];
  try {
    if (row.tags) tags = JSON.parse(row.tags);
  } catch { /* ignore corrupt JSON */ }
  return {
    id: row.id,
    name: row.name,
    desc: row.desc,
    icon: row.icon,
    category: row.category,
    path: row.path,
    trigger: row.trigger || undefined,
    detail: row.detail || undefined,
    tags,
    status: row.status,
    version: row.version || undefined,
    featured: row.featured === 1,
    shortcut: row.shortcut || undefined,
    source: 'user' as const,
    installedAt: row.installedAt,
    promptTemplate: row.promptTemplate || undefined,
    executionMode: row.executionMode || undefined,
  };
}

/** Convert frontend Skill data to DB-compatible fields */
function clientToSkillRow(data: Record<string, unknown>): Omit<UserSkillRow, 'id'> {
  return {
    name: (data.name ?? '') as string,
    desc: (data.desc ?? '') as string,
    icon: (data.icon ?? 'Extension') as string,
    category: (data.category ?? 'tool') as string,
    path: (data.path ?? '') as string,
    trigger: (data.trigger as string) || null,
    detail: (data.detail as string) || null,
    tags: Array.isArray(data.tags) ? JSON.stringify(data.tags) : (data.tags as string) || null,
    status: (data.status ?? 'active') as string,
    version: (data.version as string) || null,
    featured: data.featured === true ? 1 : 0,
    shortcut: (data.shortcut as string) || null,
    installedAt: (data.installedAt as number) ?? Date.now(),
    promptTemplate: (data.promptTemplate as string) || null,
    executionMode: (data.executionMode as string) || null,
  };
}

export function getUserSkills(): Record<string, unknown>[] {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM user_skills ORDER BY installedAt DESC').all() as UserSkillRow[];
  return rows.map(skillRowToClient);
}

export function getUserSkillById(id: string): Record<string, unknown> | undefined {
  const db = initDb();
  const row = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(id) as UserSkillRow | undefined;
  return row ? skillRowToClient(row) : undefined;
}

export function createUserSkill(data: Record<string, unknown>): Record<string, unknown> {
  const id = (data.id as string) || `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const db = initDb();
  const row = clientToSkillRow(data);
  db.prepare(`INSERT INTO user_skills (id, name, "desc", icon, category, path, trigger, detail, tags, status, version, featured, shortcut, installedAt, promptTemplate, executionMode)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, row.name, row.desc, row.icon, row.category, row.path, row.trigger, row.detail, row.tags, row.status, row.version, row.featured, row.shortcut, row.installedAt, row.promptTemplate, row.executionMode
  );
  // Read back from DB to ensure correct type conversion (e.g. tags: JSON string → array)
  const saved = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(id) as UserSkillRow | undefined;
  return skillRowToClient(saved!);
}

export function updateUserSkill(id: string, data: Record<string, unknown>): Record<string, unknown> | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(id) as UserSkillRow | undefined;
  if (!existing) return null;
  const row = clientToSkillRow({ ...skillRowToClient(existing), ...data });
  db.prepare(`UPDATE user_skills SET name=?, "desc"=?, icon=?, category=?, path=?, trigger=?, detail=?, tags=?, status=?, version=?, featured=?, shortcut=?, installedAt=?, promptTemplate=?, executionMode=? WHERE id=?`).run(
    row.name, row.desc, row.icon, row.category, row.path, row.trigger, row.detail, row.tags, row.status, row.version, row.featured, row.shortcut, row.installedAt, row.promptTemplate, row.executionMode, id
  );
  // Read back from DB to ensure correct type conversion
  const saved = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(id) as UserSkillRow | undefined;
  return saved ? skillRowToClient(saved) : null;
}

export function deleteUserSkill(id: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM user_skills WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===================== Builtin Status Patches DAO =====================

export function getBuiltinPatches(): Record<string, string> {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM builtin_status_patches').all() as BuiltinStatusPatchRow[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.skillId] = row.status;
  }
  return result;
}

export function setBuiltinPatch(skillId: string, status: string): void {
  const db = initDb();
  db.prepare('INSERT OR REPLACE INTO builtin_status_patches (skillId, status) VALUES (?,?)').run(skillId, status);
}

export function removeBuiltinPatch(skillId: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM builtin_status_patches WHERE skillId = ?').run(skillId);
  return result.changes > 0;
}

// ===================== App Settings DAO =====================

export function getAppSettings(key: string): string | null {
  const db = initDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setAppSettings(key: string, value: string): void {
  const db = initDb();
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)').run(key, value);
}

// ===================== Migration DAO =====================

export interface MigrateResult {
  warehouses: number;
  inventoryItems: number;
  transitOrders: number;
  userSkills: number;
  builtinStatusPatches: number;
  appSettings: number;
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

// ===================== Skill Chain DAO =====================

/** Create a new skill chain */
export function createSkillChain(chain: {
  id: string;
  name: string;
  description?: string;
  failStrategy?: string;
  createdAt: string;
  updatedAt: string;
}): SkillChainRow {
  const db = initDb();
  const stmt = db.prepare(`INSERT INTO skill_chains (id, name, description, fail_strategy, created_at, updated_at) VALUES (?,?,?,?,?,?)`);
  stmt.run(
    chain.id,
    chain.name,
    chain.description ?? '',
    chain.failStrategy ?? 'stop',
    chain.createdAt,
    chain.updatedAt
  );
  return getSkillChain(chain.id)!;
}

/** Get a skill chain by ID */
export function getSkillChain(id: string): SkillChainRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_chains WHERE id = ?').get(id) as SkillChainRow | undefined;
}

/** Get all skill chains */
export function getAllSkillChains(): SkillChainRow[] {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_chains ORDER BY created_at DESC').all() as SkillChainRow[];
}

/** Update a skill chain */
export function updateSkillChain(id: string, data: Partial<{
  name: string;
  description: string;
  fail_strategy: string;
  updatedAt: string;
}>): void {
  const db = initDb();
  const existing = getSkillChain(id);
  if (!existing) return;
  const updated = {
    name: data.name ?? existing.name,
    description: data.description ?? existing.description,
    fail_strategy: data.fail_strategy ?? existing.fail_strategy,
    updated_at: data.updatedAt ?? new Date().toISOString(),
  };
  db.prepare('UPDATE skill_chains SET name=?, description=?, fail_strategy=?, updated_at=? WHERE id=?').run(
    updated.name,
    updated.description,
    updated.fail_strategy,
    updated.updated_at,
    id
  );
}

/** Delete a skill chain (cascade deletes nodes and executions) */
export function deleteSkillChain(id: string): void {
  const db = initDb();
  db.prepare('DELETE FROM skill_chains WHERE id = ?').run(id);
}

/** Create a chain node */
export function createChainNode(node: {
  id: string;
  chainId: string;
  skillId: string;
  skillName: string;
  skillIcon?: string;
  dataPassMode?: string;
  selectedFields?: string;
  customMapping?: string;
  timeout?: number;
  retryCount?: number;
  nodeOrder: number;
}): void {
  const db = initDb();
  db.prepare(`INSERT INTO skill_chain_nodes (id, chain_id, skill_id, skill_name, skill_icon, data_pass_mode, selected_fields, custom_mapping, timeout, retry_count, node_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    node.id,
    node.chainId,
    node.skillId,
    node.skillName,
    node.skillIcon ?? 'Extension',
    node.dataPassMode ?? 'full',
    node.selectedFields ?? '[]',
    node.customMapping ?? '{}',
    node.timeout ?? 30000,
    node.retryCount ?? 0,
    node.nodeOrder
  );
}

/** Get all nodes for a chain */
export function getChainNodes(chainId: string): SkillChainNodeRow[] {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_chain_nodes WHERE chain_id = ? ORDER BY node_order ASC').all(chainId) as SkillChainNodeRow[];
}

/** Delete all nodes for a chain */
export function deleteChainNodes(chainId: string): void {
  const db = initDb();
  db.prepare('DELETE FROM skill_chain_nodes WHERE chain_id = ?').run(chainId);
}

// ===================== Skill Audit DAO =====================

/** Create a skill audit record */
export function createSkillAudit(audit: {
  id: string;
  skillId: string;
  skillVersion: string;
  score: number;
  level: string;
  reportJson?: string;
  reportMarkdown?: string;
  triggeredBy?: string;
  createdAt?: string;
}): void {
  const db = initDb();
  db.prepare(`INSERT OR REPLACE INTO skill_audits (id, skill_id, skill_version, score, level, report_json, report_markdown, triggered_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    audit.id,
    audit.skillId,
    audit.skillVersion,
    audit.score,
    audit.level,
    audit.reportJson ?? '{}',
    audit.reportMarkdown ?? '',
    audit.triggeredBy ?? 'manual',
    audit.createdAt ?? new Date().toISOString()
  );
}

/** Get latest audit for a skill */
export function getLatestSkillAudit(skillId: string): SkillAuditRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_audits WHERE skill_id = ? ORDER BY created_at DESC LIMIT 1').get(skillId) as SkillAuditRow | undefined;
}

/** Get audit history for a skill */
export function getSkillAuditHistory(skillId: string): SkillAuditRow[] {
  const db = initDb();
  return db.prepare('SELECT * FROM skill_audits WHERE skill_id = ? ORDER BY created_at DESC').all(skillId) as SkillAuditRow[];
}

// ===================== Skill Chain Execution DAO =====================

/** Create a chain execution record */
export function createSkillExecution(execution: {
  id: string;
  chainId: string;
  status?: string;
  failStrategy?: string;
  steps?: string;
  nodeResults?: string;
  result?: string;
  startedAt?: string;
}): void {
  const db = initDb();
  db.prepare(`INSERT INTO skill_chain_executions (id, chain_id, status, fail_strategy, steps, node_results, result, started_at, completed_at, duration)
    VALUES (?,?,?,?,?,?,?,?,NULL,NULL)`).run(
    execution.id,
    execution.chainId,
    execution.status ?? 'running',
    execution.failStrategy ?? 'stop',
    execution.steps ?? '[]',
    execution.nodeResults ?? '[]',
    execution.result ?? '{}',
    execution.startedAt ?? new Date().toISOString()
  );
}

/** Update a chain execution record */
export function updateSkillExecution(id: string, data: Partial<{
  status: string;
  failStrategy: string;
  steps: string;
  nodeResults: string;
  result: string;
  completedAt: string | null;
  duration: number | null;
}>): void {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM skill_chain_executions WHERE id = ?').get(id) as SkillChainExecutionRow | undefined;
  if (!existing) return;
  const updated = {
    status: data.status ?? existing.status,
    fail_strategy: data.failStrategy ?? existing.fail_strategy,
    steps: data.steps ?? existing.steps,
    node_results: data.nodeResults ?? existing.node_results,
    result: data.result ?? existing.result,
    completed_at: data.completedAt !== undefined ? data.completedAt : existing.completed_at,
    duration: data.duration !== undefined ? data.duration : existing.duration,
  };
  db.prepare('UPDATE skill_chain_executions SET status=?, fail_strategy=?, steps=?, node_results=?, result=?, completed_at=?, duration=? WHERE id=?').run(
    updated.status,
    updated.fail_strategy,
    updated.steps,
    updated.node_results,
    updated.result,
    updated.completed_at,
    updated.duration,
    id
  );
}

export function migrateData(payload: {
  warehouses?: WarehouseRow[];
  inventoryItems?: Record<string, unknown>[];
  transitOrders?: Record<string, unknown>[];
  userSkills?: Record<string, unknown>[];
  builtinStatusPatches?: Record<string, string>;
  appSettings?: Record<string, unknown>;
}): MigrateResult {
  const db = initDb();
  const result: MigrateResult = { warehouses: 0, inventoryItems: 0, transitOrders: 0, userSkills: 0, builtinStatusPatches: 0, appSettings: 0 };

  const transaction = db.transaction(() => {
    // Warehouses
    if (Array.isArray(payload.warehouses) && payload.warehouses.length > 0) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO warehouses (id, name, country, city, totalVolume, usedVolume, totalItems, usedItems, status, address, manager, phone, createdAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const w of payload.warehouses!) {
        stmt.run(w.id, w.name, w.country ?? '', w.city ?? '', w.totalVolume ?? 0, w.usedVolume ?? 0, w.totalItems ?? 0, w.usedItems ?? 0, w.status ?? 'normal', w.address ?? '', w.manager ?? '', w.phone ?? '', w.createdAt ?? new Date().toISOString());
        result.warehouses++;
      }
    }

    // Inventory Items
    if (Array.isArray(payload.inventoryItems) && payload.inventoryItems.length > 0) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO inventory_items (id, sku, name, warehouseId, quantity, volumePerUnit, totalVolume, inboundDate, valuePerUnit, totalValue, category, isAgeWarning)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const item of payload.inventoryItems!) {
        const isAgeWarning = item.isAgeWarning === true ? 1 : 0;
        stmt.run(item.id, item.sku ?? '', item.name ?? '', item.warehouseId ?? '', item.quantity ?? 0, item.volumePerUnit ?? 0, item.totalVolume ?? 0, item.inboundDate ?? '', item.valuePerUnit ?? 0, item.totalValue ?? 0, item.category ?? '', isAgeWarning);
        result.inventoryItems++;
      }
    }

    // Transit Orders
    if (Array.isArray(payload.transitOrders) && payload.transitOrders.length > 0) {
      const orderStmt = db.prepare(`INSERT OR REPLACE INTO transit_orders (id, trackingNo, fromWarehouseId, toWarehouseId, category, weight, volume, transportMode, estimatedArrival, actualArrival, status, createdAt, carrier, value)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const historyStmt = db.prepare(`INSERT OR REPLACE INTO transit_status_history (id, transitOrderId, status, time, location, remark) VALUES (?,?,?,?,?,?)`);
      for (const o of payload.transitOrders!) {
        orderStmt.run(o.id, o.trackingNo ?? '', o.fromWarehouseId ?? '', o.toWarehouseId ?? '', o.category ?? '', o.weight ?? 0, o.volume ?? 0, o.transportMode ?? 'sea', o.estimatedArrival ?? '', o.actualArrival ?? null, o.status ?? 'dispatched', o.createdAt ?? new Date().toISOString(), o.carrier ?? '', o.value ?? 0);
        // Insert status history if present
        const history = o.statusHistory as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(history)) {
          for (const h of history) {
            historyStmt.run(uuidv4(), o.id, h.status ?? '', h.time ?? '', h.location ?? '', h.remark ?? '');
          }
        }
        result.transitOrders++;
      }
    }

    // User Skills
    if (Array.isArray(payload.userSkills) && payload.userSkills.length > 0) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO user_skills (id, name, "desc", icon, category, path, trigger, detail, tags, status, version, featured, shortcut, installedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const s of payload.userSkills!) {
        const tags = Array.isArray(s.tags) ? JSON.stringify(s.tags) : (s.tags as string) || '';
        const featured = s.featured === true ? 1 : 0;
        stmt.run(s.id, s.name ?? '', s.desc ?? '', s.icon ?? 'Extension', s.category ?? 'tool', s.path ?? '', s.trigger ?? null, s.detail ?? null, tags, s.status ?? 'active', s.version ?? null, featured, s.shortcut ?? null, s.installedAt ?? Date.now());
        result.userSkills++;
      }
    }

    // Builtin Status Patches
    if (payload.builtinStatusPatches && typeof payload.builtinStatusPatches === 'object') {
      const stmt = db.prepare('INSERT OR REPLACE INTO builtin_status_patches (skillId, status) VALUES (?,?)');
      for (const [skillId, status] of Object.entries(payload.builtinStatusPatches)) {
        stmt.run(skillId, status);
        result.builtinStatusPatches++;
      }
    }

    // App Settings
    if (payload.appSettings && typeof payload.appSettings === 'object') {
      db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)').run('default', JSON.stringify(payload.appSettings));
      result.appSettings = 1;
    }
  });

  transaction();
  return result;
}

// ===================== Skill Usage Statistics DAO =====================

/** 获取单个技能的使用统计 */
export function getSkillUsageStats(skillId: string): { totalUses: number; lastUsedAt: string | null } {
  const db = initDb();
  const result = db.prepare(`SELECT COUNT(*) as count, MAX(timestamp) as lastUsed FROM messages WHERE skillId = ?`).get(skillId) as { count: number; lastUsed: string | null };
  return {
    totalUses: result.count,
    lastUsedAt: result.lastUsed,
  };
}

/** 批量获取多个技能的使用统计 */
export function getBatchSkillUsageStats(skillIds: string[]): Map<string, { totalUses: number; lastUsedAt: string | null }> {
  const db = initDb();
  const statsMap = new Map<string, { totalUses: number; lastUsedAt: string | null }>();

  // 初始化所有技能 ID 为 0
  for (const id of skillIds) {
    statsMap.set(id, { totalUses: 0, lastUsedAt: null });
  }

  if (skillIds.length === 0) {
    return statsMap;
  }

  // 批量查询
  const placeholders = skillIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT skillId, COUNT(*) as count, MAX(timestamp) as lastUsed FROM messages WHERE skillId IN (${placeholders}) GROUP BY skillId`).all(...skillIds) as Array<{ skillId: string; count: number; lastUsed: string | null }>;

  // 更新统计结果
  for (const row of rows) {
    if (row.skillId) {
      statsMap.set(row.skillId, {
        totalUses: row.count,
        lastUsedAt: row.lastUsed,
      });
    }
  }

  return statsMap;
}

// ===================== Transfer Order DAO (v1.5.0) =====================

/** Query transfer orders with optional filters and pagination */
export function getTransferOrders(params?: {
  status?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  sku?: string;
  page?: number;
  pageSize?: number;
}): { items: TransferOrderRow[]; total: number } {
  const db = initDb();
  const { status, fromWarehouseId, toWarehouseId, sku, page = 1, pageSize = 20 } = params ?? {};

  let sql = 'SELECT * FROM transfer_orders WHERE 1=1';
  const queryParams: unknown[] = [];

  if (status) {
    sql += ' AND status = ?';
    queryParams.push(status);
  }
  if (fromWarehouseId) {
    sql += ' AND fromWarehouseId = ?';
    queryParams.push(fromWarehouseId);
  }
  if (toWarehouseId) {
    sql += ' AND toWarehouseId = ?';
    queryParams.push(toWarehouseId);
  }
  if (sku) {
    sql += ' AND sku LIKE ?';
    queryParams.push(`%${sku}%`);
  }

  // Count query
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countRow = db.prepare(countSql).get(...queryParams) as { total: number };

  sql += ' ORDER BY createdAt DESC';
  const offset = (page - 1) * pageSize;
  sql += ' LIMIT ? OFFSET ?';
  queryParams.push(pageSize, offset);

  const items = db.prepare(sql).all(...queryParams) as TransferOrderRow[];
  return { items, total: countRow.total };
}

/** Get a single transfer order by ID */
export function getTransferOrderById(id: string): TransferOrderRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow | undefined;
}

/** Create a new transfer order */
export function createTransferOrder(data: Omit<TransferOrderRow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): TransferOrderRow {
  const id = data.id || uuidv4();
  const now = new Date().toISOString();
  const db = initDb();
  db.prepare(
    `INSERT INTO transfer_orders (id, transferNo, fromWarehouseId, toWarehouseId, sku, name, quantity, volume, status, transitOrderId, createdBy, submittedAt, submittedBy, receivedAt, receivedBy, completedAt, completedBy, remark, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.transferNo ?? '',
    data.fromWarehouseId,
    data.toWarehouseId,
    data.sku,
    data.name ?? '',
    data.quantity ?? 0,
    data.volume ?? 0,
    data.status ?? 'draft',
    data.transitOrderId ?? null,
    data.createdBy ?? '',
    data.submittedAt ?? null,
    data.submittedBy ?? null,
    data.receivedAt ?? null,
    data.receivedBy ?? null,
    data.completedAt ?? null,
    data.completedBy ?? null,
    data.remark ?? '',
    now,
    now
  );
  return db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow;
}

/** Update a transfer order (only draft status should be updatable) */
export function updateTransferOrder(id: string, data: Partial<Omit<TransferOrderRow, 'id' | 'createdAt'>>): TransferOrderRow | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow | undefined;
  if (!existing) return null;
  const updated = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
  db.prepare(
    `UPDATE transfer_orders SET transferNo=?, fromWarehouseId=?, toWarehouseId=?, sku=?, name=?, quantity=?, volume=?, status=?, transitOrderId=?, createdBy=?, submittedAt=?, submittedBy=?, receivedAt=?, receivedBy=?, completedAt=?, completedBy=?, remark=?, updatedAt=? WHERE id=?`
  ).run(
    updated.transferNo, updated.fromWarehouseId, updated.toWarehouseId, updated.sku,
    updated.name, updated.quantity, updated.volume, updated.status, updated.transitOrderId,
    updated.createdBy, updated.submittedAt, updated.submittedBy, updated.receivedAt,
    updated.receivedBy, updated.completedAt, updated.completedBy, updated.remark,
    updated.updatedAt, id
  );
  return db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow;
}

/** Delete a transfer order (only draft status should be deletable) */
export function deleteTransferOrder(id: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM transfer_orders WHERE id = ?').run(id);
  return result.changes > 0;
}
