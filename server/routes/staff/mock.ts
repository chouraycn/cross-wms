/**
 * StaffDeck Mock Routes — /api/staffdeck/mock
 *
 * 端点（Mock 业务订单）：
 *   POST /order/query              查询订单
 *   POST /order/archive-query      归档查询
 *   POST /order/add                创建订单
 *   POST /product/purchase         购买商品
 *   POST /product/price-query      价格查询
 *   POST /product/price_query      价格查询（别名）
 *   POST /member/benefit-reconcile 会员权益对账
 *   POST /fulfillment/reroute-plan 履约重路由
 *
 * 业务逻辑暂用 stub 返回固定 mock 数据（移植自 StaffDeck-main/backend/app/api/mock.py）
 * 响应格式统一为 { code, data, message }
 */
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { getMockOrder, upsertMockOrder } from '../../dao/staff/staffMockDao.js';
import { getStaffContext, staffAuth } from '../../middleware/staffAuth.js';

const router = Router();

// ===================== Mock 商品目录 =====================

interface MockProductRecord {
  product_id: string;
  display_name: string;
  brand: string;
  price: number;
  currency: string;
  spec: string;
}

const PRODUCT_CATALOG: Record<string, MockProductRecord> = {
  'SKU-001': { product_id: 'SKU-001', display_name: 'SKU-001', brand: 'Mock', price: 99.0, currency: 'CNY', spec: 'standard' },
  'SKU-002': { product_id: 'SKU-002', display_name: 'SKU-002', brand: 'Mock', price: 199.0, currency: 'CNY', spec: 'standard' },
  'SKU-003': { product_id: 'SKU-003', display_name: 'SKU-003', brand: 'Mock', price: 299.0, currency: 'CNY', spec: 'standard' },
};

const PRODUCT_NAME_CATALOG: Record<string, MockProductRecord> = {
  'iphone 15': { product_id: 'PHONE-IP15', display_name: 'iPhone 15', brand: 'Apple', price: 4599.0, currency: 'CNY', spec: '128GB' },
  '三星s24': { product_id: 'PHONE-S24', display_name: '三星 Galaxy S24', brand: 'Samsung', price: 3999.0, currency: 'CNY', spec: '256GB' },
  '小米14': { product_id: 'PHONE-MI14', display_name: '小米 14', brand: 'Xiaomi', price: 3299.0, currency: 'CNY', spec: '256GB' },
  'a1': { product_id: 'A1', display_name: 'A1 标准商品', brand: 'Mock', price: 129.0, currency: 'CNY', spec: 'standard' },
  'a3': { product_id: 'A3', display_name: 'A3 高阶商品', brand: 'Mock', price: 239.0, currency: 'CNY', spec: 'pro' },
};

const PRIMARY_ORDER_CENTER: Record<string, { status: string; signed_days: number; refundable: boolean }> = {
  'ORDER-1001': { status: 'signed', signed_days: 3, refundable: true },
  'ORDER-1002': { status: 'signed', signed_days: 16, refundable: false },
};

const ARCHIVE_ORDER_CENTER: Record<string, {
  status: string;
  signed_days: number;
  refundable: boolean;
  archive_reason: string;
  recommendation: string;
}> = {
  'ARCHIVE-1001': {
    status: 'signed',
    signed_days: 4,
    refundable: true,
    archive_reason: '订单已归档到历史订单中心',
    recommendation: '该历史订单签收 4 天，当前可继续发起售后退款审核。',
  },
};

// ===================== 辅助函数 =====================

function normalizeId(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeProductName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .join(' ');
}

function findProductRecord(value: string): MockProductRecord | null {
  const normalizedId = normalizeId(value);
  if (PRODUCT_CATALOG[normalizedId]) return PRODUCT_CATALOG[normalizedId];
  const normalizedName = normalizeProductName(value);
  if (PRODUCT_NAME_CATALOG[normalizedName]) return PRODUCT_NAME_CATALOG[normalizedName];
  for (const record of [...Object.values(PRODUCT_CATALOG), ...Object.values(PRODUCT_NAME_CATALOG)]) {
    if (normalizeId(record.product_id) === normalizedId) return record;
    if (normalizeProductName(record.display_name) === normalizedName) return record;
  }
  return null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function orderHit(orderId: string, source: string, record: Record<string, unknown>): Record<string, unknown> {
  return { order_id: orderId, found: true, source, ...record };
}

function orderMiss(orderId: string, source: string): Record<string, unknown> {
  return {
    order_id: orderId,
    found: false,
    source,
    results: [],
    miss_reason: 'source_miss',
    hint: '当前订单中心未命中，可尝试其他已配置的订单查询工具。',
  };
}

function productMiss(productName: string): Record<string, unknown> {
  return {
    product_name: productName,
    found: false,
    results: [],
    miss_reason: 'product_not_found',
    hint: '可尝试使用 iPhone 15、三星S24、小米14、A1、A3 或 SKU-001/SKU-002/SKU-003 作为 mock 商品名。',
  };
}

function findDynamicOrder(orderId: string): Record<string, unknown> | null {
  const row = getMockOrder(orderId);
  if (!row) return null;
  let extra: Record<string, unknown> = {};
  try {
    extra = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  } catch {
    extra = {};
  }
  return {
    status: row.status,
    signed_days: row.signed_days,
    refundable: row.refundable === 1,
    user_id: row.user_id,
    product_id: row.product_id,
    sku_id: row.sku_id,
    quantity: row.quantity,
    payment_status: row.payment_status,
    order_status: row.order_status,
    total_amount: row.total_amount,
    currency: row.currency,
    created_at: row.created_at,
    recommendation: '该订单已在 mock 订单中心创建，可继续进行订单查询、取消或售后流程。',
    ...extra,
  };
}

function upsertDynamicOrder(input: {
  order_id: string;
  user_id?: string | null;
  product_id?: string | null;
  sku_id?: string | null;
  quantity: number;
  status: string;
  payment_status?: string | null;
  order_status?: string | null;
  total_amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
}): void {
  upsertMockOrder({
    order_id: input.order_id,
    user_id: input.user_id ?? null,
    product_id: input.product_id ?? null,
    sku_id: input.sku_id ?? null,
    quantity: input.quantity,
    status: input.status,
    payment_status: input.payment_status ?? null,
    order_status: input.order_status ?? null,
    signed_days: 0,
    refundable: true,
    total_amount: input.total_amount,
    currency: input.currency,
    metadata: input.metadata ?? {},
  });
}

function genOrderId(prefix: string): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

// ===================== POST /api/staffdeck/mock/order/query =====================

router.post('/order/query', staffAuth, (req: Request, res: Response) => {
  void getStaffContext(res);
  const body = req.body ?? {};
  const orderId = normalizeId(typeof body.order_id === 'string' ? body.order_id : '');

  const dynamicRecord = findDynamicOrder(orderId);
  if (dynamicRecord) {
    res.json({ code: 0, data: orderHit(orderId, 'primary_order_center', dynamicRecord), message: 'ok' });
    return;
  }
  const record = PRIMARY_ORDER_CENTER[orderId];
  if (!record) {
    res.json({ code: 0, data: orderMiss(orderId, 'primary_order_center'), message: 'ok' });
    return;
  }
  res.json({ code: 0, data: orderHit(orderId, 'primary_order_center', record), message: 'ok' });
});

// ===================== POST /api/staffdeck/mock/order/archive-query =====================

router.post('/order/archive-query', staffAuth, (req: Request, res: Response) => {
  void getStaffContext(res);
  const body = req.body ?? {};
  const orderId = normalizeId(typeof body.order_id === 'string' ? body.order_id : '');

  const record = ARCHIVE_ORDER_CENTER[orderId];
  if (!record) {
    res.json({ code: 0, data: orderMiss(orderId, 'archive_order_center'), message: 'ok' });
    return;
  }
  res.json({ code: 0, data: orderHit(orderId, 'archive_order_center', record), message: 'ok' });
});

// ===================== POST /api/staffdeck/mock/order/add =====================

router.post('/order/add', staffAuth, (req: Request, res: Response) => {
  void getStaffContext(res);
  const body = req.body ?? {};
  const userId = typeof body.user_id === 'string' ? body.user_id : 'user_demo';
  const productIdRaw = typeof body.product_id === 'string' ? body.product_id : '';
  const skuId = typeof body.sku_id === 'string' ? body.sku_id : null;
  const quantityRaw = typeof body.quantity === 'number' ? body.quantity : 1;
  const quantity = Math.max(1, Math.min(99, Math.floor(quantityRaw)));
  const status = typeof body.status === 'string' ? body.status : 'created';
  const orderIdInput = typeof body.order_id === 'string' && body.order_id.trim() !== ''
    ? normalizeId(body.order_id)
    : genOrderId('ADD');

  const record = findProductRecord(productIdRaw);
  if (!record) {
    res.json({ code: 0, data: productMiss(productIdRaw), message: 'ok' });
    return;
  }
  const unitPrice = record.price;
  const totalAmount = unitPrice * quantity;
  const result = {
    found: true,
    order_id: orderIdInput,
    user_id: userId,
    product_id: record.product_id,
    display_name: record.display_name,
    sku_id: skuId,
    quantity,
    unit_price: unitPrice,
    total_amount: totalAmount,
    currency: 'CNY',
    status,
    created_at: nowIso(),
  };
  upsertDynamicOrder({
    order_id: orderIdInput,
    user_id: userId,
    product_id: record.product_id,
    sku_id: skuId,
    quantity,
    status,
    payment_status: null,
    order_status: status,
    total_amount: totalAmount,
    currency: 'CNY',
    metadata: {},
  });
  res.json({ code: 0, data: result, message: 'ok' });
});

// ===================== POST /api/staffdeck/mock/product/purchase =====================

router.post('/product/purchase', staffAuth, (req: Request, res: Response) => {
  void getStaffContext(res);
  const body = req.body ?? {};
  const userId = typeof body.user_id === 'string' ? body.user_id : 'user_demo';
  const productIdRaw = typeof body.product_id === 'string' ? body.product_id : '';
  const skuId = typeof body.sku_id === 'string' ? body.sku_id : null;
  const quantityRaw = typeof body.quantity === 'number' ? body.quantity : 1;
  const quantity = Math.max(1, Math.min(99, Math.floor(quantityRaw)));
  const paymentMethod = typeof body.payment_method === 'string' ? body.payment_method : 'mock_balance';

  const record = findProductRecord(productIdRaw);
  if (!record) {
    res.json({ code: 0, data: productMiss(productIdRaw), message: 'ok' });
    return;
  }
  const unitPrice = record.price;
  const totalAmount = unitPrice * quantity;
  const orderId = genOrderId('MOCK');
  const purchaseId = genOrderId('PUR');
  const result = {
    found: true,
    order_id: orderId,
    purchase_id: purchaseId,
    user_id: userId,
    product_id: record.product_id,
    display_name: record.display_name,
    sku_id: skuId,
    quantity,
    unit_price: unitPrice,
    total_amount: totalAmount,
    currency: 'CNY',
    payment_method: paymentMethod,
    payment_status: 'paid',
    order_status: 'paid',
    created_at: nowIso(),
  };
  upsertDynamicOrder({
    order_id: orderId,
    user_id: userId,
    product_id: record.product_id,
    sku_id: skuId,
    quantity,
    status: 'paid',
    payment_status: 'paid',
    order_status: 'paid',
    total_amount: totalAmount,
    currency: 'CNY',
    metadata: { purchase_id: purchaseId, payment_method: paymentMethod },
  });
  res.json({ code: 0, data: result, message: 'ok' });
});

// ===================== POST /api/staffdeck/mock/product/price-query =====================
// ===================== POST /api/staffdeck/mock/product/price_query (别名) =====================

function handlePriceQuery(req: Request, res: Response): void {
  void getStaffContext(res);
  const body = req.body ?? {};
  const productName = typeof body.product_name === 'string' ? body.product_name.trim() : '';

  const record = findProductRecord(productName);
  if (!record) {
    res.json({ code: 0, data: productMiss(productName), message: 'ok' });
    return;
  }
  res.json({
    code: 0,
    data: {
      product_name: productName,
      found: true,
      source: 'mock_product_price_catalog',
      product_id: record.product_id,
      display_name: record.display_name,
      brand: record.brand,
      price: record.price,
      currency: record.currency,
      spec: record.spec,
      updated_at: nowIso(),
    },
    message: 'ok',
  });
}

router.post('/product/price-query', staffAuth, (req: Request, res: Response) => {
  handlePriceQuery(req, res);
});

router.post('/product/price_query', staffAuth, (req: Request, res: Response) => {
  handlePriceQuery(req, res);
});

// ===================== POST /api/staffdeck/mock/member/benefit-reconcile =====================

router.post('/member/benefit-reconcile', staffAuth, (req: Request, res: Response) => {
  void getStaffContext(res);
  const body = req.body ?? {};
  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  const orderId = normalizeId(typeof body.order_id === 'string' ? body.order_id : '');
  const memberLevelRaw = typeof body.member_level === 'string' ? body.member_level : '';
  const benefitCampaignId = typeof body.benefit_campaign_id === 'string' ? body.benefit_campaign_id : null;
  const benefitType = (typeof body.benefit_type === 'string' ? body.benefit_type : 'coupon').trim().toLowerCase();
  const memberLevel = memberLevelRaw.trim().toLowerCase();

  const eligible = ['black', '黑金', 'vip_black', 'black_card'].includes(memberLevel);
  const expected = [
    {
      benefit_id: `${benefitType}_vip_shipping_delay`,
      benefit_type: benefitType,
      display_name: '会员履约保障券',
      amount: 30,
      currency: 'CNY',
    },
  ];
  const delivered: typeof expected = eligible ? expected : [];
  const missing: typeof expected = eligible ? [] : expected;

  res.json({
    code: 0,
    data: {
      found: true,
      source: 'mock_member_benefit_reconcile',
      user_id: userId,
      order_id: orderId,
      member_level: memberLevelRaw || null,
      benefit_campaign_id: benefitCampaignId,
      eligible,
      expected_benefits: expected,
      delivered_benefits: delivered,
      missing_benefits: missing,
      difference_reason: eligible ? 'benefit_delivery_task_failed' : 'member_level_not_eligible',
      recommended_action: eligible ? 'auto_reissue' : 'explain_ineligible',
      can_auto_compensate: eligible,
      checked_at: nowIso(),
    },
    message: 'ok',
  });
});

// ===================== POST /api/staffdeck/mock/fulfillment/reroute-plan =====================

router.post('/fulfillment/reroute-plan', staffAuth, (req: Request, res: Response) => {
  void getStaffContext(res);
  const body = req.body ?? {};
  const orderId = normalizeId(typeof body.order_id === 'string' ? body.order_id : '');
  const userId = typeof body.user_id === 'string' ? body.user_id : null;
  const targetAddress = typeof body.target_address === 'string' ? body.target_address : null;
  const expectedDeliveryTime = typeof body.expected_delivery_time === 'string' ? body.expected_delivery_time : null;
  const allowSplitPackage = typeof body.allow_split_package === 'boolean' ? body.allow_split_package : false;
  const memberLevelRaw = typeof body.member_level === 'string' ? body.member_level : '';

  const highPriority = ['black', '黑金', 'vip_black', 'black_card'].includes(memberLevelRaw.trim().toLowerCase());
  const reroutable = Boolean(targetAddress || expectedDeliveryTime || highPriority);

  const plans: Array<Record<string, unknown>> = [];
  if (reroutable) {
    plans.push({
      plan_id: 'same_city_priority',
      plan_type: 'upgrade_priority',
      carrier: 'mock_same_city',
      estimated_delivery_time: expectedDeliveryTime ?? '2026-06-04T21:00:00+08:00',
      risk: '可能受同城仓库存和骑手排班影响',
      extra_fee: 0,
      requires_split_package: allowSplitPackage,
    });
    plans.push({
      plan_id: 'keep_current_route',
      plan_type: 'keep_route_with_urge',
      carrier: 'mock_standard',
      estimated_delivery_time: '2026-06-05T12:00:00+08:00',
      risk: '无需改仓，时效较慢但稳定',
      extra_fee: 0,
      requires_split_package: false,
    });
  }

  res.json({
    code: 0,
    data: {
      found: true,
      source: 'mock_fulfillment_reroute_plan',
      order_id: orderId,
      user_id: userId,
      reroutable,
      current_route: {
        warehouse: 'mock_east_warehouse',
        carrier: 'mock_standard',
        status: 'allocated',
      },
      plans,
      recommended_plan_id: plans.length > 0 ? plans[0].plan_id : null,
      requires_confirmation: reroutable,
      failure_reason: reroutable ? null : 'order_not_in_reroute_window',
      checked_at: nowIso(),
    },
    message: 'ok',
  });
});

export default router;
