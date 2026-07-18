/**
 * Transfer Service
 *
 * 库存调拨服务，负责创建调拨单、执行调拨、查询调拨记录。
 * 核心流程：创建调拨单 → 提交（出库扣减）→ 收货（入库增加）→ 记录调拨历史
 *
 * v10.0: 改为使用 DAO 层（warehouse.ts）操作库存数据
 */

import type { TransferOrderRow } from '../db.js';
import { logger } from '../logger.js';
import {
  getTransferOrderById,
  getTransferOrders,
  updateTransferOrder,
  createOutboundRecord,
  createInboundRecord,
  getInventoryItems,
  updateInventoryItem,
  createInventoryItem,
} from '../dao/warehouse.js';

// ===================== 常量定义 =====================

/** 调拨单号前缀 */
const TRANSFER_NO_PREFIX = 'TF';

// ===================== 工具函数 =====================

/**
 * 获取当前时间戳（ISO 格式）
 */
function now(): string {
  return new Date().toISOString();
}

// ===================== 核心函数 =====================

/**
 * 生成调拨单号
 * 格式：TF + 日期 + 4位序号
 */
export function generateTransferNo(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  // 查询所有调拨单，在 JavaScript 中筛选当日最大序号
  const { items } = getTransferOrders({ page: 1, pageSize: 1000 });
  const todayOrders = items.filter((o) => o.transferNo.startsWith(`${TRANSFER_NO_PREFIX}${dateStr}`));

  let seq = 1;
  if (todayOrders.length > 0) {
    const maxNo = todayOrders
      .map((o) => o.transferNo)
      .sort()
      .pop();
    if (maxNo) {
      const match = maxNo.match(/(\d{4})$/);
      if (match) {
        seq = parseInt(match[1], 10) + 1;
      }
    }
  }

  return `${TRANSFER_NO_PREFIX}${dateStr}${String(seq).padStart(4, '0')}`;
}

/**
 * 提交调拨单（出库扣减）
 *
 * 流程：
 * 1. 查询调拨单（状态必须为 draft）
 * 2. 源仓库出库（扣减库存）
 * 3. 创建出库记录
 * 4. 更新调拨单状态为 submitted
 *
 * @param id 调拨单 ID
 * @param submittedBy 提交人
 * @returns 更新后的调拨单
 */
export function submit(id: string, submittedBy: string): TransferOrderRow {
  // 1. 查询调拨单
  const transfer = getTransferOrderById(id);

  if (!transfer) {
    throw new Error(`调拨单 ${id} 不存在`);
  }

  if (transfer.status !== 'draft') {
    throw new Error(`调拨单状态为 ${transfer.status}，无法提交`);
  }

  // 2. 源仓库出库（扣减库存）
  const allItems = getInventoryItems(transfer.fromWarehouseId) as Array<Record<string, unknown>>;
  const fromInventory = allItems.find(
    (i) => i.sku === transfer.sku
  ) as { id: string; quantity: number } | undefined;

  if (!fromInventory) {
    throw new Error(`商品 ${transfer.sku} 在源仓库不存在`);
  }

  if (fromInventory.quantity < transfer.quantity) {
    throw new Error(
      `库存不足：源仓库当前库存 ${fromInventory.quantity}，需要调拨 ${transfer.quantity}`
    );
  }

  const newQuantity = fromInventory.quantity - transfer.quantity;
  const fromItem = allItems.find((i) => i.sku === transfer.sku) as Record<string, unknown>;
  const valuePerUnit = (fromItem.valuePerUnit as number) ?? 0;
  const newTotalValue = valuePerUnit * newQuantity;

  updateInventoryItem(fromInventory.id, {
    quantity: newQuantity,
    totalValue: newTotalValue,
    inboundDate: now(),
  });

  // 3. 创建出库记录
  createOutboundRecord({
    warehouseId: transfer.fromWarehouseId,
    sku: transfer.sku,
    name: transfer.name,
    quantity: transfer.quantity,
    volume: transfer.volume,
    createdAt: now(),
    operator: submittedBy,
    destination: transfer.toWarehouseId,
    customer: '',
    orderNo: transfer.transferNo,
    customer_id: null,
  });

  // 4. 更新调拨单状态
  const updated = updateTransferOrder(id, {
    status: 'submitted',
    submittedAt: now(),
    submittedBy,
  });

  if (!updated) {
    throw new Error(`更新调拨单 ${id} 失败`);
  }

  logger.info(
    `[Transfer] 提交调拨单: id=${id}, sku=${transfer.sku}, from=${transfer.fromWarehouseId}, to=${transfer.toWarehouseId}, quantity=${transfer.quantity}`
  );

  return updated as TransferOrderRow;
}

/**
 * 确认收货（入库增加）
 *
 * 流程：
 * 1. 查询调拨单（状态必须为 submitted）
 * 2. 目标仓库入库（增加库存）
 * 3. 创建入库记录
 * 4. 更新调拨单状态为 completed
 *
 * @param id 调拨单 ID
 * @param receivedBy 收货人
 * @returns 更新后的调拨单
 */
export function receive(id: string, receivedBy: string): TransferOrderRow {
  // 1. 查询调拨单
  const transfer = getTransferOrderById(id);

  if (!transfer) {
    throw new Error(`调拨单 ${id} 不存在`);
  }

  if (transfer.status !== 'submitted') {
    throw new Error(`调拨单状态为 ${transfer.status}，无法收货`);
  }

  // 2. 目标仓库入库（增加库存）
  const toItems = getInventoryItems(transfer.toWarehouseId) as Array<Record<string, unknown>>;
  const toInventory = toItems.find(
    (i) => i.sku === transfer.sku
  ) as { id: string; quantity: number; valuePerUnit: number } | undefined;

  if (toInventory) {
    // 已有库存，增加数量
    const newQuantity = toInventory.quantity + transfer.quantity;
    const newTotalValue = (toInventory.valuePerUnit || 0) * newQuantity;

    updateInventoryItem(toInventory.id, {
      quantity: newQuantity,
      totalValue: newTotalValue,
      inboundDate: now(),
    });
  } else {
    // 新库存，需要复制商品信息
    const fromItems = getInventoryItems(transfer.fromWarehouseId) as Array<Record<string, unknown>>;
    const sourceItem = fromItems.find((i) => i.sku === transfer.sku);

    if (sourceItem) {
      const valuePerUnit = (sourceItem.valuePerUnit as number) ?? 0;
      createInventoryItem({
        sku: sourceItem.sku as string,
        name: sourceItem.name as string,
        warehouseId: transfer.toWarehouseId,
        quantity: transfer.quantity,
        valuePerUnit,
        totalValue: valuePerUnit * transfer.quantity,
        totalVolume: (sourceItem.totalVolume as number) ?? 0,
        inboundDate: now(),
        volumePerUnit: (sourceItem.volumePerUnit as number) ?? 0,
        category: (sourceItem.category as string) ?? '',
        autoCreated: 1,
      });
    }
  }

  // 3. 创建入库记录
  createInboundRecord({
    warehouseId: transfer.toWarehouseId,
    sku: transfer.sku,
    name: transfer.name,
    quantity: transfer.quantity,
    volume: transfer.volume,
    createdAt: now(),
    operator: receivedBy,
    status: 'completed',
    supplier: transfer.fromWarehouseId,
    batchNo: transfer.transferNo,
    supplier_id: null,
  });

  // 4. 更新调拨单状态
  const updated = updateTransferOrder(id, {
    status: 'completed',
    receivedAt: now(),
    receivedBy,
    completedAt: now(),
    completedBy: receivedBy,
  });

  if (!updated) {
    throw new Error(`更新调拨单 ${id} 失败`);
  }

  logger.info(
    `[Transfer] 确认收货: id=${id}, sku=${transfer.sku}, to=${transfer.toWarehouseId}, quantity=${transfer.quantity}`
  );

  return updated as TransferOrderRow;
}

/**
 * 绑定物流单
 *
 * @param id 调拨单 ID
 * @param transitOrderId 物流单 ID
 * @returns 更新后的调拨单
 */
export function bindTransit(id: string, transitOrderId: string): TransferOrderRow {
  const transfer = getTransferOrderById(id);

  if (!transfer) {
    throw new Error(`调拨单 ${id} 不存在`);
  }

  const updated = updateTransferOrder(id, {
    transitOrderId,
  });

  if (!updated) {
    throw new Error(`更新调拨单 ${id} 失败`);
  }

  logger.info(`[Transfer] 绑定物流: id=${id}, transitOrderId=${transitOrderId}`);
  return updated as TransferOrderRow;
}

/**
 * 解绑物流单
 *
 * @param id 调拨单 ID
 * @returns 更新后的调拨单
 */
export function unbindTransit(id: string): TransferOrderRow {
  const transfer = getTransferOrderById(id);

  if (!transfer) {
    throw new Error(`调拨单 ${id} 不存在`);
  }

  const updated = updateTransferOrder(id, {
    transitOrderId: null,
  });

  if (!updated) {
    throw new Error(`更新调拨单 ${id} 失败`);
  }

  logger.info(`[Transfer] 解绑物流: id=${id}`);
  return updated as TransferOrderRow;
}
