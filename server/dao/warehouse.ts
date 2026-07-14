import { v4 as uuidv4 } from 'uuid';
import { createDocumentStorage } from '../storage/index.js';
import type { WarehouseRow, InventoryItemRow, TransitOrderRow, StatusHistoryRow, InboundRecordRow, OutboundRecordRow, TransferOrderRow } from '../db.js';
import { AppPaths } from '../config/appPaths.js';

const wms = createDocumentStorage();

// ===================== Warehouse DAO =====================

export function getWarehouses(): WarehouseRow[] {
  return wms.list<WarehouseRow>('warehouses').sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export function getWarehouseById(id: string): WarehouseRow | undefined {
  return wms.get<WarehouseRow>('warehouses', id);
}

export function createWarehouse(data: Omit<WarehouseRow, 'id'> & { id?: string }): WarehouseRow {
  const id = data.id || uuidv4();
  const record: WarehouseRow = {
    ...data,
    id,
    country: data.country ?? '',
    city: data.city ?? '',
    totalVolume: data.totalVolume ?? 0,
    usedVolume: data.usedVolume ?? 0,
    totalItems: data.totalItems ?? 1,
    usedItems: data.usedItems ?? 0,
    status: data.status ?? 'normal',
    address: data.address ?? '',
    manager: data.manager ?? '',
    phone: data.phone ?? '',
    createdAt: data.createdAt ?? new Date().toISOString().split('T')[0],
  };
  wms.create<WarehouseRow>('warehouses', id, record);
  return record;
}

export function updateWarehouse(id: string, data: Partial<Omit<WarehouseRow, 'id'>>): WarehouseRow | null {
  const existing = wms.get<WarehouseRow>('warehouses', id);
  if (!existing) return null;
  const safeData = { ...data };
  for (const key of ['country', 'city', 'address', 'manager', 'phone'] as const) {
    if ((safeData as Record<string, unknown>)[key] == null) {
      (safeData as Record<string, unknown>)[key] = '' as any;
    }
  }
  if ((safeData as Record<string, unknown>).status == null) {
    (safeData as Record<string, unknown>).status = 'normal';
  }
  const updated: WarehouseRow = { ...existing, ...safeData, id };
  wms.update<WarehouseRow>('warehouses', id, updated);
  return updated;
}

export function deleteWarehouse(id: string): boolean {
  return wms.delete('warehouses', id);
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
  let rows: InventoryItemRow[];
  if (warehouseId) {
    rows = wms.find<InventoryItemRow>('inventory_items', (item) => item.warehouseId === warehouseId);
  } else {
    rows = wms.list<InventoryItemRow>('inventory_items');
  }
  return rows.sort((a, b) => (a.inboundDate > b.inboundDate ? -1 : 1)).map(inventoryRowToBoolean);
}

export function getInventoryItemById(id: string): Record<string, unknown> | undefined {
  const row = wms.get<InventoryItemRow>('inventory_items', id);
  return row ? inventoryRowToBoolean(row) : undefined;
}

export function createInventoryItem(data: Record<string, unknown>): Record<string, unknown> {
  const id = (data.id as string) || uuidv4();
  const isAgeWarning = inventoryBooleanToRow(data);
  const record: InventoryItemRow = {
    id,
    sku: (data.sku as string) ?? '',
    name: (data.name as string) ?? '',
    warehouseId: (data.warehouseId as string) ?? '',
    quantity: (data.quantity as number) ?? 0,
    volumePerUnit: (data.volumePerUnit as number) ?? 0,
    totalVolume: (data.totalVolume as number) ?? 0,
    inboundDate: (data.inboundDate as string) ?? '',
    valuePerUnit: (data.valuePerUnit as number) ?? 0,
    totalValue: (data.totalValue as number) ?? 0,
    category: (data.category as string) ?? '',
    isAgeWarning,
    autoCreated: (data.autoCreated as number) ?? 0,
  };
  wms.create<InventoryItemRow>('inventory_items', id, record);
  return inventoryRowToBoolean(record);
}

export function updateInventoryItem(id: string, data: Record<string, unknown>): Record<string, unknown> | null {
  const existing = wms.get<InventoryItemRow>('inventory_items', id);
  if (!existing) return null;
  const merged: Record<string, unknown> = { ...inventoryRowToBoolean(existing), ...data, id };
  const isAgeWarning = inventoryBooleanToRow(merged);
  const updated: InventoryItemRow = {
    id,
    sku: (merged.sku as string) ?? '',
    name: (merged.name as string) ?? '',
    warehouseId: (merged.warehouseId as string) ?? '',
    quantity: (merged.quantity as number) ?? 0,
    volumePerUnit: (merged.volumePerUnit as number) ?? 0,
    totalVolume: (merged.totalVolume as number) ?? 0,
    inboundDate: (merged.inboundDate as string) ?? '',
    valuePerUnit: (merged.valuePerUnit as number) ?? 0,
    totalValue: (merged.totalValue as number) ?? 0,
    category: (merged.category as string) ?? '',
    isAgeWarning,
    autoCreated: (merged.autoCreated as number) ?? existing.autoCreated,
  };
  wms.update<InventoryItemRow>('inventory_items', id, updated);
  return { ...inventoryRowToBoolean(updated), isAgeWarning: isAgeWarning === 1 };
}

export function deleteInventoryItem(id: string): boolean {
  return wms.delete('inventory_items', id);
}

// ===================== Transit Order DAO =====================

/** Fetch status history for a given transit order */
export function getStatusHistory(orderId: string): StatusHistoryRow[] {
  return wms
    .find<StatusHistoryRow>('transit_status_history', (item) => item.transitOrderId === orderId)
    .sort((a, b) => (a.time > b.time ? 1 : -1));
}

/** Fetch all transit orders, with their statusHistory aggregated as a nested array */
export function getTransitOrders(status?: string): Record<string, unknown>[] {
  let orders = wms.list<TransitOrderRow>('transit_orders');
  if (status) {
    orders = orders.filter((o) => o.status === status);
  }
  orders = orders.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  return orders.map((order) => {
    const history = getStatusHistory(order.id);
    return {
      ...order,
      statusHistory: history.map((h) => ({
        status: h.status,
        time: h.time,
        location: h.location,
        remark: h.remark,
      })),
    };
  });
}

export function getTransitOrderById(id: string): Record<string, unknown> | undefined {
  const order = wms.get<TransitOrderRow>('transit_orders', id);
  if (!order) return undefined;
  const history = getStatusHistory(id);
  return {
    ...order,
    statusHistory: history.map((h) => ({
      status: h.status,
      time: h.time,
      location: h.location,
      remark: h.remark,
    })),
  };
}

export function createTransitOrder(data: Record<string, unknown>): Record<string, unknown> {
  const id = (data.id as string) || uuidv4();
  const record: TransitOrderRow = {
    id,
    trackingNo: (data.trackingNo as string) ?? '',
    fromWarehouseId: (data.fromWarehouseId as string) ?? '',
    toWarehouseId: (data.toWarehouseId as string) ?? '',
    category: (data.category as string) ?? '',
    weight: (data.weight as number) ?? 0,
    volume: (data.volume as number) ?? 0,
    transportMode: (data.transportMode as string) ?? 'sea',
    estimatedArrival: (data.estimatedArrival as string) ?? '',
    actualArrival: (data.actualArrival as string | null) ?? null,
    status: (data.status as string) ?? 'dispatched',
    createdAt: (data.createdAt as string) ?? new Date().toISOString(),
    carrier: (data.carrier as string) ?? '',
    value: (data.value as number) ?? 0,
  };
  wms.create<TransitOrderRow>('transit_orders', id, record);

  const statusHistory = data.statusHistory as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(statusHistory) && statusHistory.length > 0) {
    for (const h of statusHistory) {
      const hId = uuidv4();
      wms.create<StatusHistoryRow>('transit_status_history', hId, {
        id: hId,
        transitOrderId: id,
        status: (h.status as string) ?? '',
        time: (h.time as string) ?? '',
        location: (h.location as string) ?? '',
        remark: (h.remark as string) ?? '',
      });
    }
  }
  return getTransitOrderById(id)!;
}

export function updateTransitOrder(id: string, data: Record<string, unknown>): Record<string, unknown> | null {
  const existing = wms.get<TransitOrderRow>('transit_orders', id);
  if (!existing) return null;
  const merged: TransitOrderRow = { ...existing, ...data, id } as TransitOrderRow;
  wms.update<TransitOrderRow>('transit_orders', id, merged);

  const statusHistory = data.statusHistory as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(statusHistory)) {
    // Delete existing history for this order
    const allHistory = wms.list<StatusHistoryRow>('transit_status_history');
    const remaining = allHistory.filter((h) => h.transitOrderId !== id);
    wms.list<StatusHistoryRow>('transit_status_history'); // trigger read
    // rewrite all history
    const fileData = { items: remaining, lastId: undefined as number | undefined };
    // read current lastId
    const raw = JSON.parse(
      require('fs').readFileSync(require('path').join(AppPaths.wmsDataDir, 'transit_status_history.json'), 'utf-8') || '{"items":[]}'
    ) as { items: StatusHistoryRow[]; lastId?: number };
    fileData.lastId = raw.lastId;
    for (const h of statusHistory) {
      const hId = uuidv4();
      fileData.items.push({
        id: hId,
        transitOrderId: id,
        status: (h.status as string) ?? '',
        time: (h.time as string) ?? '',
        location: (h.location as string) ?? '',
        remark: (h.remark as string) ?? '',
      });
    }
    require('fs').writeFileSync(
      require('path').join(AppPaths.wmsDataDir, 'transit_status_history.json'),
      JSON.stringify(fileData, null, 2) + '\n',
      'utf-8'
    );
  }
  return getTransitOrderById(id)!;
}

export function deleteTransitOrder(id: string): boolean {
  // Delete related status history first
  const allHistory = wms.list<StatusHistoryRow>('transit_status_history');
  const remaining = allHistory.filter((h) => h.transitOrderId !== id);
  const raw = JSON.parse(
    require('fs').readFileSync(require('path').join(AppPaths.wmsDataDir, 'transit_status_history.json'), 'utf-8') || '{"items":[]}'
  ) as { items: StatusHistoryRow[]; lastId?: number };
  require('fs').writeFileSync(
    require('path').join(AppPaths.wmsDataDir, 'transit_status_history.json'),
    JSON.stringify({ items: remaining, lastId: raw.lastId }, null, 2) + '\n',
    'utf-8'
  );
  return wms.delete('transit_orders', id);
}

/** Add a single status history entry to a transit order */
export function addStatusHistory(orderId: string, data: { status: string; time: string; location?: string; remark?: string }): StatusHistoryRow {
  const id = uuidv4();
  const record: StatusHistoryRow = {
    id,
    transitOrderId: orderId,
    status: data.status,
    time: data.time,
    location: data.location ?? '',
    remark: data.remark ?? '',
  };
  wms.create<StatusHistoryRow>('transit_status_history', id, record);
  return record;
}

// ===================== Inbound Record DAO =====================

export function getInboundRecords(warehouseId?: string, startDate?: string, endDate?: string): InboundRecordRow[] {
  let rows = wms.list<InboundRecordRow>('inbound_records');
  if (warehouseId) {
    rows = rows.filter((r) => r.warehouseId === warehouseId);
  }
  if (startDate) {
    rows = rows.filter((r) => r.createdAt >= startDate);
  }
  if (endDate) {
    const end = endDate + 'T23:59:59.999Z';
    rows = rows.filter((r) => r.createdAt <= end);
  }
  return rows.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export function getInboundRecordById(id: string): InboundRecordRow | undefined {
  return wms.get<InboundRecordRow>('inbound_records', id);
}

export function createInboundRecord(data: Omit<InboundRecordRow, 'id'> & { id?: string }): InboundRecordRow {
  const id = data.id || uuidv4();
  const record: InboundRecordRow = {
    ...data,
    id,
    supplier: data.supplier ?? '',
    batchNo: data.batchNo ?? '',
    supplier_id: data.supplier_id ?? null,
  };
  wms.create<InboundRecordRow>('inbound_records', id, record);
  return record;
}

export function updateInboundRecord(id: string, data: Partial<Omit<InboundRecordRow, 'id'>>): InboundRecordRow | null {
  const existing = wms.get<InboundRecordRow>('inbound_records', id);
  if (!existing) return null;
  const updated: InboundRecordRow = {
    ...existing,
    ...data,
    id,
    supplier: data.supplier ?? existing.supplier ?? '',
    batchNo: data.batchNo ?? existing.batchNo ?? '',
    supplier_id: data.supplier_id ?? existing.supplier_id ?? null,
  };
  wms.update<InboundRecordRow>('inbound_records', id, updated);
  return updated;
}

export function deleteInboundRecord(id: string): boolean {
  return wms.delete('inbound_records', id);
}

// ===================== Outbound Record DAO =====================

export function getOutboundRecords(warehouseId?: string, startDate?: string, endDate?: string): OutboundRecordRow[] {
  let rows = wms.list<OutboundRecordRow>('outbound_records');
  if (warehouseId) {
    rows = rows.filter((r) => r.warehouseId === warehouseId);
  }
  if (startDate) {
    rows = rows.filter((r) => r.createdAt >= startDate);
  }
  if (endDate) {
    const end = endDate + 'T23:59:59.999Z';
    rows = rows.filter((r) => r.createdAt <= end);
  }
  return rows.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export function getOutboundRecordById(id: string): OutboundRecordRow | undefined {
  return wms.get<OutboundRecordRow>('outbound_records', id);
}

export function createOutboundRecord(data: Omit<OutboundRecordRow, 'id'> & { id?: string }): OutboundRecordRow {
  const id = data.id || uuidv4();
  const record: OutboundRecordRow = {
    ...data,
    id,
    customer: data.customer ?? '',
    orderNo: data.orderNo ?? '',
    customer_id: data.customer_id ?? null,
  };
  wms.create<OutboundRecordRow>('outbound_records', id, record);
  return record;
}

export function updateOutboundRecord(id: string, data: Partial<Omit<OutboundRecordRow, 'id'>>): OutboundRecordRow | null {
  const existing = wms.get<OutboundRecordRow>('outbound_records', id);
  if (!existing) return null;
  const updated: OutboundRecordRow = {
    ...existing,
    ...data,
    id,
    customer: data.customer ?? existing.customer ?? '',
    orderNo: data.orderNo ?? existing.orderNo ?? '',
    customer_id: data.customer_id ?? existing.customer_id ?? null,
  };
  wms.update<OutboundRecordRow>('outbound_records', id, updated);
  return updated;
}

export function deleteOutboundRecord(id: string): boolean {
  return wms.delete('outbound_records', id);
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
  const { status, fromWarehouseId, toWarehouseId, sku, page = 1, pageSize = 20 } = params ?? {};

  let items = wms.list<TransferOrderRow>('transfer_orders');

  if (status) {
    items = items.filter((i) => i.status === status);
  }
  if (fromWarehouseId) {
    items = items.filter((i) => i.fromWarehouseId === fromWarehouseId);
  }
  if (toWarehouseId) {
    items = items.filter((i) => i.toWarehouseId === toWarehouseId);
  }
  if (sku) {
    items = items.filter((i) => i.sku.includes(sku));
  }

  const total = items.length;
  items = items.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  const offset = (page - 1) * pageSize;
  items = items.slice(offset, offset + pageSize);

  return { items, total };
}

/** Get a single transfer order by ID */
export function getTransferOrderById(id: string): TransferOrderRow | undefined {
  return wms.get<TransferOrderRow>('transfer_orders', id);
}

/** Create a new transfer order */
export function createTransferOrder(data: Omit<TransferOrderRow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): TransferOrderRow {
  const id = data.id || uuidv4();
  const now = new Date().toISOString();
  const record: TransferOrderRow = {
    id,
    transferNo: data.transferNo ?? '',
    fromWarehouseId: data.fromWarehouseId,
    toWarehouseId: data.toWarehouseId,
    sku: data.sku,
    name: data.name ?? '',
    quantity: data.quantity ?? 0,
    volume: data.volume ?? 0,
    status: data.status ?? 'draft',
    transitOrderId: data.transitOrderId ?? null,
    createdBy: data.createdBy ?? '',
    submittedAt: data.submittedAt ?? null,
    submittedBy: data.submittedBy ?? null,
    receivedAt: data.receivedAt ?? null,
    receivedBy: data.receivedBy ?? null,
    completedAt: data.completedAt ?? null,
    completedBy: data.completedBy ?? null,
    remark: data.remark ?? '',
    createdAt: now,
    updatedAt: now,
  };
  wms.create<TransferOrderRow>('transfer_orders', id, record);
  return record;
}

/** Update a transfer order (only draft status should be updatable) */
export function updateTransferOrder(id: string, data: Partial<Omit<TransferOrderRow, 'id' | 'createdAt'>>): TransferOrderRow | null {
  const existing = wms.get<TransferOrderRow>('transfer_orders', id);
  if (!existing) return null;
  const updated: TransferOrderRow = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
  wms.update<TransferOrderRow>('transfer_orders', id, updated);
  return updated;
}

/** Delete a transfer order (only draft status should be deletable) */
export function deleteTransferOrder(id: string): boolean {
  return wms.delete('transfer_orders', id);
}
