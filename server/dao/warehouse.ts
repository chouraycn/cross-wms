import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db.js';
import type { WarehouseRow, InventoryItemRow, TransitOrderRow, StatusHistoryRow, InboundRecordRow, OutboundRecordRow, TransferOrderRow } from '../db.js';

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
