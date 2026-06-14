/**
 * Unit tests for server/services/replenishmentService.ts
 *
 * Tests:
 * - calculatePriority (indirect via generateSuggestions): 4 priority levels + boundary conditions
 * - generateSuggestions: empty inventory / data-insufficient below safety stock / normal EMA / dailyConsumption<=0 / transaction (old pending→ignored + batch INSERT)
 * - getSuggestions: pagination + filters + priority sorting
 * - updateSuggestionStatus: success / not found
 * - createTransferFromSuggestion: success / not found / non-pending status
 * - recommendSourceWarehouse: with surplus / no surplus / score sorting
 * - getReplenishmentStats: count queries
 *
 * Mock strategy:
 * - vi.mock('../db.js') returns controllable mockDb + mock createTransferOrder
 * - vi.hoisted() + vi.mock('../services/predictionService.js') for computeEMA
 * - vi.hoisted() + vi.mock('../services/transferService.js') for generateTransferNo
 * - createMockStatement() returns {run, get, all} mocks
 * - calculatePriority is private — tested indirectly through generateSuggestions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock Infrastructure =====================

function createMockStatement() {
  return {
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(),
  };
}

const mockDb = {
  prepare: vi.fn(),
  transaction: vi.fn(),
  exec: vi.fn(),
  pragma: vi.fn(),
};

// All mock functions must be created inside vi.hoisted() to avoid TDZ errors
const { mockCreateTransferOrder, mockComputeEMA, mockGenerateTransferNo } = vi.hoisted(() => ({
  mockCreateTransferOrder: vi.fn(),
  mockComputeEMA: vi.fn(),
  mockGenerateTransferNo: vi.fn(),
}));

vi.mock('../db.js', () => ({
  initDb: () => mockDb,
  createSkillAudit: vi.fn(),
  getSessions: vi.fn(),
  searchSessions: vi.fn(),
  createSession: vi.fn(),
  getSessionMessages: vi.fn(),
  addMessage: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('../dao/warehouse.js', () => ({
  createTransferOrder: mockCreateTransferOrder,
}));

vi.mock('../services/predictionService.js', () => ({
  computeEMA: mockComputeEMA,
}));

vi.mock('../services/transferService.js', () => ({
  generateTransferNo: mockGenerateTransferNo,
}));

import {
  generateSuggestions,
  getSuggestions,
  updateSuggestionStatus,
  createTransferFromSuggestion,
  recommendSourceWarehouse,
  getReplenishmentStats,
} from '../services/replenishmentService';

import type { ReplenishmentSuggestionRow } from '../models/wms-skill';

// ===================== Test Fixtures =====================

const INVENTORY_ITEM_A = {
  sku: 'SKU-001',
  warehouseId: 'wh-A',
  quantity: 50,
  minStock: 10,
  skuName: '商品A',
  warehouseName: '仓库A',
};

const INVENTORY_ITEM_LOW = {
  sku: 'SKU-003',
  warehouseId: 'wh-A',
  quantity: 2,
  minStock: 20,
  skuName: '低库存商品',
  warehouseName: '仓库A',
};

// 8 days of outbound data (exceeds default minHistoryDays=7)
const DAILY_OUTBOUND_A = Array.from({ length: 8 }, (_, i) => ({
  sku: 'SKU-001',
  warehouseId: 'wh-A',
  date: `2026-05-${String(10 + i).padStart(2, '0')}`,
  dailyOutbound: 10,
}));

const SUGGESTION_ROW: ReplenishmentSuggestionRow = {
  id: 1,
  sku: 'SKU-001',
  warehouse_id: 'wh-A',
  current_stock: 50,
  in_transit_qty: 0,
  safety_stock: 10,
  daily_consumption: 10,
  target_stock: 140,
  suggested_qty: 90,
  source_warehouse_id: null,
  priority: 'medium',
  status: 'pending',
  transfer_order_id: null,
  created_at: '2026-05-25T00:00:00Z',
  updated_at: '2026-05-25T00:00:00Z',
};

// ===================== Reset =====================

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());
  mockComputeEMA.mockReturnValue(10);
  mockGenerateTransferNo.mockReturnValue('TF-20260525-0001');
  mockCreateTransferOrder.mockReturnValue({
    id: 'tf-new-001',
    transferNo: 'TF-20260525-0001',
    fromWarehouseId: 'wh-source',
    toWarehouseId: 'wh-A',
    sku: 'SKU-001',
    name: '商品A',
    quantity: 90,
    volume: 0,
    status: 'draft',
    transitOrderId: null,
    createdBy: 'replenishment-engine',
    submittedAt: null,
    submittedBy: null,
    receivedAt: null,
    receivedBy: null,
    completedAt: null,
    completedBy: null,
    remark: '由补货建议 #1 自动创建',
    createdAt: '2026-05-25T00:00:00Z',
    updatedAt: '2026-05-25T00:00:00Z',
  });
});

// ===================== Helper: setup generateSuggestions mocks =====================

function setupGenerateMocks(options: {
  inventoryItems: typeof INVENTORY_ITEM_A[];
  outbounds: typeof DAILY_OUTBOUND_A;
  transferInTransit?: Array<{ sku: string; toWarehouseId: string; qty: number }>;
  purchaseInTransit?: Array<{ sku: string; warehouseId: string; qty: number }>;
  includeTransaction?: boolean;
}) {
  const inventoryStmt = createMockStatement();
  inventoryStmt.all.mockReturnValue(options.inventoryItems);

  const outboundStmt = createMockStatement();
  outboundStmt.all.mockReturnValue(options.outbounds);

  const transferInTransitStmt = createMockStatement();
  transferInTransitStmt.all.mockReturnValue(options.transferInTransit ?? []);

  const purchaseInTransitStmt = createMockStatement();
  purchaseInTransitStmt.all.mockReturnValue(options.purchaseInTransit ?? []);

  const updateOldPendingStmt = createMockStatement();
  updateOldPendingStmt.run.mockReturnValue({ changes: 0 });

  const insertStmt = createMockStatement();
  insertStmt.run.mockReturnValue({ lastInsertRowid: 1, changes: 1 });

  const needTransaction = options.includeTransaction ?? true;

  let callCount = 0;
  mockDb.prepare.mockImplementation(() => {
    callCount++;
    switch (callCount) {
      case 1: return inventoryStmt;
      case 2: return outboundStmt;
      case 3: return transferInTransitStmt;
      case 4: return purchaseInTransitStmt;
      case 5: return needTransaction ? updateOldPendingStmt : createMockStatement();
      case 6: return needTransaction ? insertStmt : createMockStatement();
      default: return createMockStatement();
    }
  });

  return { insertStmt, updateOldPendingStmt };
}

// ===================== calculatePriority (indirect) Tests =====================

describe('calculatePriority (tested via generateSuggestions)', () => {
  /**
   * Priority rules:
   * - critical: currentStock <= 0 OR daysUntilZero <= 3
   * - high: daysUntilZero <= 7
   * - medium: daysUntilZero <= 14 OR availableStock < targetStock
   * - low: otherwise (only when suggestedQty > 0, which requires availableStock < targetStock,
   *        so "low" effectively never appears in output)
   *
   * daysUntilZero = (currentStock + inTransitQty) / dailyConsumption
   */

  it('should return "critical" when currentStock <= 0', () => {
    mockComputeEMA.mockReturnValue(10);
    setupGenerateMocks({
      inventoryItems: [{ ...INVENTORY_ITEM_A, quantity: 0 }],
      outbounds: DAILY_OUTBOUND_A,
    });
    const result = generateSuggestions();
    expect(result.created).toBe(1);
    expect(result.suggestions[0].priority).toBe('critical');
  });

  it('should return "critical" when currentStock is negative', () => {
    mockComputeEMA.mockReturnValue(10);
    setupGenerateMocks({
      inventoryItems: [{ ...INVENTORY_ITEM_A, quantity: -5 }],
      outbounds: DAILY_OUTBOUND_A,
    });
    const result = generateSuggestions();
    expect(result.created).toBe(1);
    expect(result.suggestions[0].priority).toBe('critical');
  });

  it('should return "critical" when daysUntilZero <= 3 (boundary: exactly 3)', () => {
    // currentStock=30, inTransit=0, dailyConsumption=10 → daysUntilZero = 30/10 = 3
    mockComputeEMA.mockReturnValue(10);
    setupGenerateMocks({
      inventoryItems: [{ ...INVENTORY_ITEM_A, quantity: 30 }],
      outbounds: DAILY_OUTBOUND_A,
    });
    const result = generateSuggestions();
    expect(result.created).toBe(1);
    expect(result.suggestions[0].priority).toBe('critical');
  });

  it('should return "critical" when daysUntilZero is less than 3', () => {
    // currentStock=10, inTransit=0, dailyConsumption=10 → daysUntilZero = 1
    mockComputeEMA.mockReturnValue(10);
    setupGenerateMocks({
      inventoryItems: [{ ...INVENTORY_ITEM_A, quantity: 10 }],
      outbounds: DAILY_OUTBOUND_A,
    });
    const result = generateSuggestions();
    expect(result.created).toBe(1);
    expect(result.suggestions[0].priority).toBe('critical');
  });

  it('should return "high" when daysUntilZero is 4 (just above critical threshold)', () => {
    // currentStock=40, inTransit=0, dailyConsumption=10 → daysUntilZero = 4
    mockComputeEMA.mockReturnValue(10);
    setupGenerateMocks({
      inventoryItems: [{ ...INVENTORY_ITEM_A, quantity: 40 }],
      outbounds: DAILY_OUTBOUND_A,
    });
    const result = generateSuggestions();
    expect(result.created).toBe(1);
    expect(result.suggestions[0].priority).toBe('high');
  });

  it('should return "high" when daysUntilZero is exactly 7', () => {
    // currentStock=70, inTransit=0, dailyConsumption=10 → daysUntilZero = 7
    mockComputeEMA.mockReturnValue(10);
    setupGenerateMocks({
      inventoryItems: [{ ...INVENTORY_ITEM_A, quantity: 70, minStock: 0 }],
      outbounds: DAILY_OUTBOUND_A,
    });
    const result = generateSuggestions();
    expect(result.created).toBe(1);
    expect(result.suggestions[0].priority).toBe('high');
  });

  it('should return "medium" when daysUntilZero is 8 (just above high)', () => {
    // currentStock=80, inTransit=0, dailyConsumption=10 → daysUntilZero = 8
    // targetStock = max(10, ceil(10*14)) = 140, suggestedQty = 140-80 = 60 > 0
    mockComputeEMA.mockReturnValue(10);
    setupGenerateMocks({
      inventoryItems: [{ ...INVENTORY_ITEM_A, quantity: 80 }],
      outbounds: DAILY_OUTBOUND_A,
    });
    const result = generateSuggestions();
    expect(result.created).toBe(1);
    expect(result.suggestions[0].priority).toBe('medium');
  });

  it('should return "medium" when daysUntilZero is exactly 14', () => {
    // currentStock=140, inTransit=0, dailyConsumption=10 → daysUntilZero = 14
    // targetStock = max(10, ceil(10*14)) = 140, suggestedQty = 140-140 = 0 → no suggestion
    // Need minStock higher to create a suggestion
    mockComputeEMA.mockReturnValue(10);
    setupGenerateMocks({
      inventoryItems: [{ ...INVENTORY_ITEM_A, quantity: 140, minStock: 150 }],
      outbounds: DAILY_OUTBOUND_A,
    });
    // targetStock = max(150, 140) = 150, suggestedQty = 150-140 = 10
    // daysUntilZero = 140/10 = 14, which is <= 14 → medium
    const result = generateSuggestions();
    expect(result.created).toBe(1);
    expect(result.suggestions[0].priority).toBe('medium');
  });

  it('should return "medium" when availableStock < targetStock (even if daysUntilZero > 14)', () => {
    // currentStock=80, inTransit=0, dailyConsumption=5 → daysUntilZero = 80/5 = 16 > 14
    // targetStock = max(90, ceil(5*14)) = 90, suggestedQty = 90-80 = 10 > 0
    // availableStock(80) < targetStock(90) → medium
    mockComputeEMA.mockReturnValue(5);
    setupGenerateMocks({
      inventoryItems: [{ ...INVENTORY_ITEM_A, quantity: 80, minStock: 90 }],
      outbounds: DAILY_OUTBOUND_A,
    });
    const result = generateSuggestions();
    expect(result.created).toBe(1);
    expect(result.suggestions[0].priority).toBe('medium');
  });

  it('should not generate suggestion when stock is sufficient (no "low" priority scenario)', () => {
    // When availableStock >= targetStock, suggestedQty = 0 → no suggestion generated
    mockComputeEMA.mockReturnValue(5);
    setupGenerateMocks({
      inventoryItems: [{ ...INVENTORY_ITEM_A, quantity: 100, minStock: 0 }],
      outbounds: DAILY_OUTBOUND_A,
      includeTransaction: false,
    });
    const result = generateSuggestions();
    expect(result.created).toBe(0);
    expect(result.suggestions).toEqual([]);
  });
});

// ===================== generateSuggestions Tests =====================

describe('generateSuggestions', () => {
  it('should return empty result when no inventory items exist', () => {
    const inventoryStmt = createMockStatement();
    inventoryStmt.all.mockReturnValue([]);
    mockDb.prepare.mockReturnValue(inventoryStmt);

    const result = generateSuggestions();
    expect(result).toEqual({ created: 0, suggestions: [] });
  });

  it('should generate high-priority suggestion when data insufficient but stock below safety', () => {
    // Inventory with low stock, but outbound history < minHistoryDays (7)
    setupGenerateMocks({
      inventoryItems: [INVENTORY_ITEM_LOW], // quantity: 2, minStock: 20
      outbounds: [
        { sku: 'SKU-003', warehouseId: 'wh-A', date: '2026-05-18', dailyOutbound: 1 },
        { sku: 'SKU-003', warehouseId: 'wh-A', date: '2026-05-19', dailyOutbound: 2 },
      ], // Only 2 days of data, less than minHistoryDays (7)
    });

    const result = generateSuggestions();
    expect(result.created).toBe(1);
    expect(result.suggestions[0].priority).toBe('high');
    expect(result.suggestions[0].suggestedQty).toBe(18); // 20 - 2 - 0
    expect(result.suggestions[0].dailyConsumption).toBe(0);
  });

  it('should skip item when data insufficient and stock >= safety stock', () => {
    setupGenerateMocks({
      inventoryItems: [{ ...INVENTORY_ITEM_LOW, quantity: 25 }], // 25 >= 20
      outbounds: [
        { sku: 'SKU-003', warehouseId: 'wh-A', date: '2026-05-18', dailyOutbound: 1 },
      ],
      includeTransaction: false,
    });

    const result = generateSuggestions();
    expect(result.created).toBe(0);
    expect(result.suggestions).toEqual([]);
  });

  it('should generate suggestion with normal EMA calculation', () => {
    mockComputeEMA.mockReturnValue(10);
    setupGenerateMocks({
      inventoryItems: [INVENTORY_ITEM_A], // quantity: 50, minStock: 10
      outbounds: DAILY_OUTBOUND_A,
    });

    const result = generateSuggestions({ coverDays: 14 });

    expect(result.created).toBe(1);
    const s = result.suggestions[0];
    expect(s.dailyConsumption).toBe(10); // mock returns 10, Math.round(10*100)/100 = 10
    expect(s.targetStock).toBe(140); // max(10, ceil(10 * 14)) = 140
    expect(s.suggestedQty).toBe(90); // 140 - 50 - 0
    expect(mockComputeEMA).toHaveBeenCalledWith(
      DAILY_OUTBOUND_A.map(r => r.dailyOutbound),
      0.3
    );
  });

  it('should skip item when dailyConsumption <= 0', () => {
    mockComputeEMA.mockReturnValue(0);
    setupGenerateMocks({
      inventoryItems: [INVENTORY_ITEM_A],
      outbounds: DAILY_OUTBOUND_A,
      includeTransaction: false,
    });

    const result = generateSuggestions();
    expect(result.created).toBe(0);
    expect(result.suggestions).toEqual([]);
  });

  it('should execute transaction: mark old pending as ignored then insert new', () => {
    mockComputeEMA.mockReturnValue(10);
    const { insertStmt, updateOldPendingStmt } = setupGenerateMocks({
      inventoryItems: [INVENTORY_ITEM_A],
      outbounds: DAILY_OUTBOUND_A,
    });
    // Override lastInsertRowid
    insertStmt.run.mockReturnValue({ lastInsertRowid: 42, changes: 1 });

    const result = generateSuggestions();

    // Verify transaction was used
    expect(mockDb.transaction).toHaveBeenCalled();

    // Verify UPDATE old pending → ignored
    expect(updateOldPendingStmt.run).toHaveBeenCalled();

    // Verify INSERT new suggestion
    expect(insertStmt.run).toHaveBeenCalled();

    // Verify result
    expect(result.created).toBe(1);
    expect(result.suggestions[0].id).toBe(42);
    expect(result.suggestions[0].status).toBe('pending');
  });

  it('should factor in-transit quantities into calculation', () => {
    mockComputeEMA.mockReturnValue(10);
    setupGenerateMocks({
      inventoryItems: [INVENTORY_ITEM_A],
      outbounds: DAILY_OUTBOUND_A,
      transferInTransit: [{ sku: 'SKU-001', toWarehouseId: 'wh-A', qty: 20 }],
      purchaseInTransit: [{ sku: 'SKU-001', warehouseId: 'wh-A', qty: 30 }],
    });

    const result = generateSuggestions({ coverDays: 14 });

    // inTransitQty = 20 (transfer) + 30 (purchase) = 50
    expect(result.suggestions[0].inTransitQty).toBe(50);
    // suggestedQty = 140 - 50 (stock) - 50 (in-transit) = 40
    expect(result.suggestions[0].suggestedQty).toBe(40);
  });

  it('should respect custom config (coverDays, minHistoryDays)', () => {
    mockComputeEMA.mockReturnValue(10);
    setupGenerateMocks({
      inventoryItems: [INVENTORY_ITEM_A],
      // Only 5 days of history
      outbounds: Array.from({ length: 5 }, (_, i) => ({
        sku: 'SKU-001',
        warehouseId: 'wh-A',
        date: `2026-05-${String(15 + i).padStart(2, '0')}`,
        dailyOutbound: 10,
      })),
    });

    // With minHistoryDays: 3, 5 days should be enough
    // With coverDays: 7, targetStock = max(10, ceil(10*7)) = 70
    const result = generateSuggestions({ coverDays: 7, minHistoryDays: 3 });
    expect(result.created).toBe(1);
    expect(result.suggestions[0].targetStock).toBe(70);
    expect(result.suggestions[0].suggestedQty).toBe(20); // 70 - 50 - 0
  });
});

// ===================== getSuggestions Tests =====================

describe('getSuggestions', () => {
  it('should return paginated results with default page and pageSize', () => {
    const countStmt = createMockStatement();
    countStmt.get.mockReturnValue({ total: 1 });

    const dataStmt = createMockStatement();
    dataStmt.all.mockReturnValue([{
      ...SUGGESTION_ROW,
      warehouseName: '仓库A',
      sourceWarehouseName: null,
      skuName: '商品A',
    }]);

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countStmt : dataStmt;
    });

    const result = getSuggestions({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sku).toBe('SKU-001');
  });

  it('should apply pagination with custom page and pageSize', () => {
    const countStmt = createMockStatement();
    countStmt.get.mockReturnValue({ total: 50 });

    const dataStmt = createMockStatement();
    dataStmt.all.mockReturnValue([]);

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countStmt : dataStmt;
    });

    const result = getSuggestions({ page: 3, pageSize: 10 });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
    expect(result.total).toBe(50);
  });

  it('should filter by status using parameterized query', () => {
    const countStmt = createMockStatement();
    countStmt.get.mockReturnValue({ total: 1 });

    const dataStmt = createMockStatement();
    dataStmt.all.mockReturnValue([]);

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countStmt : dataStmt;
    });

    getSuggestions({ status: 'pending' });

    // Source code uses parameterized query: "AND rs.status = ?"
    const countSql = mockDb.prepare.mock.calls[0][0] as string;
    expect(countSql).toContain('rs.status = ?');
  });

  it('should filter by priority using parameterized query', () => {
    const countStmt = createMockStatement();
    countStmt.get.mockReturnValue({ total: 0 });

    const dataStmt = createMockStatement();
    dataStmt.all.mockReturnValue([]);

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countStmt : dataStmt;
    });

    getSuggestions({ priority: 'critical' });

    const countSql = mockDb.prepare.mock.calls[0][0] as string;
    expect(countSql).toContain('rs.priority = ?');
  });

  it('should filter by warehouseId using parameterized query', () => {
    const countStmt = createMockStatement();
    countStmt.get.mockReturnValue({ total: 0 });

    const dataStmt = createMockStatement();
    dataStmt.all.mockReturnValue([]);

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countStmt : dataStmt;
    });

    getSuggestions({ warehouseId: 'wh-A' });

    const countSql = mockDb.prepare.mock.calls[0][0] as string;
    expect(countSql).toContain('rs.warehouse_id = ?');
  });

  it('should filter by sku with LIKE', () => {
    const countStmt = createMockStatement();
    countStmt.get.mockReturnValue({ total: 0 });

    const dataStmt = createMockStatement();
    dataStmt.all.mockReturnValue([]);

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countStmt : dataStmt;
    });

    getSuggestions({ sku: 'ABC' });

    const countSql = mockDb.prepare.mock.calls[0][0] as string;
    expect(countSql).toContain('rs.sku LIKE ?');
  });

  it('should sort by priority order then created_at DESC', () => {
    const countStmt = createMockStatement();
    countStmt.get.mockReturnValue({ total: 0 });

    const dataStmt = createMockStatement();
    dataStmt.all.mockReturnValue([]);

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countStmt : dataStmt;
    });

    getSuggestions({});

    const dataSql = mockDb.prepare.mock.calls[1][0] as string;
    expect(dataSql).toContain('ORDER BY');
    expect(dataSql).toContain('CASE');
    expect(dataSql).toContain('created_at DESC');
  });

  it('should compute daysUntilZero from currentStock + inTransitQty / dailyConsumption', () => {
    const countStmt = createMockStatement();
    countStmt.get.mockReturnValue({ total: 1 });

    const dataStmt = createMockStatement();
    dataStmt.all.mockReturnValue([{
      ...SUGGESTION_ROW,
      current_stock: 50,
      in_transit_qty: 10,
      daily_consumption: 5,
      warehouseName: '仓库A',
      sourceWarehouseName: null,
      skuName: '商品A',
    }]);

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countStmt : dataStmt;
    });

    const result = getSuggestions({});
    // daysUntilZero = (50 + 10) / 5 = 12
    expect(result.items[0].daysUntilZero).toBe(12);
  });
});

// ===================== updateSuggestionStatus Tests =====================

describe('updateSuggestionStatus', () => {
  it('should update status and return the updated suggestion', () => {
    const existingStmt = createMockStatement();
    existingStmt.get.mockReturnValue(SUGGESTION_ROW);

    const updateStmt = createMockStatement();
    updateStmt.run.mockReturnValue({ changes: 1 });

    const updatedRow = { ...SUGGESTION_ROW, status: 'ignored' };
    const getUpdatedStmt = createMockStatement();
    getUpdatedStmt.get.mockReturnValue(updatedRow);

    const whStmt = createMockStatement();
    whStmt.get.mockReturnValue({ name: '仓库A' });

    const skuStmt = createMockStatement();
    skuStmt.get.mockReturnValue({ name: '商品A' });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return existingStmt;    // SELECT existing
        case 2: return updateStmt;       // UPDATE status
        case 3: return getUpdatedStmt;   // SELECT updated
        case 4: return whStmt;           // SELECT warehouse name
        case 5: return skuStmt;          // SELECT sku name
        default: return createMockStatement();
      }
    });

    const result = updateSuggestionStatus(1, 'ignored');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('ignored');
    expect(result!.warehouseName).toBe('仓库A');
    expect(result!.skuName).toBe('商品A');
  });

  it('should return null when suggestion not found', () => {
    const existingStmt = createMockStatement();
    existingStmt.get.mockReturnValue(undefined);

    mockDb.prepare.mockReturnValue(existingStmt);

    const result = updateSuggestionStatus(999, 'ignored');
    expect(result).toBeNull();
  });

  it('should populate daysUntilZero when dailyConsumption > 0', () => {
    const existingStmt = createMockStatement();
    existingStmt.get.mockReturnValue(SUGGESTION_ROW);

    const updateStmt = createMockStatement();
    updateStmt.run.mockReturnValue({ changes: 1 });

    const updatedRow = {
      ...SUGGESTION_ROW,
      status: 'deferred',
      current_stock: 50,
      in_transit_qty: 10,
      daily_consumption: 10,
    };
    const getUpdatedStmt = createMockStatement();
    getUpdatedStmt.get.mockReturnValue(updatedRow);

    const whStmt = createMockStatement();
    whStmt.get.mockReturnValue({ name: '仓库A' });

    const skuStmt = createMockStatement();
    skuStmt.get.mockReturnValue({ name: '商品A' });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return existingStmt;
        case 2: return updateStmt;
        case 3: return getUpdatedStmt;
        case 4: return whStmt;
        case 5: return skuStmt;
        default: return createMockStatement();
      }
    });

    const result = updateSuggestionStatus(1, 'deferred');
    expect(result).not.toBeNull();
    // daysUntilZero = (50 + 10) / 10 = 6
    expect(result!.daysUntilZero).toBe(6);
  });
});

// ===================== createTransferFromSuggestion Tests =====================

describe('createTransferFromSuggestion', () => {
  it('should create transfer order and update suggestion to confirmed', () => {
    const suggestionStmt = createMockStatement();
    suggestionStmt.get.mockReturnValue(SUGGESTION_ROW);

    const skuNameStmt = createMockStatement();
    skuNameStmt.get.mockReturnValue({ name: '商品A' });

    const updateSuggestionStmt = createMockStatement();
    updateSuggestionStmt.run.mockReturnValue({ changes: 1 });

    const updatedRow = {
      ...SUGGESTION_ROW,
      status: 'confirmed',
      transfer_order_id: 'tf-new-001',
      source_warehouse_id: 'wh-source',
    };
    const getUpdatedStmt = createMockStatement();
    getUpdatedStmt.get.mockReturnValue(updatedRow);

    const whStmt = createMockStatement();
    whStmt.get.mockReturnValue({ name: '仓库A' });

    const srcWhStmt = createMockStatement();
    srcWhStmt.get.mockReturnValue({ name: '来源仓库' });

    const skuNameStmt2 = createMockStatement();
    skuNameStmt2.get.mockReturnValue({ name: '商品A' });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return suggestionStmt;       // SELECT suggestion
        case 2: return skuNameStmt;          // SELECT sku name
        case 3: return updateSuggestionStmt; // UPDATE suggestion (confirmed)
        case 4: return getUpdatedStmt;       // SELECT updated suggestion
        case 5: return whStmt;              // SELECT warehouse name
        case 6: return srcWhStmt;           // SELECT source warehouse name
        case 7: return skuNameStmt2;        // SELECT sku name again
        default: return createMockStatement();
      }
    });

    const result = createTransferFromSuggestion(1, {
      fromWarehouseId: 'wh-source',
      quantity: 90,
    });

    expect(result.suggestion.status).toBe('confirmed');
    expect(result.suggestion.sourceWarehouseId).toBe('wh-source');
    expect(result.transferOrderId).toBe('tf-new-001');
    expect(mockCreateTransferOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        fromWarehouseId: 'wh-source',
        toWarehouseId: 'wh-A',
        sku: 'SKU-001',
        quantity: 90,
        status: 'draft',
      })
    );
  });

  it('should throw "补货建议不存在" when suggestion not found', () => {
    const suggestionStmt = createMockStatement();
    suggestionStmt.get.mockReturnValue(undefined);

    mockDb.prepare.mockReturnValue(suggestionStmt);

    expect(() =>
      createTransferFromSuggestion(999, { fromWarehouseId: 'wh-source', quantity: 10 })
    ).toThrow('补货建议不存在');
  });

  it('should throw error when suggestion is not in pending status', () => {
    const suggestionStmt = createMockStatement();
    suggestionStmt.get.mockReturnValue({ ...SUGGESTION_ROW, status: 'confirmed' });

    const skuNameStmt = createMockStatement();
    skuNameStmt.get.mockReturnValue({ name: '商品A' });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? suggestionStmt : skuNameStmt;
    });

    expect(() =>
      createTransferFromSuggestion(1, { fromWarehouseId: 'wh-source', quantity: 10 })
    ).toThrow('只有待处理状态的建议可以创建调拨单');
  });
});

// ===================== recommendSourceWarehouse Tests =====================

describe('recommendSourceWarehouse', () => {
  it('should return recommendations for warehouses with surplus stock', () => {
    const sourceStmt = createMockStatement();
    sourceStmt.all.mockReturnValue([
      { warehouseId: 'wh-B', quantity: 100, minStock: 20, warehouseName: '仓库B' },
      { warehouseId: 'wh-C', quantity: 50, minStock: 10, warehouseName: '仓库C' },
    ]);

    mockDb.prepare.mockReturnValue(sourceStmt);

    const result = recommendSourceWarehouse('SKU-001', 'wh-A', 40);

    expect(result).toHaveLength(2);
    // wh-B: surplus = 100 - 20 = 80, score = 80/40 = 2
    expect(result[0].warehouseId).toBe('wh-B');
    expect(result[0].surplus).toBe(80);
    expect(result[0].score).toBe(2);
    // wh-C: surplus = 50 - 10 = 40, score = 40/40 = 1
    expect(result[1].warehouseId).toBe('wh-C');
    expect(result[1].surplus).toBe(40);
    expect(result[1].score).toBe(1);
  });

  it('should return empty array when no warehouses have surplus', () => {
    const sourceStmt = createMockStatement();
    sourceStmt.all.mockReturnValue([
      { warehouseId: 'wh-B', quantity: 10, minStock: 20, warehouseName: '仓库B' }, // surplus = -10
      { warehouseId: 'wh-C', quantity: 10, minStock: 10, warehouseName: '仓库C' }, // surplus = 0
    ]);

    mockDb.prepare.mockReturnValue(sourceStmt);

    const result = recommendSourceWarehouse('SKU-001', 'wh-A', 30);
    expect(result).toEqual([]);
  });

  it('should sort recommendations by score descending', () => {
    const sourceStmt = createMockStatement();
    sourceStmt.all.mockReturnValue([
      { warehouseId: 'wh-low', quantity: 30, minStock: 10, warehouseName: '低分仓库' },
      { warehouseId: 'wh-high', quantity: 200, minStock: 20, warehouseName: '高分仓库' },
      { warehouseId: 'wh-mid', quantity: 80, minStock: 20, warehouseName: '中分仓库' },
    ]);

    mockDb.prepare.mockReturnValue(sourceStmt);

    const result = recommendSourceWarehouse('SKU-001', 'wh-A', 10);

    expect(result).toHaveLength(3);
    // wh-high: surplus=180, score=18
    // wh-mid: surplus=60, score=6
    // wh-low: surplus=20, score=2
    expect(result[0].warehouseId).toBe('wh-high');
    expect(result[1].warehouseId).toBe('wh-mid');
    expect(result[2].warehouseId).toBe('wh-low');
    // Verify descending order
    expect(result[0].score).toBeGreaterThan(result[1].score);
    expect(result[1].score).toBeGreaterThan(result[2].score);
  });

  it('should use warehouseId as name when warehouseName is null', () => {
    const sourceStmt = createMockStatement();
    sourceStmt.all.mockReturnValue([
      { warehouseId: 'wh-X', quantity: 50, minStock: 10, warehouseName: null },
    ]);

    mockDb.prepare.mockReturnValue(sourceStmt);

    const result = recommendSourceWarehouse('SKU-001', 'wh-A', 10);
    expect(result).toHaveLength(1);
    expect(result[0].warehouseName).toBe('wh-X');
  });

  it('should handle suggestedQty=0 using max(1, 0) = 1 as divisor', () => {
    const sourceStmt = createMockStatement();
    sourceStmt.all.mockReturnValue([
      { warehouseId: 'wh-B', quantity: 50, minStock: 10, warehouseName: '仓库B' },
    ]);

    mockDb.prepare.mockReturnValue(sourceStmt);

    const result = recommendSourceWarehouse('SKU-001', 'wh-A', 0);
    expect(result).toHaveLength(1);
    // surplus = 40, score = 40 / max(1, 0) = 40
    expect(result[0].score).toBe(40);
  });
});

// ===================== getReplenishmentStats Tests =====================

describe('getReplenishmentStats', () => {
  it('should return aggregated statistics from 5 queries', () => {
    const totalStmt = createMockStatement();
    totalStmt.get.mockReturnValue({ cnt: 100 });

    const pendingStmt = createMockStatement();
    pendingStmt.get.mockReturnValue({ cnt: 30 });

    const criticalStmt = createMockStatement();
    criticalStmt.get.mockReturnValue({ cnt: 5 });

    const inTransitStmt = createMockStatement();
    inTransitStmt.get.mockReturnValue({ total: 500 });

    const todayConfirmedStmt = createMockStatement();
    todayConfirmedStmt.get.mockReturnValue({ cnt: 10 });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return totalStmt;
        case 2: return pendingStmt;
        case 3: return criticalStmt;
        case 4: return inTransitStmt;
        case 5: return todayConfirmedStmt;
        default: return createMockStatement();
      }
    });

    const result = getReplenishmentStats();

    expect(result).toEqual({
      total: 100,
      pending: 30,
      critical: 5,
      totalInTransitQty: 500,
      todayConfirmed: 10,
    });
  });

  it('should handle zero stats', () => {
    const zeroStmt = createMockStatement();
    zeroStmt.get.mockReturnValue({ cnt: 0 });

    const zeroTransitStmt = createMockStatement();
    zeroTransitStmt.get.mockReturnValue({ total: 0 });

    let callCount = 0;
    mockDb.prepare.mockImplementation(() => {
      callCount++;
      if (callCount === 4) return zeroTransitStmt;
      return zeroStmt;
    });

    const result = getReplenishmentStats();

    expect(result.total).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.critical).toBe(0);
    expect(result.totalInTransitQty).toBe(0);
    expect(result.todayConfirmed).toBe(0);
  });
});
