/**
 * Transfer Order Service — Transactional business logic for warehouse transfer operations.
 *
 * Core flow: draft → submitted (outbound deduction) → in_transit (bind transit, optional) → completed (inbound addition)
 *
 * All write operations are wrapped in better-sqlite3 transactions to ensure
 * atomicity across transfer_orders, inventory_items, and inventory_transactions tables.
 */
import { v4 as uuidv4 } from 'uuid';
import {
  initDb,
  getTransferOrderById as dbGetById,
  createTransferOrder as dbCreate,
  updateTransferOrder as dbUpdate,
  type TransferOrderRow,
  type InventoryItemRow,
} from '../db.js';
import * as txnDao from '../dao/inventoryTransactionDao.js';

// ===================== Helper =====================

/** Generate a transfer order number: TF-YYYYMMDD-XXXX */
export function generateTransferNo(): string {
  const now = new Date();
  const dateStr = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `TF-${dateStr}-${seq}`;
}

// ===================== Submit (Outbound Deduction) =====================

/**
 * Submit a draft transfer order — deducts inventory from the source warehouse.
 *
 * Within a single DB transaction:
 * 1. Verify transfer order exists and is in 'draft' status
 * 2. Verify source warehouse has sufficient inventory
 * 3. Deduct inventory from source warehouse
 * 4. Insert inventory_transactions audit row (type='transfer_out')
 * 5. Update transfer order status to 'submitted'
 *
 * @throws Error if order not found, not in draft status, or insufficient inventory
 */
export function submit(id: string, submittedBy: string): TransferOrderRow {
  const db = initDb();

  const execute = db.transaction(() => {
    const now = new Date().toISOString();

    // 1. Verify transfer order exists and is draft
    const order = db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow | undefined;
    if (!order) throw new Error('调拨单不存在');
    if (order.status !== 'draft') throw new Error('只有草稿状态的调拨单可以提交');

    // 2. Verify source warehouse has sufficient inventory
    const item = db.prepare(
      'SELECT * FROM inventory_items WHERE sku = ? AND warehouseId = ?'
    ).get(order.sku, order.fromWarehouseId) as InventoryItemRow | undefined;

    if (!item || item.quantity < order.quantity) {
      throw new Error('出库仓库存不足');
    }

    // 3. Deduct inventory from source warehouse
    const newQuantity = item.quantity - order.quantity;
    const newTotalVolume = newQuantity * item.volumePerUnit;
    const newTotalValue = newQuantity * item.valuePerUnit;
    db.prepare(
      'UPDATE inventory_items SET quantity = ?, totalVolume = ?, totalValue = ? WHERE id = ?'
    ).run(newQuantity, newTotalVolume, newTotalValue, item.id);

    // 4. Insert inventory transaction audit record
    txnDao.insert({
      sku: order.sku,
      type: 'transfer_out',
      quantity: order.quantity,
      warehouseId: order.fromWarehouseId,
      operator: submittedBy,
      sourceId: order.id,
      sourceType: 'transfer_order',
      remark: `调拨出库: ${order.transferNo || order.id}`,
    });

    // 5. Update transfer order status
    db.prepare(
      `UPDATE transfer_orders SET status = 'submitted', submittedAt = ?, submittedBy = ?, updatedAt = ? WHERE id = ?`
    ).run(now, submittedBy, now, id);

    return db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow;
  });

  return execute();
}

// ===================== Receive (Inbound Addition) =====================

/**
 * Confirm receipt of a transfer order — adds inventory to the destination warehouse.
 *
 * Within a single DB transaction:
 * 1. Verify transfer order exists and is in 'submitted' or 'in_transit' status
 * 2. Find or auto-create inventory_item at destination warehouse
 * 3. Add inventory to destination warehouse
 * 4. Insert inventory_transactions audit row (type='transfer_in')
 * 5. Update transfer order status to 'completed'
 *
 * @throws Error if order not found or not in receivable status
 */
export function receive(id: string, receivedBy: string): TransferOrderRow {
  const db = initDb();

  const execute = db.transaction(() => {
    const now = new Date().toISOString();

    // 1. Verify transfer order exists and is in receivable status
    const order = db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow | undefined;
    if (!order) throw new Error('调拨单不存在');
    if (order.status !== 'submitted' && order.status !== 'in_transit') {
      throw new Error('只有已提交或在途状态的调拨单可以确认收货');
    }

    // 2. Find or auto-create inventory item at destination
    let item = db.prepare(
      'SELECT * FROM inventory_items WHERE sku = ? AND warehouseId = ?'
    ).get(order.sku, order.toWarehouseId) as InventoryItemRow | undefined;

    if (!item) {
      // Auto-create inventory item at destination warehouse
      const itemId = uuidv4();
      // Read volumePerUnit from source item if available
      const sourceItem = db.prepare(
        'SELECT * FROM inventory_items WHERE sku = ? AND warehouseId = ?'
      ).get(order.sku, order.fromWarehouseId) as InventoryItemRow | undefined;

      const volumePerUnit = sourceItem?.volumePerUnit ?? (order.quantity > 0 ? order.volume / order.quantity : 0);
      const valuePerUnit = sourceItem?.valuePerUnit ?? 0;
      const category = sourceItem?.category ?? '';

      db.prepare(
        `INSERT INTO inventory_items (id, sku, name, warehouseId, quantity, volumePerUnit, totalVolume, inboundDate, valuePerUnit, totalValue, category, isAgeWarning, autoCreated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        itemId, order.sku, order.name, order.toWarehouseId,
        0, // quantity starts at 0, will be incremented below
        volumePerUnit,
        0, // totalVolume starts at 0
        now,
        valuePerUnit,
        0, // totalValue starts at 0
        category,
        0,
        1  // autoCreated = 1
      );
      item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId) as InventoryItemRow;
    }

    // 3. Add inventory to destination warehouse
    const newQuantity = item.quantity + order.quantity;
    const newTotalVolume = newQuantity * item.volumePerUnit;
    const newTotalValue = newQuantity * item.valuePerUnit;
    db.prepare(
      'UPDATE inventory_items SET quantity = ?, totalVolume = ?, totalValue = ?, inboundDate = ? WHERE id = ?'
    ).run(newQuantity, newTotalVolume, newTotalValue, now, item.id);

    // 4. Insert inventory transaction audit record
    txnDao.insert({
      sku: order.sku,
      type: 'transfer_in',
      quantity: order.quantity,
      warehouseId: order.toWarehouseId,
      operator: receivedBy,
      sourceId: order.id,
      sourceType: 'transfer_order',
      remark: `调拨入库: ${order.transferNo || order.id}`,
    });

    // 5. Update transfer order status to completed
    db.prepare(
      `UPDATE transfer_orders SET status = 'completed', receivedAt = ?, receivedBy = ?, completedAt = ?, completedBy = ?, updatedAt = ? WHERE id = ?`
    ).run(now, receivedBy, now, receivedBy, now, id);

    return db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow;
  });

  return execute();
}

// ===================== Bind / Unbind Transit =====================

/**
 * Bind a transit order to a transfer order and update status to 'in_transit'.
 *
 * Validates that:
 * - Transfer order exists and is in 'submitted' status
 * - Transit order exists and from/to warehouses match
 *
 * @throws Error if validation fails
 */
export function bindTransit(id: string, transitOrderId: string): TransferOrderRow {
  const db = initDb();

  const execute = db.transaction(() => {
    const now = new Date().toISOString();

    // 1. Verify transfer order exists and is submitted
    const order = db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow | undefined;
    if (!order) throw new Error('调拨单不存在');
    if (order.status !== 'submitted') throw new Error('只有已提交状态的调拨单可以绑定物流');

    // 2. Verify transit order exists and warehouses match
    const transitOrder = db.prepare('SELECT * FROM transit_orders WHERE id = ?').get(transitOrderId) as { id: string; fromWarehouseId: string; toWarehouseId: string; trackingNo: string } | undefined;
    if (!transitOrder) throw new Error('物流单不存在');
    if (transitOrder.fromWarehouseId !== order.fromWarehouseId || transitOrder.toWarehouseId !== order.toWarehouseId) {
      throw new Error('物流单的起止仓库与调拨单不匹配');
    }

    // 3. Bind transit order and update status
    db.prepare(
      `UPDATE transfer_orders SET transitOrderId = ?, status = 'in_transit', updatedAt = ? WHERE id = ?`
    ).run(transitOrderId, now, id);

    return db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow;
  });

  return execute();
}

/**
 * Unbind a transit order from a transfer order and revert status to 'submitted'.
 *
 * @throws Error if order not found or not in 'in_transit' status
 */
export function unbindTransit(id: string): TransferOrderRow {
  const db = initDb();

  const execute = db.transaction(() => {
    const now = new Date().toISOString();

    const order = db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow | undefined;
    if (!order) throw new Error('调拨单不存在');
    if (order.status !== 'in_transit') throw new Error('只有在途状态的调拨单可以解绑物流');

    db.prepare(
      `UPDATE transfer_orders SET transitOrderId = NULL, status = 'submitted', updatedAt = ? WHERE id = ?`
    ).run(now, id);

    return db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(id) as TransferOrderRow;
  });

  return execute();
}
