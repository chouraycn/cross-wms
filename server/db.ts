import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = path.join(os.homedir(), '.crosswms', 'chat.db');

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
  db.prepare(`INSERT INTO inbound_records (id, warehouseId, sku, name, quantity, volume, createdAt, operator, status, supplier, batchNo) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, data.warehouseId, data.sku, data.name, data.quantity, data.volume, data.createdAt, data.operator, data.status,
    data.supplier ?? '', data.batchNo ?? ''
  );
  return { ...data, id, supplier: data.supplier ?? '', batchNo: data.batchNo ?? '' };
}

export function updateInboundRecord(id: string, data: Partial<Omit<InboundRecordRow, 'id'>>): InboundRecordRow | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM inbound_records WHERE id = ?').get(id) as InboundRecordRow | undefined;
  if (!existing) return null;
  const updated = { ...existing, ...data, id };
  db.prepare(`UPDATE inbound_records SET warehouseId=?, sku=?, name=?, quantity=?, volume=?, createdAt=?, operator=?, status=?, supplier=?, batchNo=? WHERE id=?`).run(
    updated.warehouseId, updated.sku, updated.name, updated.quantity, updated.volume, updated.createdAt, updated.operator, updated.status,
    updated.supplier ?? '', updated.batchNo ?? '', id
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
  db.prepare(`INSERT INTO outbound_records (id, warehouseId, sku, name, quantity, volume, createdAt, operator, destination, customer, orderNo) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, data.warehouseId, data.sku, data.name, data.quantity, data.volume, data.createdAt, data.operator, data.destination,
    data.customer ?? '', data.orderNo ?? ''
  );
  return { ...data, id, customer: data.customer ?? '', orderNo: data.orderNo ?? '' };
}

export function updateOutboundRecord(id: string, data: Partial<Omit<OutboundRecordRow, 'id'>>): OutboundRecordRow | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM outbound_records WHERE id = ?').get(id) as OutboundRecordRow | undefined;
  if (!existing) return null;
  const updated = { ...existing, ...data, id };
  db.prepare(`UPDATE outbound_records SET warehouseId=?, sku=?, name=?, quantity=?, volume=?, createdAt=?, operator=?, destination=?, customer=?, orderNo=? WHERE id=?`).run(
    updated.warehouseId, updated.sku, updated.name, updated.quantity, updated.volume, updated.createdAt, updated.operator, updated.destination,
    updated.customer ?? '', updated.orderNo ?? '', id
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
