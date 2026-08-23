/**
 * @vitest-environment node
 *
 * WMS Transfer Draft Route Tests
 *
 * 验证新建的 wms-transfer.ts 路由（与 wms-outbound.ts 同范式）：
 * - 创建调拨草稿（校验源/目标仓与库位、逐项查源仓可用量、缺口识别、待确认结构）
 * - 校验失败（源=目标仓、库位相同、缺字段、明细缺 sku）
 * - GET 列表 / GET :id / PUT :id
 *
 * 策略：mock wmsSkillDao（含 queryInventoryAvailability），挂载路由，HTTP fetch 验证。
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ===================== Mock DAO =====================

vi.mock('../dao/wmsSkillDao.js', () => {
  const mockCreateTransferDraft = vi.fn();
  const mockGetTransferDrafts = vi.fn();
  const mockGetTransferDraftById = vi.fn();
  const mockUpdateTransferDraft = vi.fn();
  const mockQueryInventoryAvailability = vi.fn();
  return {
    createTransferDraft: mockCreateTransferDraft,
    getTransferDrafts: mockGetTransferDrafts,
    getTransferDraftById: mockGetTransferDraftById,
    updateTransferDraft: mockUpdateTransferDraft,
    queryInventoryAvailability: mockQueryInventoryAvailability,
  };
});

import * as daoOriginal from '../dao/wmsSkillDao.js';
const dao = vi.mocked(daoOriginal) as any;

// ===================== Test Server Helpers =====================

function createTestApp(): express.Application {
  const app = express();
  app.use(express.json());
  return app;
}

async function startServer(app: express.Application): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
    server.on('error', reject);
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ===================== In-memory store =====================

let transferStore: Map<number, Record<string, any>>;
let nextId: number;

function resetStores() {
  transferStore = new Map();
  nextId = 1;
}

function makeTransfer(overrides: Record<string, any> = {}) {
  const id = nextId++;
  const record = {
    id,
    fromWarehouse: 'WH-001',
    toWarehouse: 'WH-002',
    fromLocation: null,
    toLocation: null,
    transferType: '仓库间',
    urgent: false,
    items: [] as Array<Record<string, any>>,
    status: 'pending_confirmation',
    gapCount: 0,
    note: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  transferStore.set(id, record);
  return record;
}

// 可用量映射（与技能口径一致：available = quantity - locked_quantity）
const AVAIL_MAP: Record<string, { quantity: number; lockedQuantity: number }> = {
  'SKU-001': { quantity: 30, lockedQuantity: 20 }, // available 10
  'SKU-002': { quantity: 100, lockedQuantity: 0 }, // available 100
};

describe('WMS Transfer Draft Route', () => {
  let server: http.Server;
  let baseUrl: string;
  let transferRoutes: { default: express.Router };

  beforeAll(async () => {
    transferRoutes = await import('../routes/wms-transfer.js');
  });

  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();

    dao.createTransferDraft.mockImplementation((draft: Record<string, any>) => {
      const record = makeTransfer(draft);
      return record.id;
    });
    dao.getTransferDraftById.mockImplementation((id: number) => transferStore.get(id) || undefined);
    dao.getTransferDrafts.mockImplementation((filters?: Record<string, string>) => {
      let results = Array.from(transferStore.values());
      if (filters?.fromWarehouse) results = results.filter((r) => r.fromWarehouse === filters.fromWarehouse);
      if (filters?.toWarehouse) results = results.filter((r) => r.toWarehouse === filters.toWarehouse);
      if (filters?.status) results = results.filter((r) => r.status === filters.status);
      if (filters?.sku) {
        results = results.filter((r) => (r.items ?? []).some((it: any) => it.sku.includes(filters.sku)));
      }
      return results;
    });
    dao.updateTransferDraft.mockImplementation((id: number, updates: Record<string, any>) => {
      const existing = transferStore.get(id);
      if (!existing) return false;
      transferStore.set(id, { ...existing, ...updates, updatedAt: new Date().toISOString() });
      return true;
    });
    dao.queryInventoryAvailability.mockImplementation((_warehouseId: string, sku: string) => {
      const v = AVAIL_MAP[sku];
      if (!v) return null;
      const quantity = v.quantity;
      const lockedQuantity = v.lockedQuantity;
      return { sku, name: `商品-${sku}`, quantity, lockedQuantity, available: quantity - lockedQuantity };
    });
  });

  beforeAll(async () => {
    const app = createTestApp();
    app.use('/api/wms/transfer-draft', transferRoutes.default);
    const s = await startServer(app);
    server = s.server;
    baseUrl = s.url;
  });

  afterAll(async () => {
    if (server) await stopServer(server);
  });

  // ===================== POST / =====================

  describe('POST /api/wms/transfer-draft', () => {
    it('创建调拨草稿：逐项查可用量、识别缺口、返回待确认结构', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWarehouse: 'WH-001',
          toWarehouse: 'WH-002',
          items: [{ sku: 'SKU-001', qty: 30 }],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.code).toBe(0);
      expect(body.data.fromWarehouse).toBe('WH-001');
      expect(body.data.toWarehouse).toBe('WH-002');
      expect(body.data.status).toBe('pending_confirmation');
      // SKU-001 可用 10，需求 30 → 缺口 20
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].availableAtSource).toBe(10);
      expect(body.data.items[0].gap).toBe(20);
      expect(body.data.gapCount).toBe(1);
    });

    it('源仓可用量充足时无缺口', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWarehouse: 'WH-001',
          toWarehouse: 'WH-002',
          items: [{ sku: 'SKU-002', qty: 50 }],
        }),
      });
      const body = await res.json();
      expect(body.data.items[0].availableAtSource).toBe(100);
      expect(body.data.items[0].gap).toBe(0);
      expect(body.data.gapCount).toBe(0);
    });

    it('源仓无该 SKU 记录时可用量为 0、缺口等于需求', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWarehouse: 'WH-001',
          toWarehouse: 'WH-002',
          items: [{ sku: 'SKU-404', qty: 5 }],
        }),
      });
      const body = await res.json();
      expect(body.data.items[0].availableAtSource).toBe(0);
      expect(body.data.items[0].gap).toBe(5);
      expect(body.data.gapCount).toBe(1);
    });

    it('缺少必填字段返回 400', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromWarehouse: 'WH-001' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe(400);
      expect(body.message).toContain('缺少必填字段');
    });

    it('源仓库与目标仓库相同返回 400', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWarehouse: 'WH-001',
          toWarehouse: 'WH-001',
          items: [{ sku: 'SKU-001', qty: 10 }],
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain('源仓库与目标仓库不能相同');
    });

    it('库位间调拨：源库位=目标库位返回 400', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWarehouse: 'WH-001',
          toWarehouse: 'WH-002',
          transferType: '库位间',
          fromLocation: 'A-01',
          toLocation: 'A-01',
          items: [{ sku: 'SKU-001', qty: 10 }],
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain('源库位与目标库位不能相同');
    });

    it('明细缺少 sku 返回 400', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWarehouse: 'WH-001',
          toWarehouse: 'WH-002',
          items: [{ qty: 10 }],
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ===================== GET / =====================

  describe('GET /api/wms/transfer-draft', () => {
    beforeEach(() => {
      resetStores();
      makeTransfer({ fromWarehouse: 'WH-001', toWarehouse: 'WH-002', status: 'pending_confirmation' });
      makeTransfer({ fromWarehouse: 'WH-003', toWarehouse: 'WH-004', status: 'confirmed' });
    });

    it('返回全部草稿', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft`);
      const body = await res.json();
      expect(body.code).toBe(0);
      expect(body.data).toHaveLength(2);
    });

    it('按 status 过滤', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft?status=confirmed`);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe('confirmed');
    });

    it('按 fromWarehouse 过滤', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft?fromWarehouse=WH-001`);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
    });
  });

  // ===================== GET /:id =====================

  describe('GET /api/wms/transfer-draft/:id', () => {
    let existingId: number;
    beforeEach(() => {
      resetStores();
      const t = makeTransfer({});
      existingId = t.id as number;
    });

    it('按 id 返回草稿', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft/${existingId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(existingId);
    });

    it('不存在返回 404', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft/99999`);
      expect(res.status).toBe(404);
    });

    it('非法 id 返回 400', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft/abc`);
      expect(res.status).toBe(400);
    });
  });

  // ===================== PUT /:id =====================

  describe('PUT /api/wms/transfer-draft/:id', () => {
    let existingId: number;
    beforeEach(() => {
      resetStores();
      const t = makeTransfer({});
      existingId = t.id as number;
    });

    it('更新草稿状态为 confirmed', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft/${existingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('confirmed');
    });

    it('不存在返回 404', async () => {
      const res = await fetch(`${baseUrl}/api/wms/transfer-draft/99999`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });
      expect(res.status).toBe(404);
    });
  });
});
