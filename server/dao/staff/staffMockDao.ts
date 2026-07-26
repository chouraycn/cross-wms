/**
 * StaffMockDao — sd_mock_orders 表 CRUD（Mock 业务订单）
 *
 * 设计：
 * - order_id 为主键，业务侧 normalize 为大写
 * - metadata_json 以 TEXT 存储，DAO 负责序列化
 * - 布尔字段 refundable 使用 0/1
 * - 时间字段使用 INTEGER（Unix 秒）
 * - mock 业务逻辑（商品目录、归档订单等）由路由层 stub 处理
 */
import { initDb } from '../../db.js';
import type { MockOrderRow } from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

/** 按 order_id 获取 mock 订单 */
export function getMockOrder(orderId: string): MockOrderRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_mock_orders WHERE order_id = ?')
    .get(orderId) as MockOrderRow | undefined;
}

export interface MockOrderUpsertInput {
  order_id: string;
  user_id?: string | null;
  product_id?: string | null;
  sku_id?: string | null;
  quantity?: number;
  status?: string;
  payment_status?: string | null;
  order_status?: string | null;
  signed_days?: number;
  refundable?: boolean;
  total_amount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

/** 插入或更新 mock 订单（按 order_id 幂等） */
export function upsertMockOrder(input: MockOrderUpsertInput): MockOrderRow {
  const db = initDb();
  const existing = getMockOrder(input.order_id);
  const ts = now();
  if (!existing) {
    db.prepare(
      `INSERT INTO sd_mock_orders
         (order_id, user_id, product_id, sku_id, quantity, status,
          payment_status, order_status, signed_days, refundable,
          total_amount, currency, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.order_id,
      input.user_id ?? null,
      input.product_id ?? null,
      input.sku_id ?? null,
      input.quantity ?? 1,
      input.status ?? 'created',
      input.payment_status ?? null,
      input.order_status ?? null,
      input.signed_days ?? 0,
      input.refundable === false ? 0 : 1,
      input.total_amount ?? 0.0,
      input.currency ?? 'CNY',
      JSON.stringify(input.metadata ?? {}),
      ts,
      ts,
    );
    return db
      .prepare('SELECT * FROM sd_mock_orders WHERE order_id = ?')
      .get(input.order_id) as MockOrderRow;
  }

  const next: MockOrderRow = {
    ...existing,
    user_id: input.user_id !== undefined ? input.user_id : existing.user_id,
    product_id: input.product_id !== undefined ? input.product_id : existing.product_id,
    sku_id: input.sku_id !== undefined ? input.sku_id : existing.sku_id,
    quantity: input.quantity !== undefined ? input.quantity : existing.quantity,
    status: input.status ?? existing.status,
    payment_status:
      input.payment_status !== undefined ? input.payment_status : existing.payment_status,
    order_status:
      input.order_status !== undefined ? input.order_status : existing.order_status,
    signed_days: input.signed_days !== undefined ? input.signed_days : existing.signed_days,
    refundable:
      input.refundable !== undefined ? (input.refundable ? 1 : 0) : existing.refundable,
    total_amount: input.total_amount !== undefined ? input.total_amount : existing.total_amount,
    currency: input.currency ?? existing.currency,
    metadata_json:
      input.metadata !== undefined ? JSON.stringify(input.metadata) : existing.metadata_json,
    updated_at: ts,
  };

  db.prepare(
    `UPDATE sd_mock_orders
     SET user_id = ?, product_id = ?, sku_id = ?, quantity = ?, status = ?,
         payment_status = ?, order_status = ?, signed_days = ?, refundable = ?,
         total_amount = ?, currency = ?, metadata_json = ?, updated_at = ?
     WHERE order_id = ?`,
  ).run(
    next.user_id,
    next.product_id,
    next.sku_id,
    next.quantity,
    next.status,
    next.payment_status,
    next.order_status,
    next.signed_days,
    next.refundable,
    next.total_amount,
    next.currency,
    next.metadata_json,
    next.updated_at,
    input.order_id,
  );

  return next;
}

/** 列出 mock 订单（按 created_at 降序） */
export function listMockOrders(limit: number = 100): MockOrderRow[] {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_mock_orders ORDER BY created_at DESC LIMIT ?')
    .all(limit) as MockOrderRow[];
}
