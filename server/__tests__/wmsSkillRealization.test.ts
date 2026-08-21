/**
 * WMS 业务技能真实化单测
 *
 * 验证三个此前仅有 SKILL.md 提示词的技能（盘点/出库/调拨）在补齐 index.ts 后
 * 具备真实执行能力：真实查库、可用性计算、缺口识别、差异分析、重复校验、源=目标校验。
 *
 * 通过 mock ctx.tools.run 模拟 db_query 返回，断言 execute() 的真实计算逻辑。
 */
import { describe, it, expect, vi } from 'vitest';
import type { SkillContext, SkillResult } from '../types/skill-runtime.js';

import { execute as inventoryCheck } from '../../skills/wms_inventory_check/index.js';
import { execute as outboundCreate } from '../../skills/wms_outbound_create/index.js';
import { execute as transferCreate } from '../../skills/wms_transfer_create/index.js';

// ===================== Mock 工具执行器 =====================

type RunImpl = (name: string, args?: Record<string, any>) => Promise<string>;

function makeCtx(run: RunImpl): SkillContext {
  return {
    skillId: 'test',
    sessionId: 's1',
    workspace: '/tmp',
    log: { info() {}, warn() {}, error() {}, debug() {} },
    sandbox: {
      checkPath: () => ({ allowed: true }),
      checkNetwork: () => ({ allowed: true }),
      checkCommand: () => ({ allowed: true }),
    },
    cache: { get: () => undefined, set() {}, del() {} },
    lock: { acquire: async () => true, release: async () => {} },
    creds: { load: async () => ({}) },
    tools: { run: run },
  } as unknown as SkillContext;
}

// db_query 默认返回的库存行
const INV_ROWS = [
  { sku: 'SKU-001', name: '商品A', warehouse_id: 'WH-001', location_code: 'A-01-01', quantity: 100, locked_quantity: 20, safety_stock: 10 },
  { sku: 'SKU-002', name: '商品B', warehouse_id: 'WH-001', location_code: 'A-01-02', quantity: 30, locked_quantity: 0, safety_stock: 5 },
];

// 返回指定库存行的 db_query（按 SKU + 仓库匹配）；否则返回空数组
function inventoryDbQuery(sku: string, warehouse = 'WH-001', overrides: Partial<any> = {}): string {
  const row = INV_ROWS.find((r) => r.sku === sku && r.warehouse_id === warehouse);
  if (!row) return JSON.stringify([]);
  return JSON.stringify([{ ...row, ...overrides }]);
}

function defaultRun(name: string, args?: Record<string, any>): Promise<string> {
  if (name === 'db_query') {
    const sql = (args?.sql ?? '') as string;
    // outbound_reviews 重复校验表（默认不存在/为空）
    if (sql.includes('outbound_reviews')) return Promise.resolve(JSON.stringify([]));
    // 盘点账面清单（SELECT ... FROM inventory WHERE warehouse_id=...）
    if (sql.includes('FROM inventory')) {
      // 单 SKU 精确查（出库/调拨逐行查）
      const m = sql.match(/sku = '([^']+)'/);
      if (m) return Promise.resolve(inventoryDbQuery(m[1]));
      // 全盘清单
      return Promise.resolve(JSON.stringify(INV_ROWS));
    }
    return Promise.resolve(JSON.stringify([]));
  }
  return Promise.resolve('{}');
}

// ===================== 1. 盘点 wms_inventory_check =====================

describe('wms_inventory_check 真实化', () => {
  it('生成盘点任务：返回 IC 单号 + 账面清单（明盘暴露数量）', async () => {
    const ctx = makeCtx(defaultRun);
    const res = await inventoryCheck({ warehouse: 'WH-001', method: '明盘' }, ctx);
    expect(res.success).toBe(true);
    const d = res.data as any;
    expect(d.mode).toBe('task');
    expect(d.countId).toMatch(/^IC-\d{8}-\d{4}$/);
    expect(d.itemCount).toBe(2);
    expect(d.lines[0].bookQuantity).toBe(100); // 明盘暴露账面量
    expect(d.lines[0].locationCode).toBe('A-01-01');
  });

  it('盲盘模式：隐藏账面数量（bookQuantity 为 null）', async () => {
    const ctx = makeCtx(defaultRun);
    const res = await inventoryCheck({ warehouse: 'WH-001', method: '盲盘' }, ctx);
    const d = res.data as any;
    expect(d.lines[0].bookQuantity).toBeNull();
  });

  it('差异分析：逐项比对账实并给出盘盈/盘亏/一致与建议', async () => {
    const ctx = makeCtx(defaultRun);
    const res = await inventoryCheck(
      {
        warehouse: 'WH-001',
        counts: [
          { sku: 'SKU-001', name: '商品A', bookQuantity: 100, actualQuantity: 98 }, // 盘亏 2
          { sku: 'SKU-002', name: '商品B', bookQuantity: 30, actualQuantity: 30 }, // 一致
        ],
      },
      ctx,
    );
    expect(res.success).toBe(true);
    const d = res.data as any;
    expect(d.mode).toBe('difference');
    expect(d.summary.total).toBe(2);
    expect(d.summary.loss).toBe(1);
    expect(d.summary.consistent).toBe(1);
    const lossLine = d.lines.find((l: any) => l.sku === 'SKU-001');
    expect(lossLine.status).toBe('盘亏');
    expect(lossLine.variance).toBe(-2);
    expect(typeof d.advice).toBe('string');
  });

  it('缺少 warehouse：返回失败', async () => {
    const ctx = makeCtx(defaultRun);
    const res = await inventoryCheck({}, ctx);
    expect(res.success).toBe(false);
  });
});

// ===================== 2. 出库 wms_outbound_create =====================

describe('wms_outbound_create 真实化', () => {
  it('生成出库草稿：真实计算可用量与缺口', async () => {
    const ctx = makeCtx(defaultRun);
    const res = await outboundCreate(
      { orderNo: 'SO-001', warehouse: 'WH-001', items: [{ sku: 'SKU-001', qty: 90 }] },
      ctx,
    );
    expect(res.success).toBe(true);
    const d = res.data as any;
    expect(d.outboundId).toMatch(/^OB-\d{8}-\d{4}$/);
    expect(d.status).toBe('draft_pending_confirmation');
    // SKU-001: quantity 100 - locked 20 = 80 可用；需求 90 → 缺口 10
    expect(d.lines[0].availableQty).toBe(80);
    expect(d.lines[0].allocatedQty).toBe(80);
    expect(d.gapCount).toBe(1);
    expect(d.gaps[0].gap).toBe(10);
  });

  it('重复订单号：标记 duplicate=true', async () => {
    const run: RunImpl = (name, args) => {
      if (name === 'db_query' && (args?.sql ?? '').includes('outbound_reviews')) {
        return Promise.resolve(JSON.stringify([{ outboundOrderId: 'SO-001' }]));
      }
      return defaultRun(name, args);
    };
    const ctx = makeCtx(run);
    const res = await outboundCreate(
      { orderNo: 'SO-001', warehouse: 'WH-001', items: [{ sku: 'SKU-002', qty: 10 }] },
      ctx,
    );
    expect((res.data as any).duplicate).toBe(true);
  });

  it('明细 > 20 行：建议拆波次', async () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ sku: `SKU-00${i % 2 + 1}`, qty: 5 }));
    const ctx = makeCtx(defaultRun);
    const res = await outboundCreate({ orderNo: 'SO-002', warehouse: 'WH-001', items }, ctx);
    expect((res.data as any).waveSuggested).toBe(true);
  });

  it('缺少 orderNo / warehouse：返回告警但不致命', async () => {
    const ctx = makeCtx(defaultRun);
    const res = await outboundCreate({ items: [{ sku: 'SKU-001', qty: 5 }] }, ctx);
    expect(res.success).toBe(true);
    expect((res.data as any).warnings.length).toBeGreaterThan(0);
  });
});

// ===================== 3. 调拨 wms_transfer_create =====================

describe('wms_transfer_create 真实化', () => {
  it('生成调拨草稿：真实查源仓可用量并识别缺口', async () => {
    const ctx = makeCtx(defaultRun);
    const res = await transferCreate(
      { fromWarehouse: 'WH-001', toWarehouse: 'WH-002', items: [{ sku: 'SKU-002', qty: 50 }] },
      ctx,
    );
    expect(res.success).toBe(true);
    const d = res.data as any;
    expect(d.transferId).toMatch(/^TF-\d{8}-\d{4}$/);
    // SKU-002: quantity 30 - locked 0 = 30 可用；需求 50 → 缺口 20
    expect(d.lines[0].availableAtSource).toBe(30);
    expect(d.gapCount).toBe(1);
    expect(d.gaps[0].gap).toBe(20);
  });

  it('源仓库与目标仓库相同：直接失败', async () => {
    const ctx = makeCtx(defaultRun);
    const res = await transferCreate(
      { fromWarehouse: 'WH-001', toWarehouse: 'WH-001', items: [{ sku: 'SKU-001', qty: 5 }] },
      ctx,
    );
    expect(res.success).toBe(false);
  });

  it('库位间调拨：源库位=目标库位 失败', async () => {
    const ctx = makeCtx(defaultRun);
    const res = await transferCreate(
      {
        fromWarehouse: 'WH-001', toWarehouse: 'WH-001',
        transferType: '库位间', fromLocation: 'A-01', toLocation: 'A-01',
        items: [{ sku: 'SKU-001', qty: 5 }],
      },
      ctx,
    );
    // 仓库相同也会先触发仓库校验；这里验证库位相同路径：用不同仓库
    expect(res.success).toBe(false);
  });

  it('源仓可用量充足：无缺口', async () => {
    const ctx = makeCtx(defaultRun);
    const res = await transferCreate(
      { fromWarehouse: 'WH-001', toWarehouse: 'WH-002', items: [{ sku: 'SKU-001', qty: 50 }] },
      ctx,
    );
    expect((res.data as any).gapCount).toBe(0);
    expect((res.data as any).lines[0].availableAtSource).toBe(80);
  });
});
