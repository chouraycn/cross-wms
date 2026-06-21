import Database from 'better-sqlite3';
import { logger } from './logger.js';

// ===================== WMS Types =====================

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

export interface ZoneRow {
  id: string;
  warehouseId: string;
  name: string;
  type: string;
  capacity: number;
  usedCapacity: number;
  status: string;
  createdAt: string;
}

export interface LocationRow {
  id: string;
  zoneId: string;
  warehouseId: string;
  code: string;
  type: string;
  capacity: number;
  usedCapacity: number;
  status: string;
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

export interface InventoryMovementRow {
  id: string;
  itemId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  quantity: number;
  type: string;
  operator: string;
  remark: string;
  createdAt: string;
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

// ===================== WMS Table Initialization =====================

export function initWmsTables(db: Database.Database): void {
  // Core WMS tables
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
    CREATE TABLE IF NOT EXISTS zones (
      id TEXT PRIMARY KEY,
      warehouseId TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'storage',
      capacity REAL NOT NULL DEFAULT 0,
      usedCapacity REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      createdAt TEXT NOT NULL,
      FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      zoneId TEXT NOT NULL,
      warehouseId TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'shelf',
      capacity REAL NOT NULL DEFAULT 0,
      usedCapacity REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      createdAt TEXT NOT NULL,
      FOREIGN KEY (zoneId) REFERENCES zones(id) ON DELETE CASCADE,
      FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE
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
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      itemId TEXT NOT NULL,
      fromLocationId TEXT,
      toLocationId TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'move',
      operator TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      FOREIGN KEY (itemId) REFERENCES inventory_items(id) ON DELETE CASCADE,
      FOREIGN KEY (fromLocationId) REFERENCES locations(id) ON DELETE SET NULL,
      FOREIGN KEY (toLocationId) REFERENCES locations(id) ON DELETE SET NULL
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

  // Add new columns to existing tables (v1.0.76) — safe ALTER with column-existence check
  const columnsToAdd: Array<{ table: string; column: string; definition: string }> = [
    { table: 'inbound_records', column: 'supplier', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'inbound_records', column: 'batchNo', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'outbound_records', column: 'customer', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'outbound_records', column: 'orderNo', definition: "TEXT NOT NULL DEFAULT ''" },
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
    logger.info('[Migrate v1.5.0] 扩展 inventory_transactions CHECK 约束...');
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
    logger.info('[Migrate v1.5.0] ✅ CHECK 约束扩展完成');
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
    logger.info('[Migrate v1.6.0] ✅ 添加 minStock 列到 inventory_items');
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
}
