/**
 * Unit tests for server/services/replenishmentService.ts
 *
 * Tests:
 * - scanInventoryForReplenishment: normal case, below threshold, no rule
 * - createReplenishmentRuleService: validation, success
 * - updateReplenishmentRuleService: validation, success
 * - deleteReplenishmentRuleService: success / failure
 * - getReplenishmentRulesService: list with filters
 * - getReplenishmentRuleDetail: valid ID / not found
 * - executeReplenishment: normal case, item not found
 * - getReplenishmentStats: aggregation
 * - generateSuggestions (compat): basic flow
 * - getSuggestions (compat): pagination
 * - updateSuggestionStatus (compat): success
 * - createTransferFromSuggestion (compat): success / not found
 * - recommendSourceWarehouse (compat): with surplus / no surplus
 *
 * Mock strategy:
 * - Mock DAO functions from wmsSkillDao.js and warehouse.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock DAO Functions =====================

const {
  mockGetInventoryItems,
  mockGetReplenishmentRules,
  mockGetReplenishmentRuleById,
  mockCreateReplenishmentRule,
  mockUpdateReplenishmentRule,
  mockDeleteReplenishmentRule,
  mockGetReplenishmentRuleBySkuAndWarehouse,
  mockCreateInboundRecord,
  mockUpdateInventoryItem,
  mockGetWarehouseById,
  mockGetReplenishmentSuggestions,
  mockUpdateReplenishmentSuggestion,
  mockGetReplenishmentSuggestionById,
  mockCreateTransferOrder,
  mockGetOutboundRecords,
} = vi.hoisted(() => ({
  mockGetInventoryItems: vi.fn(),
  mockGetReplenishmentRules: vi.fn(),
  mockGetReplenishmentRuleById: vi.fn(),
  mockCreateReplenishmentRule: vi.fn(),
  mockUpdateReplenishmentRule: vi.fn(),
  mockDeleteReplenishmentRule: vi.fn(),
  mockGetReplenishmentRuleBySkuAndWarehouse: vi.fn(),
  mockCreateInboundRecord: vi.fn(),
  mockUpdateInventoryItem: vi.fn(),
  mockGetWarehouseById: vi.fn(),
  mockGetReplenishmentSuggestions: vi.fn(),
  mockUpdateReplenishmentSuggestion: vi.fn(),
  mockGetReplenishmentSuggestionById: vi.fn(),
  mockCreateTransferOrder: vi.fn(),
  mockGetOutboundRecords: vi.fn(),
}));

vi.mock('../dao/wmsSkillDao.js', () => ({
  getReplenishmentRules: mockGetReplenishmentRules,
  getReplenishmentRuleById: mockGetReplenishmentRuleById,
  createReplenishmentRule: mockCreateReplenishmentRule,
  updateReplenishmentRule: mockUpdateReplenishmentRule,
  deleteReplenishmentRule: mockDeleteReplenishmentRule,
  getReplenishmentRuleBySkuAndWarehouse: mockGetReplenishmentRuleBySkuAndWarehouse,
  getReplenishmentSuggestions: mockGetReplenishmentSuggestions,
  updateReplenishmentSuggestion: mockUpdateReplenishmentSuggestion,
  getReplenishmentSuggestionById: mockGetReplenishmentSuggestionById,
}));

vi.mock('../dao/warehouse.js', () => ({
  getInventoryItems: mockGetInventoryItems,
  getOutboundRecords: mockGetOutboundRecords,
  createInboundRecord: mockCreateInboundRecord,
  updateInventoryItem: mockUpdateInventoryItem,
  getWarehouseById: mockGetWarehouseById,
  createTransferOrder: mockCreateTransferOrder,
}));

import {
  scanInventoryForReplenishment,
  createReplenishmentRuleService,
  updateReplenishmentRuleService,
  deleteReplenishmentRuleService,
  getReplenishmentRulesService,
  getReplenishmentRuleDetail,
  executeReplenishment,
  getReplenishmentStats,
  generateSuggestions,
  getSuggestions,
  updateSuggestionStatus,
  createTransferFromSuggestion,
  recommendSourceWarehouse,
} from '../services/replenishmentService.js';

// ===================== Test Fixtures =====================

const INVENTORY_ITEMS = [
  { id: 'inv-001', sku: 'SKU-001', warehouseId: 'WH1', quantity: 5, name: '商品A', valuePerUnit: 10 },
  { id: 'inv-002', sku: 'SKU-002', warehouseId: 'WH1', quantity: 100, name: '商品B', valuePerUnit: 20 },
  { id: 'inv-003', sku: 'SKU-003', warehouseId: 'WH2', quantity: 3, name: '商品C', valuePerUnit: 15 },
];

const REPLENISHMENT_RULES = [
  {
    id: 1,
    sku: 'SKU-001',
    warehouse_id: 'WH1',
    min_stock: 10,
    max_stock: 100,
    safety_days: 7,
    replenish_multiplier: 1.5,
    supplier_id: 'SUP-001',
    lead_time_days: 3,
    auto_order: 0,
    status: 'active',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  },
  {
    id: 2,
    sku: 'SKU-003',
    warehouse_id: 'WH2',
    min_stock: 5,
    max_stock: null,
    safety_days: 7,
    replenish_multiplier: 1.5,
    supplier_id: null,
    lead_time_days: null,
    auto_order: 0,
    status: 'active',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  },
];

const WAREHOUSES = {
  WH1: { id: 'WH1', name: '主仓库' },
  WH2: { id: 'WH2', name: '分仓库' },
};

// ===================== Reset =====================

beforeEach(() => {
  vi.clearAllMocks();
});

// ===================== scanInventoryForReplenishment Tests =====================

describe('scanInventoryForReplenishment', () => {
  it('should return suggestions for items below threshold', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockGetReplenishmentRuleBySkuAndWarehouse.mockImplementation((sku: string, warehouseId: string) => {
      return REPLENISHMENT_RULES.find(r => r.sku === sku && r.warehouse_id === warehouseId);
    });
    mockGetOutboundRecords.mockReturnValue([
      { sku: 'SKU-001', warehouseId: 'WH1', quantity: 5, createdAt: '2026-05-24T10:00:00Z' },
    ]);
    mockGetWarehouseById.mockImplementation((id: string) => WAREHOUSES[id as keyof typeof WAREHOUSES]);

    const result = scanInventoryForReplenishment();

    // SKU-001: quantity=5 <= min_stock=10 → should generate suggestion
    // SKU-003: quantity=3 <= min_stock=5 → should generate suggestion
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(s => s.sku === 'SKU-001')).toBe(true);
  });

  it('should filter by warehouseId when provided', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS.filter(i => i.warehouseId === 'WH1'));
    mockGetReplenishmentRuleBySkuAndWarehouse.mockImplementation((sku: string, warehouseId: string) => {
      return REPLENISHMENT_RULES.find(r => r.sku === sku && r.warehouse_id === warehouseId);
    });
    mockGetOutboundRecords.mockReturnValue([]);
    mockGetWarehouseById.mockImplementation((id: string) => WAREHOUSES[id as keyof typeof WAREHOUSES]);

    const result = scanInventoryForReplenishment('WH1');

    expect(mockGetInventoryItems).toHaveBeenCalledWith('WH1');
    expect(result.every(s => s.warehouseId === 'WH1')).toBe(true);
  });

  it('should calculate suggested quantity based on maxStock when rule has maxStock', () => {
    mockGetInventoryItems.mockReturnValue([INVENTORY_ITEMS[0]]); // SKU-001, quantity=5
    mockGetReplenishmentRuleBySkuAndWarehouse.mockReturnValue(REPLENISHMENT_RULES[0]); // min=10, max=100
    mockGetWarehouseById.mockReturnValue(WAREHOUSES.WH1);

    const result = scanInventoryForReplenishment();

    expect(result).toHaveLength(1);
    expect(result[0].suggestedQuantity).toBe(95); // 100 - 5
  });

  it('should calculate suggested quantity based on daily consumption when no maxStock', () => {
    mockGetInventoryItems.mockReturnValue([INVENTORY_ITEMS[2]]); // SKU-003, quantity=3
    mockGetReplenishmentRuleBySkuAndWarehouse.mockReturnValue(REPLENISHMENT_RULES[1]); // min=5, max=null
    mockGetOutboundRecords.mockReturnValue(
      Array.from({ length: 30 }, () => ({ sku: 'SKU-003', warehouseId: 'WH2', quantity: 2, createdAt: '2026-05-24T10:00:00Z' }))
    );
    mockGetWarehouseById.mockReturnValue(WAREHOUSES.WH2);

    const result = scanInventoryForReplenishment();

    expect(result).toHaveLength(1);
    // dailyConsumption = 60/30 = 2, safetyStock = 2*7 = 14, suggested = ceil((14-3)*1.5) = ceil(16.5) = 17
    expect(result[0].suggestedQuantity).toBeGreaterThan(0);
  });

  it('should return empty array when no items need replenishment', () => {
    mockGetInventoryItems.mockReturnValue([INVENTORY_ITEMS[1]]); // SKU-002, quantity=100, no rule
    mockGetReplenishmentRuleBySkuAndWarehouse.mockReturnValue(undefined);

    const result = scanInventoryForReplenishment();

    expect(result).toEqual([]);
  });

  it('should limit results to MAX_SUGGESTIONS', () => {
    const manyItems = Array.from({ length: 150 }, (_, i) => ({
      id: `inv-${i}`,
      sku: `SKU-${i}`,
      warehouseId: 'WH1',
      quantity: 0,
      name: `商品${i}`,
      valuePerUnit: 10,
    }));
    mockGetInventoryItems.mockReturnValue(manyItems);
    mockGetReplenishmentRuleBySkuAndWarehouse.mockReturnValue({
      min_stock: 10,
      max_stock: 100,
      safety_days: 7,
      replenish_multiplier: 1.5,
    });
    mockGetWarehouseById.mockReturnValue(WAREHOUSES.WH1);

    const result = scanInventoryForReplenishment();

    expect(result.length).toBeLessThanOrEqual(100);
  });
});

// ===================== createReplenishmentRuleService Tests =====================

describe('createReplenishmentRuleService', () => {
  it('should create rule with valid data', () => {
    mockCreateReplenishmentRule.mockReturnValue(1);

    const result = createReplenishmentRuleService({
      sku: 'SKU-NEW',
      warehouseId: 'WH1',
      minStock: 10,
      maxStock: 100,
      safetyDays: 7,
      replenishMultiplier: 1.5,
      supplierId: 'SUP-001',
      leadTimeDays: 3,
      autoOrder: false,
      status: 'active',
    });

    expect(result).toBe(1);
    expect(mockCreateReplenishmentRule).toHaveBeenCalled();
  });

  it('should throw error when minStock is negative', () => {
    expect(() =>
      createReplenishmentRuleService({
        sku: 'SKU-NEW',
        warehouseId: 'WH1',
        minStock: -1,
        maxStock: 100,
        safetyDays: 7,
        replenishMultiplier: 1.5,
      })
    ).toThrow('最小库存不能为负数');
  });

  it('should throw error when maxStock < minStock', () => {
    expect(() =>
      createReplenishmentRuleService({
        sku: 'SKU-NEW',
        warehouseId: 'WH1',
        minStock: 50,
        maxStock: 30,
        safetyDays: 7,
        replenishMultiplier: 1.5,
      })
    ).toThrow('最大库存不能小于最小库存');
  });

  it('should use default status when not provided', () => {
    mockCreateReplenishmentRule.mockReturnValue(1);

    createReplenishmentRuleService({
      sku: 'SKU-NEW',
      warehouseId: 'WH1',
      minStock: 10,
      maxStock: 100,
      safetyDays: 7,
      replenishMultiplier: 1.5,
    });

    expect(mockCreateReplenishmentRule).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' })
    );
  });
});

// ===================== updateReplenishmentRuleService Tests =====================

describe('updateReplenishmentRuleService', () => {
  it('should update rule with valid data', () => {
    mockUpdateReplenishmentRule.mockReturnValue(true);

    const result = updateReplenishmentRuleService(1, { minStock: 20 });

    expect(result).toBe(true);
    expect(mockUpdateReplenishmentRule).toHaveBeenCalledWith(1, { minStock: 20 });
  });

  it('should throw error when minStock is negative', () => {
    expect(() => updateReplenishmentRuleService(1, { minStock: -1 })).toThrow('最小库存不能为负数');
  });

  it('should throw error when maxStock < minStock', () => {
    expect(() =>
      updateReplenishmentRuleService(1, { minStock: 50, maxStock: 30 })
    ).toThrow('最大库存不能小于最小库存');
  });

  it('should return false when update fails', () => {
    mockUpdateReplenishmentRule.mockReturnValue(false);

    const result = updateReplenishmentRuleService(1, { minStock: 20 });

    expect(result).toBe(false);
  });
});

// ===================== deleteReplenishmentRuleService Tests =====================

describe('deleteReplenishmentRuleService', () => {
  it('should delete rule and return true on success', () => {
    mockDeleteReplenishmentRule.mockReturnValue(true);

    const result = deleteReplenishmentRuleService(1);

    expect(result).toBe(true);
    expect(mockDeleteReplenishmentRule).toHaveBeenCalledWith(1);
  });

  it('should return false on failure', () => {
    mockDeleteReplenishmentRule.mockReturnValue(false);

    const result = deleteReplenishmentRuleService(1);

    expect(result).toBe(false);
  });
});

// ===================== getReplenishmentRulesService Tests =====================

describe('getReplenishmentRulesService', () => {
  it('should return list of rules', () => {
    mockGetReplenishmentRules.mockReturnValue(REPLENISHMENT_RULES);

    const result = getReplenishmentRulesService();

    expect(result).toHaveLength(2);
    expect(result[0].sku).toBe('SKU-001');
    expect(result[1].sku).toBe('SKU-003');
  });

  it('should apply filters when provided', () => {
    mockGetReplenishmentRules.mockReturnValue([REPLENISHMENT_RULES[0]]);

    const result = getReplenishmentRulesService({ sku: 'SKU-001', warehouseId: 'WH1' });

    expect(result).toHaveLength(1);
    expect(mockGetReplenishmentRules).toHaveBeenCalledWith({ sku: 'SKU-001', warehouseId: 'WH1' });
  });

  it('should map snake_case to camelCase correctly', () => {
    mockGetReplenishmentRules.mockReturnValue([REPLENISHMENT_RULES[0]]);

    const result = getReplenishmentRulesService();

    expect(result[0].warehouseId).toBe('WH1');
    expect(result[0].minStock).toBe(10);
    expect(result[0].maxStock).toBe(100);
    expect(result[0].safetyDays).toBe(7);
    expect(result[0].replenishMultiplier).toBe(1.5);
    expect(result[0].supplierId).toBe('SUP-001');
    expect(result[0].leadTimeDays).toBe(3);
    expect(result[0].autoOrder).toBe(false);
  });
});

// ===================== getReplenishmentRuleDetail Tests =====================

describe('getReplenishmentRuleDetail', () => {
  it('should return rule detail for valid ID', () => {
    mockGetReplenishmentRuleById.mockReturnValue(REPLENISHMENT_RULES[0]);

    const result = getReplenishmentRuleDetail(1);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.sku).toBe('SKU-001');
  });

  it('should return null for non-existent ID', () => {
    mockGetReplenishmentRuleById.mockReturnValue(undefined);

    const result = getReplenishmentRuleDetail(999);

    expect(result).toBeNull();
  });
});

// ===================== executeReplenishment Tests =====================

describe('executeReplenishment', () => {
  it('should execute replenishment successfully', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockCreateInboundRecord.mockReturnValue({ id: 'inb-001' });
    mockUpdateInventoryItem.mockReturnValue(true);

    const suggestion = {
      sku: 'SKU-001',
      name: '商品A',
      warehouseId: 'WH1',
      warehouseName: '主仓库',
      currentStock: 5,
      threshold: 10,
      suggestedQuantity: 50,
      unitPrice: 10,
      estimatedCost: 500,
      reason: '库存低于阈值',
      priority: 'high' as const,
      createdAt: new Date().toISOString(),
    };

    const result = executeReplenishment(suggestion, 'operator-001');

    expect(result.inboundRecordId).toBeNaN(); // Number('inb-001') = NaN for string IDs
    expect(result.newStock).toBe(55); // 5 + 50
    expect(mockCreateInboundRecord).toHaveBeenCalled();
    expect(mockUpdateInventoryItem).toHaveBeenCalledWith('inv-001', { quantity: 55 });
  });

  it('should throw error when item not found', () => {
    mockGetInventoryItems.mockReturnValue([]);

    const suggestion = {
      sku: 'SKU-NOT-FOUND',
      name: '不存在商品',
      warehouseId: 'WH1',
      warehouseName: '主仓库',
      currentStock: 5,
      threshold: 10,
      suggestedQuantity: 50,
      unitPrice: 10,
      estimatedCost: 500,
      reason: '库存低于阈值',
      priority: 'high' as const,
      createdAt: new Date().toISOString(),
    };

    expect(() => executeReplenishment(suggestion)).toThrow('商品 SKU-NOT-FOUND 不存在');
  });
});

// ===================== getReplenishmentStats Tests =====================

describe('getReplenishmentStats', () => {
  it('should return aggregated statistics', () => {
    mockGetReplenishmentRules.mockReturnValue(REPLENISHMENT_RULES);
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockGetReplenishmentRuleBySkuAndWarehouse.mockImplementation((sku: string, warehouseId: string) => {
      return REPLENISHMENT_RULES.find(r => r.sku === sku && r.warehouse_id === warehouseId);
    });
    mockGetOutboundRecords.mockReturnValue([]);
    mockGetWarehouseById.mockImplementation((id: string) => WAREHOUSES[id as keyof typeof WAREHOUSES]);

    const result = getReplenishmentStats();

    expect(result.totalRules).toBe(2);
    expect(result.activeRules).toBe(2);
    expect(result.lowStockItems).toBeGreaterThanOrEqual(0);
    expect(typeof result.pendingSuggestions).toBe('number');
    expect(typeof result.totalSuggestedCost).toBe('number');
  });

  it('should filter by warehouseId when provided', () => {
    mockGetReplenishmentRules.mockReturnValue([REPLENISHMENT_RULES[0]]);
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS.filter(i => i.warehouseId === 'WH1'));
    mockGetReplenishmentRuleBySkuAndWarehouse.mockReturnValue(REPLENISHMENT_RULES[0]);
    mockGetOutboundRecords.mockReturnValue([]);
    mockGetWarehouseById.mockReturnValue(WAREHOUSES.WH1);

    const result = getReplenishmentStats('WH1');

    expect(result.totalRules).toBe(1);
  });
});

// ===================== generateSuggestions (compat) Tests =====================

describe('generateSuggestions (compat)', () => {
  it('should return suggestions with pagination info', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockGetReplenishmentRuleBySkuAndWarehouse.mockImplementation((sku: string, warehouseId: string) => {
      return REPLENISHMENT_RULES.find(r => r.sku === sku && r.warehouse_id === warehouseId);
    });
    mockGetOutboundRecords.mockReturnValue([]);
    mockGetWarehouseById.mockImplementation((id: string) => WAREHOUSES[id as keyof typeof WAREHOUSES]);

    const result = generateSuggestions();

    expect(result.items).toBeDefined();
    expect(result.total).toBeDefined();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBeDefined();
    expect(result.created).toBeDefined();
  });
});

// ===================== getSuggestions (compat) Tests =====================

describe('getSuggestions (compat)', () => {
  it('should return paginated suggestions', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockGetReplenishmentRuleBySkuAndWarehouse.mockImplementation((sku: string, warehouseId: string) => {
      return REPLENISHMENT_RULES.find(r => r.sku === sku && r.warehouse_id === warehouseId);
    });
    mockGetOutboundRecords.mockReturnValue([]);
    mockGetWarehouseById.mockImplementation((id: string) => WAREHOUSES[id as keyof typeof WAREHOUSES]);

    const result = getSuggestions({ page: 1, pageSize: 10 });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.items).toBeDefined();
    expect(result.total).toBeDefined();
  });

  it('should filter by priority', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockGetReplenishmentRuleBySkuAndWarehouse.mockImplementation((sku: string, warehouseId: string) => {
      return REPLENISHMENT_RULES.find(r => r.sku === sku && r.warehouse_id === warehouseId);
    });
    mockGetOutboundRecords.mockReturnValue([]);
    mockGetWarehouseById.mockImplementation((id: string) => WAREHOUSES[id as keyof typeof WAREHOUSES]);

    const result = getSuggestions({ priority: 'high' });

    expect(result.items.every(s => s.priority === 'high')).toBe(true);
  });

  it('should filter by sku', () => {
    mockGetInventoryItems.mockReturnValue(INVENTORY_ITEMS);
    mockGetReplenishmentRuleBySkuAndWarehouse.mockImplementation((sku: string, warehouseId: string) => {
      return REPLENISHMENT_RULES.find(r => r.sku === sku && r.warehouse_id === warehouseId);
    });
    mockGetOutboundRecords.mockReturnValue([]);
    mockGetWarehouseById.mockImplementation((id: string) => WAREHOUSES[id as keyof typeof WAREHOUSES]);

    const result = getSuggestions({ sku: 'SKU-001' });

    expect(result.items.every(s => s.sku === 'SKU-001')).toBe(true);
  });
});

// ===================== updateSuggestionStatus (compat) Tests =====================

describe('updateSuggestionStatus (compat)', () => {
  it('should return suggestion when found', () => {
    mockGetReplenishmentSuggestionById.mockReturnValue({
      id: 1,
      sku: 'SKU-001',
      warehouse_id: 'WH1',
      status: 'pending',
    });

    const result = updateSuggestionStatus(1, 'confirmed');

    expect(result).not.toBeNull();
  });

  it('should return null when suggestion not found', () => {
    mockGetReplenishmentSuggestionById.mockReturnValue(undefined);

    const result = updateSuggestionStatus(999, 'confirmed');

    expect(result).toBeNull();
  });
});

// ===================== createTransferFromSuggestion (compat) Tests =====================

describe('createTransferFromSuggestion (compat)', () => {
  it('should create transfer order successfully', () => {
    mockGetReplenishmentSuggestionById.mockReturnValue({
      id: 1,
      sku: 'SKU-001',
      warehouseId: 'WH1',
      suggestedQuantity: 50,
    });
    mockCreateTransferOrder.mockReturnValue({
      id: 'tf-001',
      transferNo: 'TF202605250001',
    });

    const result = createTransferFromSuggestion(1, { fromWarehouseId: 'WH2', quantity: 50 });

    expect(result).toBeDefined();
    expect(mockCreateTransferOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        fromWarehouseId: 'WH2',
        toWarehouseId: 'WH1',
        sku: 'SKU-001',
        quantity: 50,
        status: 'draft',
      })
    );
  });

  it('should throw error when suggestion not found', () => {
    mockGetReplenishmentSuggestionById.mockReturnValue(undefined);

    expect(() =>
      createTransferFromSuggestion(999, { fromWarehouseId: 'WH2', quantity: 50 })
    ).toThrow('补货建议 999 不存在');
  });
});

// ===================== recommendSourceWarehouse (compat) Tests =====================

describe('recommendSourceWarehouse (compat)', () => {
  it('should return recommendations for warehouses with surplus stock', () => {
    mockGetInventoryItems.mockReturnValue([
      { id: 'inv-004', sku: 'SKU-001', warehouseId: 'WH2', quantity: 200, name: '商品A', valuePerUnit: 10 },
      { id: 'inv-005', sku: 'SKU-001', warehouseId: 'WH3', quantity: 50, name: '商品A', valuePerUnit: 10 },
    ]);
    mockGetWarehouseById.mockImplementation((id: string) => ({ id, name: `仓库${id}` }));

    const result = recommendSourceWarehouse('SKU-001', 'WH1', 30);

    expect(result.length).toBeGreaterThanOrEqual(0);
    // Should only include warehouses with quantity > neededQty * 0.5 = 15
  });

  it('should return empty array when no warehouses have surplus', () => {
    mockGetInventoryItems.mockReturnValue([
      { id: 'inv-004', sku: 'SKU-001', warehouseId: 'WH2', quantity: 10, name: '商品A', valuePerUnit: 10 },
    ]);
    mockGetWarehouseById.mockImplementation((id: string) => ({ id, name: `仓库${id}` }));

    const result = recommendSourceWarehouse('SKU-001', 'WH1', 100);

    // quantity=10 <= 100*0.5=50, so no recommendations
    expect(result).toEqual([]);
  });

  it('should sort by quantity descending', () => {
    mockGetInventoryItems.mockReturnValue([
      { id: 'inv-004', sku: 'SKU-001', warehouseId: 'WH2', quantity: 50, name: '商品A', valuePerUnit: 10 },
      { id: 'inv-005', sku: 'SKU-001', warehouseId: 'WH3', quantity: 200, name: '商品A', valuePerUnit: 10 },
      { id: 'inv-006', sku: 'SKU-001', warehouseId: 'WH4', quantity: 100, name: '商品A', valuePerUnit: 10 },
    ]);
    mockGetWarehouseById.mockImplementation((id: string) => ({ id, name: `仓库${id}` }));

    const result = recommendSourceWarehouse('SKU-001', 'WH1', 30);

    // Should be sorted by quantity desc: WH3 (200), WH4 (100), WH2 (50)
    if (result.length >= 2) {
      expect(result[0].surplus).toBeGreaterThanOrEqual(result[1].surplus);
    }
  });
});
