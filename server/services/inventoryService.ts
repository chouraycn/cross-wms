/**
 * Inventory Service — Transactional business logic for inbound and outbound operations.
 *
 * All write operations are wrapped in better-sqlite3 transactions to ensure
 * atomicity across inventory_items, inbound_records/outbound_records, and
 * inventory_transactions tables.
 */
import { v4 as uuidv4 } from 'uuid';
import {
  initDb,
  type InboundRecordRow,
  type OutboundRecordRow,
  type InventoryItemRow,
  type InventoryTransactionRow,
} from '../db.js';
import * as txnDao from '../dao/inventoryTransactionDao.js';

// ===================== Input Types =====================

export interface CreateInboundData {
  warehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  volume: number;
  operator: string;
  status: string;
  supplier: string;
  batchNo: string;
  /** v1.4.0: partner FK for supplier */
  supplier_id?: string;
  /** Optional: volumePerUnit for auto-created inventory item */
  volumePerUnit?: number;
  /** Optional: valuePerUnit for auto-created inventory item */
  valuePerUnit?: number;
  /** Optional: category for auto-created inventory item */
  category?: string;
  remark?: string;
}

export interface CreateOutboundData {
  warehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  volume: number;
  operator: string;
  destination: string;
  customer: string;
  orderNo: string;
  /** v1.4.0: partner FK for customer */
  customer_id?: string;
  remark?: string;
}

// ===================== Result Types =====================

export interface CreateInboundResult {
  inboundRecord: InboundRecordRow;
  inventoryItem: InventoryItemRow;
  transaction: InventoryTransactionRow;
}

export interface CreateOutboundResult {
  outboundRecord: OutboundRecordRow;
  inventoryItem: InventoryItemRow;
  transaction: InventoryTransactionRow;
}

// ===================== Service Methods =====================

/**
 * Create an inbound record with transactional inventory update.
 *
 * Within a single DB transaction:
 * 1. Find or auto-create the inventory_item (sku + warehouseId)
 * 2. Increment the inventory_item quantity
 * 3. Insert an inbound_record row
 * 4. Insert an inventory_transactions audit row
 */
export function createInbound(data: CreateInboundData): CreateInboundResult {
  const db = initDb();

  const execute = db.transaction(() => {
    const now = new Date().toISOString();

    // 1. Find or create inventory item
    let item = db.prepare(
      'SELECT * FROM inventory_items WHERE sku = ? AND warehouseId = ?'
    ).get(data.sku, data.warehouseId) as InventoryItemRow | undefined;

    if (!item) {
      // Auto-create inventory item
      const itemId = uuidv4();
      db.prepare(
        `INSERT INTO inventory_items (id, sku, name, warehouseId, quantity, volumePerUnit, totalVolume, inboundDate, valuePerUnit, totalValue, category, isAgeWarning, autoCreated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        itemId,
        data.sku,
        data.name,
        data.warehouseId,
        0, // quantity starts at 0, will be incremented below
        data.volumePerUnit ?? 0,
        0, // totalVolume starts at 0
        now,
        data.valuePerUnit ?? 0,
        0, // totalValue starts at 0
        data.category ?? '',
        0,
        1  // autoCreated = 1
      );
      item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId) as InventoryItemRow;
    }

    // 2. Update inventory quantity and derived fields
    const newQuantity = item.quantity + data.quantity;
    const newTotalVolume = newQuantity * item.volumePerUnit;
    const newTotalValue = newQuantity * item.valuePerUnit;
    db.prepare(
      `UPDATE inventory_items SET quantity = ?, totalVolume = ?, totalValue = ?, inboundDate = ? WHERE id = ?`
    ).run(newQuantity, newTotalVolume, newTotalValue, now, item.id);

    const updatedItem = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item.id) as InventoryItemRow;

    // 3. Insert inbound record
    const recordId = uuidv4();
    db.prepare(
      `INSERT INTO inbound_records (id, warehouseId, sku, name, quantity, volume, createdAt, operator, status, supplier, batchNo, supplier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      recordId,
      data.warehouseId,
      data.sku,
      data.name,
      data.quantity,
      data.volume,
      now,
      data.operator,
      data.status,
      data.supplier ?? '',
      data.batchNo ?? '',
      data.supplier_id ?? null
    );

    const inboundRecord = db.prepare('SELECT * FROM inbound_records WHERE id = ?').get(recordId) as InboundRecordRow;

    // 4. Insert inventory transaction audit record
    const transaction = txnDao.insert({
      sku: data.sku,
      type: 'inbound',
      quantity: data.quantity,
      warehouseId: data.warehouseId,
      operator: data.operator,
      sourceId: recordId,
      sourceType: 'inbound_record',
      remark: data.remark ?? '',
    });

    return { inboundRecord, inventoryItem: updatedItem, transaction };
  });

  return execute();
}

/**
 * Create an outbound record with transactional inventory deduction.
 *
 * Within a single DB transaction:
 * 1. Find the inventory_item (sku + warehouseId) — must exist with sufficient stock
 * 2. Decrement the inventory_item quantity
 * 3. Insert an outbound_record row
 * 4. Insert an inventory_transactions audit row
 *
 * @throws Error "库存不足" if the item does not exist or has insufficient quantity
 */
export function createOutbound(data: CreateOutboundData): CreateOutboundResult {
  const db = initDb();

  const execute = db.transaction(() => {
    const now = new Date().toISOString();

    // 1. Find inventory item
    const item = db.prepare(
      'SELECT * FROM inventory_items WHERE sku = ? AND warehouseId = ?'
    ).get(data.sku, data.warehouseId) as InventoryItemRow | undefined;

    if (!item || item.quantity < data.quantity) {
      throw new Error('库存不足');
    }

    // 2. Deduct inventory quantity and update derived fields
    const newQuantity = item.quantity - data.quantity;
    const newTotalVolume = newQuantity * item.volumePerUnit;
    const newTotalValue = newQuantity * item.valuePerUnit;
    db.prepare(
      `UPDATE inventory_items SET quantity = ?, totalVolume = ?, totalValue = ? WHERE id = ?`
    ).run(newQuantity, newTotalVolume, newTotalValue, item.id);

    const updatedItem = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item.id) as InventoryItemRow;

    // 3. Insert outbound record
    const recordId = uuidv4();
    db.prepare(
      `INSERT INTO outbound_records (id, warehouseId, sku, name, quantity, volume, createdAt, operator, destination, customer, orderNo, customer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      recordId,
      data.warehouseId,
      data.sku,
      data.name,
      data.quantity,
      data.volume,
      now,
      data.operator,
      data.destination,
      data.customer ?? '',
      data.orderNo ?? '',
      data.customer_id ?? null
    );

    const outboundRecord = db.prepare('SELECT * FROM outbound_records WHERE id = ?').get(recordId) as OutboundRecordRow;

    // 4. Insert inventory transaction audit record
    const transaction = txnDao.insert({
      sku: data.sku,
      type: 'outbound',
      quantity: data.quantity,
      warehouseId: data.warehouseId,
      operator: data.operator,
      sourceId: recordId,
      sourceType: 'outbound_record',
      remark: data.remark ?? '',
    });

    return { outboundRecord, inventoryItem: updatedItem, transaction };
  });

  return execute();
}
