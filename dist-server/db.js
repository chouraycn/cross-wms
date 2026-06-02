"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDb = initDb;
exports.getSessions = getSessions;
exports.createSession = createSession;
exports.getSessionMessages = getSessionMessages;
exports.addMessage = addMessage;
exports.deleteSession = deleteSession;
exports.getWarehouses = getWarehouses;
exports.getWarehouseById = getWarehouseById;
exports.createWarehouse = createWarehouse;
exports.updateWarehouse = updateWarehouse;
exports.deleteWarehouse = deleteWarehouse;
exports.getInventoryItems = getInventoryItems;
exports.getInventoryItemById = getInventoryItemById;
exports.createInventoryItem = createInventoryItem;
exports.updateInventoryItem = updateInventoryItem;
exports.deleteInventoryItem = deleteInventoryItem;
exports.getStatusHistory = getStatusHistory;
exports.getTransitOrders = getTransitOrders;
exports.getTransitOrderById = getTransitOrderById;
exports.createTransitOrder = createTransitOrder;
exports.updateTransitOrder = updateTransitOrder;
exports.deleteTransitOrder = deleteTransitOrder;
exports.addStatusHistory = addStatusHistory;
exports.getInboundRecords = getInboundRecords;
exports.getInboundRecordById = getInboundRecordById;
exports.createInboundRecord = createInboundRecord;
exports.updateInboundRecord = updateInboundRecord;
exports.deleteInboundRecord = deleteInboundRecord;
exports.getOutboundRecords = getOutboundRecords;
exports.getOutboundRecordById = getOutboundRecordById;
exports.createOutboundRecord = createOutboundRecord;
exports.updateOutboundRecord = updateOutboundRecord;
exports.deleteOutboundRecord = deleteOutboundRecord;
exports.getUserSkills = getUserSkills;
exports.getUserSkillById = getUserSkillById;
exports.createUserSkill = createUserSkill;
exports.updateUserSkill = updateUserSkill;
exports.deleteUserSkill = deleteUserSkill;
exports.getBuiltinPatches = getBuiltinPatches;
exports.setBuiltinPatch = setBuiltinPatch;
exports.removeBuiltinPatch = removeBuiltinPatch;
exports.getAppSettings = getAppSettings;
exports.setAppSettings = setAppSettings;
exports.migrateData = migrateData;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const DB_PATH = path_1.default.join(os_1.default.homedir(), '.crosswms', 'chat.db');
let db = null;
function initDb() {
    if (db)
        return db;
    const dir = path_1.default.dirname(DB_PATH);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    db = new better_sqlite3_1.default(DB_PATH);
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
      installedAt INTEGER NOT NULL DEFAULT 0
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
    return db;
}
// ===================== Chat Session DAO (existing) =====================
function getSessions() {
    const db = initDb();
    return db.prepare('SELECT * FROM sessions ORDER BY updatedAt DESC').all();
}
function createSession(id, title, model, agentId) {
    const now = new Date().toISOString();
    const db = initDb();
    db.prepare('INSERT INTO sessions (id, title, model, agentId, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(id, title, model, agentId || null, now, now);
    return { id, title, model, agentId, createdAt: now, updatedAt: now };
}
function getSessionMessages(sessionId) {
    const db = initDb();
    return db.prepare('SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp ASC').all(sessionId);
}
function addMessage(msg) {
    const id = msg.id || (0, uuid_1.v4)();
    const now = new Date().toISOString();
    const db = initDb();
    db.prepare('INSERT INTO messages (id, sessionId, role, content, model, timestamp, toolCalls) VALUES (?,?,?,?,?,?,?)').run(id, msg.sessionId, msg.role, msg.content, msg.model || null, now, msg.toolCalls || null);
    db.prepare('UPDATE sessions SET updatedAt = ? WHERE id = ?').run(now, msg.sessionId);
    return { ...msg, id, timestamp: now };
}
function deleteSession(id) {
    const db = initDb();
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}
// ===================== Warehouse DAO =====================
function getWarehouses() {
    const db = initDb();
    return db.prepare('SELECT * FROM warehouses ORDER BY createdAt DESC').all();
}
function getWarehouseById(id) {
    const db = initDb();
    return db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id);
}
function createWarehouse(data) {
    const id = data.id || (0, uuid_1.v4)();
    const db = initDb();
    db.prepare(`INSERT INTO warehouses (id, name, country, city, totalVolume, usedVolume, totalItems, usedItems, status, address, manager, phone, createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, data.name, data.country, data.city, data.totalVolume, data.usedVolume, data.totalItems, data.usedItems, data.status, data.address, data.manager, data.phone, data.createdAt);
    return { ...data, id };
}
function updateWarehouse(id, data) {
    const db = initDb();
    const existing = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id);
    if (!existing)
        return null;
    const updated = { ...existing, ...data, id };
    db.prepare(`UPDATE warehouses SET name=?, country=?, city=?, totalVolume=?, usedVolume=?, totalItems=?, usedItems=?, status=?, address=?, manager=?, phone=?, createdAt=? WHERE id=?`).run(updated.name, updated.country, updated.city, updated.totalVolume, updated.usedVolume, updated.totalItems, updated.usedItems, updated.status, updated.address, updated.manager, updated.phone, updated.createdAt, id);
    return updated;
}
function deleteWarehouse(id) {
    const db = initDb();
    const result = db.prepare('DELETE FROM warehouses WHERE id = ?').run(id);
    return result.changes > 0;
}
// ===================== Inventory DAO =====================
/** Convert DB row (isAgeWarning: 0|1) to frontend type (isAgeWarning: boolean) */
function inventoryRowToBoolean(row) {
    return { ...row, isAgeWarning: row.isAgeWarning === 1 };
}
/** Convert frontend type (isAgeWarning: boolean) to DB row (isAgeWarning: 0|1) */
function inventoryBooleanToRow(data) {
    return data.isAgeWarning === true ? 1 : 0;
}
function getInventoryItems(warehouseId) {
    const db = initDb();
    let rows;
    if (warehouseId) {
        rows = db.prepare('SELECT * FROM inventory_items WHERE warehouseId = ? ORDER BY inboundDate DESC').all(warehouseId);
    }
    else {
        rows = db.prepare('SELECT * FROM inventory_items ORDER BY inboundDate DESC').all();
    }
    return rows.map(inventoryRowToBoolean);
}
function getInventoryItemById(id) {
    const db = initDb();
    const row = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
    return row ? inventoryRowToBoolean(row) : undefined;
}
function createInventoryItem(data) {
    const id = data.id || (0, uuid_1.v4)();
    const db = initDb();
    const isAgeWarning = inventoryBooleanToRow(data);
    db.prepare(`INSERT INTO inventory_items (id, sku, name, warehouseId, quantity, volumePerUnit, totalVolume, inboundDate, valuePerUnit, totalValue, category, isAgeWarning)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, data.sku ?? '', data.name ?? '', data.warehouseId ?? '', data.quantity ?? 0, data.volumePerUnit ?? 0, data.totalVolume ?? 0, data.inboundDate ?? '', data.valuePerUnit ?? 0, data.totalValue ?? 0, data.category ?? '', isAgeWarning);
    return inventoryRowToBoolean({ ...data, id, isAgeWarning });
}
function updateInventoryItem(id, data) {
    const db = initDb();
    const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
    if (!existing)
        return null;
    const merged = { ...inventoryRowToBoolean(existing), ...data, id };
    const isAgeWarning = inventoryBooleanToRow(merged);
    db.prepare(`UPDATE inventory_items SET sku=?, name=?, warehouseId=?, quantity=?, volumePerUnit=?, totalVolume=?, inboundDate=?, valuePerUnit=?, totalValue=?, category=?, isAgeWarning=? WHERE id=?`).run(merged.sku ?? '', merged.name ?? '', merged.warehouseId ?? '', merged.quantity ?? 0, merged.volumePerUnit ?? 0, merged.totalVolume ?? 0, merged.inboundDate ?? '', merged.valuePerUnit ?? 0, merged.totalValue ?? 0, merged.category ?? '', isAgeWarning, id);
    return { ...merged, isAgeWarning: isAgeWarning === 1 };
}
function deleteInventoryItem(id) {
    const db = initDb();
    const result = db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);
    return result.changes > 0;
}
// ===================== Transit Order DAO =====================
/** Fetch status history for a given transit order */
function getStatusHistory(orderId) {
    const db = initDb();
    return db.prepare('SELECT * FROM transit_status_history WHERE transitOrderId = ? ORDER BY time ASC').all(orderId);
}
/** Fetch all transit orders, with their statusHistory aggregated as a nested array */
function getTransitOrders(status) {
    const db = initDb();
    let orders;
    if (status) {
        orders = db.prepare('SELECT * FROM transit_orders WHERE status = ? ORDER BY createdAt DESC').all(status);
    }
    else {
        orders = db.prepare('SELECT * FROM transit_orders ORDER BY createdAt DESC').all();
    }
    // Batch-fetch all status history for these orders
    const historyStmt = db.prepare('SELECT * FROM transit_status_history WHERE transitOrderId = ? ORDER BY time ASC');
    return orders.map(order => {
        const history = historyStmt.all(order.id);
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
function getTransitOrderById(id) {
    const db = initDb();
    const order = db.prepare('SELECT * FROM transit_orders WHERE id = ?').get(id);
    if (!order)
        return undefined;
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
function createTransitOrder(data) {
    const id = data.id || (0, uuid_1.v4)();
    const db = initDb();
    db.prepare(`INSERT INTO transit_orders (id, trackingNo, fromWarehouseId, toWarehouseId, category, weight, volume, transportMode, estimatedArrival, actualArrival, status, createdAt, carrier, value)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, data.trackingNo ?? '', data.fromWarehouseId ?? '', data.toWarehouseId ?? '', data.category ?? '', data.weight ?? 0, data.volume ?? 0, data.transportMode ?? 'sea', data.estimatedArrival ?? '', data.actualArrival ?? null, data.status ?? 'dispatched', data.createdAt ?? new Date().toISOString(), data.carrier ?? '', data.value ?? 0);
    // Insert status history items if provided
    const statusHistory = data.statusHistory;
    if (Array.isArray(statusHistory) && statusHistory.length > 0) {
        const insertHistory = db.prepare(`INSERT INTO transit_status_history (id, transitOrderId, status, time, location, remark) VALUES (?,?,?,?,?,?)`);
        for (const h of statusHistory) {
            insertHistory.run((0, uuid_1.v4)(), id, h.status ?? '', h.time ?? '', h.location ?? '', h.remark ?? '');
        }
    }
    return getTransitOrderById(id);
}
function updateTransitOrder(id, data) {
    const db = initDb();
    const existing = db.prepare('SELECT * FROM transit_orders WHERE id = ?').get(id);
    if (!existing)
        return null;
    const merged = { ...existing, ...data, id };
    db.prepare(`UPDATE transit_orders SET trackingNo=?, fromWarehouseId=?, toWarehouseId=?, category=?, weight=?, volume=?, transportMode=?, estimatedArrival=?, actualArrival=?, status=?, createdAt=?, carrier=?, value=? WHERE id=?`).run(merged.trackingNo, merged.fromWarehouseId, merged.toWarehouseId, merged.category, merged.weight, merged.volume, merged.transportMode, merged.estimatedArrival, merged.actualArrival, merged.status, merged.createdAt, merged.carrier, merged.value, id);
    // If statusHistory is provided in update data, replace all history
    const statusHistory = data.statusHistory;
    if (Array.isArray(statusHistory)) {
        db.prepare('DELETE FROM transit_status_history WHERE transitOrderId = ?').run(id);
        const insertHistory = db.prepare(`INSERT INTO transit_status_history (id, transitOrderId, status, time, location, remark) VALUES (?,?,?,?,?,?)`);
        for (const h of statusHistory) {
            insertHistory.run((0, uuid_1.v4)(), id, h.status ?? '', h.time ?? '', h.location ?? '', h.remark ?? '');
        }
    }
    return getTransitOrderById(id);
}
function deleteTransitOrder(id) {
    const db = initDb();
    // CASCADE will delete status_history rows automatically
    const result = db.prepare('DELETE FROM transit_orders WHERE id = ?').run(id);
    return result.changes > 0;
}
/** Add a single status history entry to a transit order */
function addStatusHistory(orderId, data) {
    const id = (0, uuid_1.v4)();
    const db = initDb();
    db.prepare(`INSERT INTO transit_status_history (id, transitOrderId, status, time, location, remark) VALUES (?,?,?,?,?,?)`).run(id, orderId, data.status, data.time, data.location ?? '', data.remark ?? '');
    return { id, transitOrderId: orderId, status: data.status, time: data.time, location: data.location ?? '', remark: data.remark ?? '' };
}
// ===================== Inbound Record DAO =====================
function getInboundRecords(warehouseId) {
    const db = initDb();
    if (warehouseId) {
        return db.prepare('SELECT * FROM inbound_records WHERE warehouseId = ? ORDER BY createdAt DESC').all(warehouseId);
    }
    return db.prepare('SELECT * FROM inbound_records ORDER BY createdAt DESC').all();
}
function getInboundRecordById(id) {
    const db = initDb();
    return db.prepare('SELECT * FROM inbound_records WHERE id = ?').get(id);
}
function createInboundRecord(data) {
    const id = data.id || (0, uuid_1.v4)();
    const db = initDb();
    db.prepare(`INSERT INTO inbound_records (id, warehouseId, sku, name, quantity, volume, createdAt, operator, status) VALUES (?,?,?,?,?,?,?,?,?)`).run(id, data.warehouseId, data.sku, data.name, data.quantity, data.volume, data.createdAt, data.operator, data.status);
    return { ...data, id };
}
function updateInboundRecord(id, data) {
    const db = initDb();
    const existing = db.prepare('SELECT * FROM inbound_records WHERE id = ?').get(id);
    if (!existing)
        return null;
    const updated = { ...existing, ...data, id };
    db.prepare(`UPDATE inbound_records SET warehouseId=?, sku=?, name=?, quantity=?, volume=?, createdAt=?, operator=?, status=? WHERE id=?`).run(updated.warehouseId, updated.sku, updated.name, updated.quantity, updated.volume, updated.createdAt, updated.operator, updated.status, id);
    return updated;
}
function deleteInboundRecord(id) {
    const db = initDb();
    const result = db.prepare('DELETE FROM inbound_records WHERE id = ?').run(id);
    return result.changes > 0;
}
// ===================== Outbound Record DAO =====================
function getOutboundRecords(warehouseId) {
    const db = initDb();
    if (warehouseId) {
        return db.prepare('SELECT * FROM outbound_records WHERE warehouseId = ? ORDER BY createdAt DESC').all(warehouseId);
    }
    return db.prepare('SELECT * FROM outbound_records ORDER BY createdAt DESC').all();
}
function getOutboundRecordById(id) {
    const db = initDb();
    return db.prepare('SELECT * FROM outbound_records WHERE id = ?').get(id);
}
function createOutboundRecord(data) {
    const id = data.id || (0, uuid_1.v4)();
    const db = initDb();
    db.prepare(`INSERT INTO outbound_records (id, warehouseId, sku, name, quantity, volume, createdAt, operator, destination) VALUES (?,?,?,?,?,?,?,?,?)`).run(id, data.warehouseId, data.sku, data.name, data.quantity, data.volume, data.createdAt, data.operator, data.destination);
    return { ...data, id };
}
function updateOutboundRecord(id, data) {
    const db = initDb();
    const existing = db.prepare('SELECT * FROM outbound_records WHERE id = ?').get(id);
    if (!existing)
        return null;
    const updated = { ...existing, ...data, id };
    db.prepare(`UPDATE outbound_records SET warehouseId=?, sku=?, name=?, quantity=?, volume=?, createdAt=?, operator=?, destination=? WHERE id=?`).run(updated.warehouseId, updated.sku, updated.name, updated.quantity, updated.volume, updated.createdAt, updated.operator, updated.destination, id);
    return updated;
}
function deleteOutboundRecord(id) {
    const db = initDb();
    const result = db.prepare('DELETE FROM outbound_records WHERE id = ?').run(id);
    return result.changes > 0;
}
// ===================== User Skills DAO =====================
/** Parse a UserSkillRow into a frontend-friendly shape */
function skillRowToClient(row) {
    let tags = [];
    try {
        if (row.tags)
            tags = JSON.parse(row.tags);
    }
    catch { /* ignore corrupt JSON */ }
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
        source: 'user',
        installedAt: row.installedAt,
    };
}
/** Convert frontend Skill data to DB-compatible fields */
function clientToSkillRow(data) {
    return {
        name: (data.name ?? ''),
        desc: (data.desc ?? ''),
        icon: (data.icon ?? 'Extension'),
        category: (data.category ?? 'tool'),
        path: (data.path ?? ''),
        trigger: data.trigger || null,
        detail: data.detail || null,
        tags: Array.isArray(data.tags) ? JSON.stringify(data.tags) : data.tags || null,
        status: (data.status ?? 'active'),
        version: data.version || null,
        featured: data.featured === true ? 1 : 0,
        shortcut: data.shortcut || null,
        installedAt: data.installedAt ?? Date.now(),
    };
}
function getUserSkills() {
    const db = initDb();
    const rows = db.prepare('SELECT * FROM user_skills ORDER BY installedAt DESC').all();
    return rows.map(skillRowToClient);
}
function getUserSkillById(id) {
    const db = initDb();
    const row = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(id);
    return row ? skillRowToClient(row) : undefined;
}
function createUserSkill(data) {
    const id = data.id || `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const db = initDb();
    const row = clientToSkillRow(data);
    db.prepare(`INSERT INTO user_skills (id, name, "desc", icon, category, path, trigger, detail, tags, status, version, featured, shortcut, installedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, row.name, row.desc, row.icon, row.category, row.path, row.trigger, row.detail, row.tags, row.status, row.version, row.featured, row.shortcut, row.installedAt);
    return skillRowToClient({ ...data, id, installedAt: row.installedAt });
}
function updateUserSkill(id, data) {
    const db = initDb();
    const existing = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(id);
    if (!existing)
        return null;
    const row = clientToSkillRow({ ...skillRowToClient(existing), ...data });
    db.prepare(`UPDATE user_skills SET name=?, "desc"=?, icon=?, category=?, path=?, trigger=?, detail=?, tags=?, status=?, version=?, featured=?, shortcut=?, installedAt=? WHERE id=?`).run(row.name, row.desc, row.icon, row.category, row.path, row.trigger, row.detail, row.tags, row.status, row.version, row.featured, row.shortcut, row.installedAt, id);
    return skillRowToClient({ ...data, id });
}
function deleteUserSkill(id) {
    const db = initDb();
    const result = db.prepare('DELETE FROM user_skills WHERE id = ?').run(id);
    return result.changes > 0;
}
// ===================== Builtin Status Patches DAO =====================
function getBuiltinPatches() {
    const db = initDb();
    const rows = db.prepare('SELECT * FROM builtin_status_patches').all();
    const result = {};
    for (const row of rows) {
        result[row.skillId] = row.status;
    }
    return result;
}
function setBuiltinPatch(skillId, status) {
    const db = initDb();
    db.prepare('INSERT OR REPLACE INTO builtin_status_patches (skillId, status) VALUES (?,?)').run(skillId, status);
}
function removeBuiltinPatch(skillId) {
    const db = initDb();
    const result = db.prepare('DELETE FROM builtin_status_patches WHERE skillId = ?').run(skillId);
    return result.changes > 0;
}
// ===================== App Settings DAO =====================
function getAppSettings(key) {
    const db = initDb();
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row ? row.value : null;
}
function setAppSettings(key, value) {
    const db = initDb();
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)').run(key, value);
}
function migrateData(payload) {
    const db = initDb();
    const result = { warehouses: 0, inventoryItems: 0, transitOrders: 0, userSkills: 0, builtinStatusPatches: 0, appSettings: 0 };
    const transaction = db.transaction(() => {
        // Warehouses
        if (Array.isArray(payload.warehouses) && payload.warehouses.length > 0) {
            const stmt = db.prepare(`INSERT OR REPLACE INTO warehouses (id, name, country, city, totalVolume, usedVolume, totalItems, usedItems, status, address, manager, phone, createdAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
            for (const w of payload.warehouses) {
                stmt.run(w.id, w.name, w.country ?? '', w.city ?? '', w.totalVolume ?? 0, w.usedVolume ?? 0, w.totalItems ?? 0, w.usedItems ?? 0, w.status ?? 'normal', w.address ?? '', w.manager ?? '', w.phone ?? '', w.createdAt ?? new Date().toISOString());
                result.warehouses++;
            }
        }
        // Inventory Items
        if (Array.isArray(payload.inventoryItems) && payload.inventoryItems.length > 0) {
            const stmt = db.prepare(`INSERT OR REPLACE INTO inventory_items (id, sku, name, warehouseId, quantity, volumePerUnit, totalVolume, inboundDate, valuePerUnit, totalValue, category, isAgeWarning)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
            for (const item of payload.inventoryItems) {
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
            for (const o of payload.transitOrders) {
                orderStmt.run(o.id, o.trackingNo ?? '', o.fromWarehouseId ?? '', o.toWarehouseId ?? '', o.category ?? '', o.weight ?? 0, o.volume ?? 0, o.transportMode ?? 'sea', o.estimatedArrival ?? '', o.actualArrival ?? null, o.status ?? 'dispatched', o.createdAt ?? new Date().toISOString(), o.carrier ?? '', o.value ?? 0);
                // Insert status history if present
                const history = o.statusHistory;
                if (Array.isArray(history)) {
                    for (const h of history) {
                        historyStmt.run((0, uuid_1.v4)(), o.id, h.status ?? '', h.time ?? '', h.location ?? '', h.remark ?? '');
                    }
                }
                result.transitOrders++;
            }
        }
        // User Skills
        if (Array.isArray(payload.userSkills) && payload.userSkills.length > 0) {
            const stmt = db.prepare(`INSERT OR REPLACE INTO user_skills (id, name, "desc", icon, category, path, trigger, detail, tags, status, version, featured, shortcut, installedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
            for (const s of payload.userSkills) {
                const tags = Array.isArray(s.tags) ? JSON.stringify(s.tags) : s.tags || '';
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
