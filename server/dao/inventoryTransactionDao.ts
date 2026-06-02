/**
 * Inventory Transaction Data Access Object
 *
 * Provides CRUD and query operations for the inventory_transactions table.
 */
import { initDb, type InventoryTransactionRow } from '../db.js';

/** Parameters for querying inventory transactions with pagination and filters */
export interface InventoryTransactionQueryParams {
  type?: string;
  warehouseId?: string;
  startDate?: string;
  endDate?: string;
  sku?: string;
  page?: number;
  pageSize?: number;
}

/** Insert a new inventory transaction record */
export function insert(transaction: Omit<InventoryTransactionRow, 'id' | 'createdAt'>): InventoryTransactionRow {
  const db = initDb();
  const stmt = db.prepare(
    `INSERT INTO inventory_transactions (sku, type, quantity, warehouseId, operator, sourceId, sourceType, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    transaction.sku,
    transaction.type,
    transaction.quantity,
    transaction.warehouseId,
    transaction.operator ?? '',
    transaction.sourceId ?? '',
    transaction.sourceType ?? '',
    transaction.remark ?? ''
  );
  const row = db.prepare('SELECT * FROM inventory_transactions WHERE id = ?').get(info.lastInsertRowid) as InventoryTransactionRow;
  return row;
}

/** Query inventory transactions with filters and pagination */
export function findByQuery(params: InventoryTransactionQueryParams): InventoryTransactionRow[] {
  const db = initDb();
  const { type, warehouseId, startDate, endDate, sku, page = 1, pageSize = 20 } = params;

  let sql = 'SELECT * FROM inventory_transactions WHERE 1=1';
  const queryParams: unknown[] = [];

  if (type) {
    sql += ' AND type = ?';
    queryParams.push(type);
  }
  if (warehouseId) {
    sql += ' AND warehouseId = ?';
    queryParams.push(warehouseId);
  }
  if (startDate) {
    sql += ' AND createdAt >= ?';
    queryParams.push(startDate);
  }
  if (endDate) {
    sql += ' AND createdAt <= ?';
    queryParams.push(endDate + 'T23:59:59.999Z');
  }
  if (sku) {
    sql += ' AND sku LIKE ?';
    queryParams.push(`%${sku}%`);
  }

  sql += ' ORDER BY createdAt DESC';

  const offset = (page - 1) * pageSize;
  sql += ' LIMIT ? OFFSET ?';
  queryParams.push(pageSize, offset);

  return db.prepare(sql).all(...queryParams) as InventoryTransactionRow[];
}

/** Count inventory transactions matching the given filters (without pagination) */
export function countByQuery(params: Omit<InventoryTransactionQueryParams, 'page' | 'pageSize'>): number {
  const db = initDb();
  const { type, warehouseId, startDate, endDate, sku } = params;

  let sql = 'SELECT COUNT(*) as total FROM inventory_transactions WHERE 1=1';
  const queryParams: unknown[] = [];

  if (type) {
    sql += ' AND type = ?';
    queryParams.push(type);
  }
  if (warehouseId) {
    sql += ' AND warehouseId = ?';
    queryParams.push(warehouseId);
  }
  if (startDate) {
    sql += ' AND createdAt >= ?';
    queryParams.push(startDate);
  }
  if (endDate) {
    sql += ' AND createdAt <= ?';
    queryParams.push(endDate + 'T23:59:59.999Z');
  }
  if (sku) {
    sql += ' AND sku LIKE ?';
    queryParams.push(`%${sku}%`);
  }

  const row = db.prepare(sql).get(...queryParams) as { total: number };
  return row.total;
}
