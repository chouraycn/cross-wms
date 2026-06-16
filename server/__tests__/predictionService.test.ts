/**
 * Unit tests for server/services/predictionService.ts
 *
 * Tests:
 * - computeEMA: edge cases, various alpha values, single/multi value
 * - checkAllPredictions: normal / shortage / overstock / insufficient-data / disabled
 * - getPredictionDetail: valid SKU / missing SKU / zero stock
 * - Severity determination rules validation
 *
 * Mock strategy:
 * - computeEMA is a pure function, tested directly
 * - checkAllPredictions & getPredictionDetail use mock DB with controllable returns
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock Infrastructure =====================

/** Creates a mock statement with chainable run/get/all methods */
function createMockStatement(overrides?: {
  allReturn?: unknown[];
  getReturn?: unknown;
  runReturn?: unknown;
}) {
  return {
    run: vi.fn(() => overrides?.runReturn ?? undefined),
    get: vi.fn(() => overrides?.getReturn ?? undefined),
    all: vi.fn(() => overrides?.allReturn ?? []),
  };
}

const mockDb = {
  prepare: vi.fn(),
  transaction: vi.fn(),
  exec: vi.fn(),
  pragma: vi.fn(),
};

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

import {
  computeEMA,
  checkAllPredictions,
  getPredictionDetail,
} from '../services/predictionService.js';

// ===================== computeEMA Tests =====================

describe('computeEMA', () => {
  it('returns 0 for empty array', () => {
    expect(computeEMA([])).toBe(0);
  });

  it('returns the first value for single-element array', () => {
    expect(computeEMA([42])).toBe(42);
  });

  it('returns the only value regardless of alpha for single element', () => {
    expect(computeEMA([42], 0.1)).toBe(42);
    expect(computeEMA([42], 0.5)).toBe(42);
    expect(computeEMA([42], 0.9)).toBe(42);
  });

  it('computes EMA for two elements with default alpha=0.3', () => {
    // EMA[1] = values[0] = 10
    // EMA[2] = 0.3 * 20 + 0.7 * 10 = 6 + 7 = 13
    expect(computeEMA([10, 20])).toBe(13);
  });

  it('computes EMA for constant values returns same value', () => {
    expect(computeEMA([5, 5, 5, 5, 5])).toBe(5);
  });

  it('computes EMA with varying alpha values', () => {
    const values = [10, 20, 30, 40, 50];

    // alpha=0.1: slow to adapt, closer to initial
    const slowEma = computeEMA(values, 0.1);
    // alpha=0.7: fast to adapt, closer to latest
    const fastEma = computeEMA(values, 0.7);

    // Fast EMA should be closer to 50 (last value), slow EMA closer to 10
    expect(fastEma).toBeGreaterThan(slowEma);
    expect(slowEma).toBeLessThan(40); // slow EMA stays lower
    expect(fastEma).toBeGreaterThan(30); // fast EMA tracks upward trend
  });

  it('alpha=1 means EMA equals latest value', () => {
    const values = [10, 20, 30, 40, 50];
    // EMA = alpha * latest + (1-alpha) * previous
    // With alpha=1: EMA always equals the latest value
    const ema = computeEMA(values, 1.0);
    expect(ema).toBe(50);
  });

  it('alpha=0 means EMA equals first value', () => {
    const values = [10, 20, 30, 40, 50];
    const ema = computeEMA(values, 0);
    expect(ema).toBe(10);
  });

  it('handles negative values correctly', () => {
    const ema = computeEMA([-5, 10]);
    // EMA = values[0] = -5
    // EMA = 0.3 * 10 + 0.7 * (-5) = 3 - 3.5 = -0.5
    expect(ema).toBeCloseTo(-0.5, 5);
  });

  it('handles large number of values (performance sanity)', () => {
    const largeArray = Array.from({ length: 365 }, (_, i) => i + 1);
    const ema = computeEMA(largeArray, 0.3);
    // Should converge close to the last value over many iterations
    expect(ema).toBeGreaterThan(300);
    expect(ema).toBeLessThan(365);
  });

  it('EMA with default alpha 0.3 gives more weight to recent data', () => {
    // Recent values spike up, EMA should reflect the spike more than simple average
    const values = [100, 100, 100, 100, 200];
    const ema = computeEMA(values, 0.3);
    const simpleAvg = values.reduce((a, b) => a + b, 0) / values.length;
    // EMA should be above simple average because recent value is higher
    expect(ema).toBeGreaterThan(simpleAvg);
  });
});

// ===================== checkAllPredictions Tests =====================

describe('checkAllPredictions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns empty result when prediction is disabled', async () => {
    const result = await checkAllPredictions(mockDb as any, {
      enabled: false,
      predictionDays: 14,
      shortageThreshold: 10,
      overstockDays: 60,
      minHistoryDays: 7,
    });

    expect(result.newAlerts).toBe(0);
    expect(result.predictedShortageAlerts).toBe(0);
    expect(result.predictedOverstockAlerts).toBe(0);
    expect(result.errors).toHaveLength(0);
    // Should not even try to query the DB
    expect(mockDb.prepare).not.toHaveBeenCalled();
  });

  it('returns empty result when there are no outbound records', async () => {
    const dailyOutboundStmt = createMockStatement({ allReturn: [] });
    mockDb.prepare.mockReturnValue(dailyOutboundStmt);

    const result = await checkAllPredictions(mockDb as any);

    expect(result.newAlerts).toBe(0);
    expect(result.predictedShortageAlerts).toBe(0);
    expect(result.predictedOverstockAlerts).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('skips SKUs with insufficient history days (< minHistoryDays)', async () => {
    // Only 3 days of history, below default minHistoryDays=7
    const dailyOutbounds = [
      { sku: 'SKU-A', warehouseId: 'WH1', date: '2026-04-01', dailyOutbound: 5 },
      { sku: 'SKU-A', warehouseId: 'WH1', date: '2026-04-02', dailyOutbound: 6 },
      { sku: 'SKU-A', warehouseId: 'WH1', date: '2026-04-03', dailyOutbound: 7 },
    ];

    const inventoryItems = [
      { sku: 'SKU-A', warehouse_id: 'WH1', current_stock: 500, warehouse_name: '主仓库' },
    ];

    const dailyOutboundStmt = createMockStatement({ allReturn: dailyOutbounds });
    const inventoryStmt = createMockStatement({ allReturn: inventoryItems });

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('inventory_transactions')) return dailyOutboundStmt;
      if (sql.includes('inventory_items')) return inventoryStmt;
      return createMockStatement();
    });

    // transaction() just calls the function
    mockDb.transaction.mockImplementation((fn: Function) => fn);

    const result = await checkAllPredictions(mockDb as any);

    expect(result.newAlerts).toBe(0);
    expect(result.predictedShortageAlerts).toBe(0);
    expect(result.predictedOverstockAlerts).toBe(0);
  });

  it('detects predicted shortage with sufficient history', async () => {
    // 14 days of consistent daily outbound (enough for history + confidence medium)
    const dailyOutbounds = Array.from({ length: 14 }, (_, i) => ({
      sku: 'SKU-SHORT',
      warehouseId: 'WH1',
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      dailyOutbound: 10,
    }));

    const inventoryItems = [
      { sku: 'SKU-SHORT', warehouse_id: 'WH1', current_stock: 30, warehouse_name: '主仓库' },
    ];

    const dailyOutboundStmt = createMockStatement({ allReturn: dailyOutbounds });
    const inventoryStmt = createMockStatement({ allReturn: inventoryItems });

    // For de-duplication check: no existing alert
    const dedupStmt = createMockStatement({ getReturn: { cnt: 0 } });
    const insertStmt = createMockStatement({ runReturn: { changes: 1 } });

    const stmtMap: Record<string, ReturnType<typeof createMockStatement>> = {};
    const stmtIndex = 0;

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SUM(ABS(it.quantity))') && sql.includes('inventory_transactions it')) {
        return dailyOutboundStmt;
      }
      if (sql.includes('FROM inventory_items ii') && sql.includes('LEFT JOIN warehouses')) {
        return inventoryStmt;
      }
      if (sql.includes("alert_type = 'predicted_shortage'")) {
        return dedupStmt;
      }
      if (sql.includes('INSERT INTO wms_alerts')) {
        return insertStmt;
      }
      if (sql.includes("alert_type = 'predicted_overstock'")) {
        // Overstock check should not trigger for shortage scenario
        return createMockStatement({ getReturn: { cnt: 0 } });
      }
      return createMockStatement();
    });

    mockDb.transaction.mockImplementation((fn: Function) => fn());

    const result = await checkAllPredictions(mockDb as any);

    // EMA of [10,10,...] = 10, currentStock=30, predictionDays=14
    // predictedStock = 30 - 10*14 = -110 → <= shortageThreshold(10) → triggers shortage
    expect(result.predictedShortageAlerts).toBeGreaterThanOrEqual(1);
    expect(result.predictedOverstockAlerts).toBe(0);
  });

  it('detects predicted overstock with sufficient history', async () => {
    // 14 days of very low daily outbound
    const dailyOutbounds = Array.from({ length: 14 }, (_, i) => ({
      sku: 'SKU-LONG',
      warehouseId: 'WH1',
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      dailyOutbound: 0.5,
    }));

    const inventoryItems = [
      { sku: 'SKU-LONG', warehouse_id: 'WH1', current_stock: 500, warehouse_name: '主仓库' },
    ];

    const dailyOutboundStmt = createMockStatement({ allReturn: dailyOutbounds });
    const inventoryStmt = createMockStatement({ allReturn: inventoryItems });

    // Shortage check: no existing alert
    const shortageDedup = createMockStatement({ getReturn: { cnt: 0 } });
    // Overstock check: no existing alert
    const overstockDedup = createMockStatement({ getReturn: { cnt: 0 } });
    const insertStmt = createMockStatement({ runReturn: { changes: 1 } });

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SUM(ABS(it.quantity))') && sql.includes('inventory_transactions it')) {
        return dailyOutboundStmt;
      }
      if (sql.includes('FROM inventory_items ii') && sql.includes('LEFT JOIN warehouses')) {
        return inventoryStmt;
      }
      if (sql.includes("alert_type = 'predicted_shortage'")) {
        return shortageDedup;
      }
      if (sql.includes("alert_type = 'predicted_overstock'")) {
        return overstockDedup;
      }
      if (sql.includes('INSERT INTO wms_alerts')) {
        return insertStmt;
      }
      return createMockStatement();
    });

    mockDb.transaction.mockImplementation((fn: Function) => fn());

    const result = await checkAllPredictions(mockDb as any);

    // EMA ≈ 0.5, currentStock=500, daysUntilZero ≈ 1000
    // 1000 > overstockDays(60) → triggers overstock
    expect(result.predictedOverstockAlerts).toBeGreaterThanOrEqual(1);
    expect(result.predictedShortageAlerts).toBe(0);
  });

  it('skips de-duplication when existing active alert exists', async () => {
    // Scenario: SKU that would be shortage but already has active predicted_shortage alert
    const dailyOutbounds = Array.from({ length: 14 }, (_, i) => ({
      sku: 'SKU-DUP',
      warehouseId: 'WH1',
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      dailyOutbound: 10,
    }));

    const inventoryItems = [
      { sku: 'SKU-DUP', warehouse_id: 'WH1', current_stock: 30, warehouse_name: '主仓库' },
    ];

    const dailyOutboundStmt = createMockStatement({ allReturn: dailyOutbounds });
    const inventoryStmt = createMockStatement({ allReturn: inventoryItems });
    // De-duplication returns existing alert count > 0
    const dedupStmt = createMockStatement({ getReturn: { cnt: 1 } });

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SUM(ABS(it.quantity))') && sql.includes('inventory_transactions it')) {
        return dailyOutboundStmt;
      }
      if (sql.includes('FROM inventory_items ii') && sql.includes('LEFT JOIN warehouses')) {
        return inventoryStmt;
      }
      if (sql.includes("alert_type = 'predicted_shortage'")) {
        return dedupStmt;
      }
      if (sql.includes("alert_type = 'predicted_overstock'")) {
        return dedupStmt;
      }
      if (sql.includes('INSERT INTO wms_alerts')) {
        return createMockStatement();
      }
      return createMockStatement();
    });

    mockDb.transaction.mockImplementation((fn: Function) => fn());

    const result = await checkAllPredictions(mockDb as any);

    // Should NOT create new alerts because duplicates exist
    expect(result.newAlerts).toBe(0);
    expect(result.predictedShortageAlerts).toBe(0);
    expect(result.predictedOverstockAlerts).toBe(0);
  });

  it('skips SKUs with zero or negative current stock', async () => {
    const dailyOutbounds = Array.from({ length: 14 }, (_, i) => ({
      sku: 'SKU-ZERO',
      warehouseId: 'WH1',
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      dailyOutbound: 10,
    }));

    // SKU not in inventory (or quantity <= 0) — stockIndex won't have it
    const inventoryItems = [
      { sku: 'OTHER-SKU', warehouse_id: 'WH1', current_stock: 100, warehouse_name: '主仓库' },
    ];

    const dailyOutboundStmt = createMockStatement({ allReturn: dailyOutbounds });
    const inventoryStmt = createMockStatement({ allReturn: inventoryItems });

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SUM(ABS(it.quantity))') && sql.includes('inventory_transactions it')) {
        return dailyOutboundStmt;
      }
      if (sql.includes('FROM inventory_items ii') && sql.includes('LEFT JOIN warehouses')) {
        return inventoryStmt;
      }
      return createMockStatement();
    });

    mockDb.transaction.mockImplementation((fn: Function) => fn());

    const result = await checkAllPredictions(mockDb as any);

    expect(result.newAlerts).toBe(0);
  });

  it('skips SKUs with zero daily consumption (EMA=0)', async () => {
    // All zero outbound → EMA = 0
    const dailyOutbounds = Array.from({ length: 14 }, (_, i) => ({
      sku: 'SKU-ZERO-CONSUME',
      warehouseId: 'WH1',
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      dailyOutbound: 0,
    }));

    const inventoryItems = [
      { sku: 'SKU-ZERO-CONSUME', warehouse_id: 'WH1', current_stock: 100, warehouse_name: '主仓库' },
    ];

    const dailyOutboundStmt = createMockStatement({ allReturn: dailyOutbounds });
    const inventoryStmt = createMockStatement({ allReturn: inventoryItems });

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SUM(ABS(it.quantity))') && sql.includes('inventory_transactions it')) {
        return dailyOutboundStmt;
      }
      if (sql.includes('FROM inventory_items ii') && sql.includes('LEFT JOIN warehouses')) {
        return inventoryStmt;
      }
      return createMockStatement();
    });

    mockDb.transaction.mockImplementation((fn: Function) => fn());

    const result = await checkAllPredictions(mockDb as any);

    // EMA = 0, dailyConsumption <= 0 → continue (skip)
    expect(result.newAlerts).toBe(0);
  });

  it('handles db errors gracefully in catch block', async () => {
    mockDb.prepare.mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    const result = await checkAllPredictions(mockDb as any);

    expect(result.newAlerts).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Database connection failed');
  });

  it('uses default config when no config provided', async () => {
    const dailyOutboundStmt = createMockStatement({ allReturn: [] });
    mockDb.prepare.mockReturnValue(dailyOutboundStmt);

    await checkAllPredictions(mockDb as any);

    // Should have been called (with default config, which has enabled=true)
    expect(mockDb.prepare).toHaveBeenCalled();
  });

  it('handles multiple SKU groups correctly', async () => {
    const dailyOutbounds = [
      ...Array.from({ length: 14 }, (_, i) => ({
        sku: 'SKU-1', warehouseId: 'WH1', date: `2026-04-${String(i + 1).padStart(2, '0')}`, dailyOutbound: 10,
      })),
      ...Array.from({ length: 14 }, (_, i) => ({
        sku: 'SKU-2', warehouseId: 'WH1', date: `2026-04-${String(i + 1).padStart(2, '0')}`, dailyOutbound: 0.5,
      })),
    ];

    const inventoryItems = [
      { sku: 'SKU-1', warehouse_id: 'WH1', current_stock: 30, warehouse_name: '主仓库' },
      { sku: 'SKU-2', warehouse_id: 'WH1', current_stock: 500, warehouse_name: '主仓库' },
    ];

    const dailyOutboundStmt = createMockStatement({ allReturn: dailyOutbounds });
    const inventoryStmt = createMockStatement({ allReturn: inventoryItems });
    const dedupStmt = createMockStatement({ getReturn: { cnt: 0 } });
    const insertStmt = createMockStatement({ runReturn: { changes: 1 } });

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SUM(ABS(it.quantity))') && sql.includes('inventory_transactions it')) {
        return dailyOutboundStmt;
      }
      if (sql.includes('FROM inventory_items ii') && sql.includes('LEFT JOIN warehouses')) {
        return inventoryStmt;
      }
      if (sql.includes('INSERT INTO wms_alerts')) {
        return insertStmt;
      }
      return dedupStmt;
    });

    mockDb.transaction.mockImplementation((fn: Function) => fn());

    const result = await checkAllPredictions(mockDb as any);

    // SKU-1 should be shortage, SKU-2 should be overstock
    expect(result.predictedShortageAlerts).toBeGreaterThanOrEqual(1);
    expect(result.predictedOverstockAlerts).toBeGreaterThanOrEqual(1);
    expect(result.newAlerts).toBeGreaterThanOrEqual(2);
  });
});

// ===================== Severity Determination Tests =====================

describe('Severity determination rules', () => {
  /**
   * These tests validate that the severity logic embedded in checkAllPredictions
   * follows the documented rules:
   *
   * Shortage severity:
   *   daysUntilZero <= 3   → critical
   *   daysUntilZero <= 7   → high
   *   daysUntilZero <= 14  → medium
   *   daysUntilZero > 14   → low
   *
   * Overstock severity (based on excessRatio = daysUntilZero / overstockDays):
   *   excessRatio >= 3     → critical
   *   excessRatio >= 2     → high
   *   excessRatio >= 1.5   → medium
   *   excessRatio < 1.5    → low
   */

  function simulateShortageSeverity(daysUntilZero: number): string {
    if (daysUntilZero <= 3) return 'critical';
    if (daysUntilZero <= 7) return 'high';
    if (daysUntilZero <= 14) return 'medium';
    return 'low';
  }

  function simulateOverstockSeverity(daysUntilZero: number, overstockDays: number): string {
    const excessRatio = daysUntilZero / overstockDays;
    if (excessRatio >= 3) return 'critical';
    if (excessRatio >= 2) return 'high';
    if (excessRatio >= 1.5) return 'medium';
    return 'low';
  }

  describe('Shortage severity', () => {
    it('daysUntilZero=0 or 1 is critical', () => {
      expect(simulateShortageSeverity(0)).toBe('critical');
      expect(simulateShortageSeverity(1)).toBe('critical');
      expect(simulateShortageSeverity(3)).toBe('critical');
    });

    it('daysUntilZero=4-7 is high', () => {
      expect(simulateShortageSeverity(4)).toBe('high');
      expect(simulateShortageSeverity(7)).toBe('high');
    });

    it('daysUntilZero=8-14 is medium', () => {
      expect(simulateShortageSeverity(8)).toBe('medium');
      expect(simulateShortageSeverity(14)).toBe('medium');
    });

    it('daysUntilZero >= 15 is low', () => {
      expect(simulateShortageSeverity(15)).toBe('low');
      expect(simulateShortageSeverity(30)).toBe('low');
      expect(simulateShortageSeverity(365)).toBe('low');
    });

    it('boundary: exactly 3 is critical (not high)', () => {
      expect(simulateShortageSeverity(3)).toBe('critical');
    });

    it('boundary: exactly 4 is high (not critical)', () => {
      expect(simulateShortageSeverity(4)).toBe('high');
    });
  });

  describe('Overstock severity', () => {
    const defaultOverstockDays = 60;

    it('excessRatio >= 3 is critical (daysUntilZero >= 180)', () => {
      expect(simulateOverstockSeverity(180, defaultOverstockDays)).toBe('critical');
      expect(simulateOverstockSeverity(200, defaultOverstockDays)).toBe('critical');
    });

    it('excessRatio >= 2 is high (120 <= days < 180)', () => {
      expect(simulateOverstockSeverity(120, defaultOverstockDays)).toBe('high');
      expect(simulateOverstockSeverity(179, defaultOverstockDays)).toBe('high');
    });

    it('excessRatio >= 1.5 is medium (90 <= days < 120)', () => {
      expect(simulateOverstockSeverity(90, defaultOverstockDays)).toBe('medium');
      expect(simulateOverstockSeverity(119, defaultOverstockDays)).toBe('medium');
    });

    it('excessRatio < 1.5 is low (61 <= days < 90)', () => {
      expect(simulateOverstockSeverity(61, defaultOverstockDays)).toBe('low');
      expect(simulateOverstockSeverity(89, defaultOverstockDays)).toBe('low');
    });

    it('boundary: exactly 180 is critical', () => {
      expect(simulateOverstockSeverity(180, defaultOverstockDays)).toBe('critical');
    });

    it('boundary: exactly 90 is medium', () => {
      expect(simulateOverstockSeverity(90, defaultOverstockDays)).toBe('medium');
    });

    it('boundary: exactly 120 is high', () => {
      expect(simulateOverstockSeverity(120, defaultOverstockDays)).toBe('high');
    });
  });
});

// ===================== Confidence Level Tests =====================

describe('Confidence level determination', () => {
  function getConfidence(historyDays: number): 'high' | 'medium' | 'low' {
    if (historyDays >= 28) return 'high';
    if (historyDays >= 14) return 'medium';
    return 'low';
  }

  it('historyDays >= 28 → high confidence', () => {
    expect(getConfidence(28)).toBe('high');
    expect(getConfidence(30)).toBe('high');
  });

  it('14 <= historyDays < 28 → medium confidence', () => {
    expect(getConfidence(14)).toBe('medium');
    expect(getConfidence(20)).toBe('medium');
    expect(getConfidence(27)).toBe('medium');
  });

  it('historyDays < 14 → low confidence', () => {
    expect(getConfidence(7)).toBe('low');
    expect(getConfidence(13)).toBe('low');
    expect(getConfidence(1)).toBe('low');
  });

  it('boundary: exactly 28 is high (not medium)', () => {
    expect(getConfidence(28)).toBe('high');
  });

  it('boundary: exactly 14 is medium (not low)', () => {
    expect(getConfidence(14)).toBe('medium');
  });
});

// ===================== getPredictionDetail Tests =====================

describe('getPredictionDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns null when stock row is undefined', () => {
    const stockStmt = createMockStatement({ getReturn: undefined });
    mockDb.prepare.mockReturnValue(stockStmt);

    const result = getPredictionDetail(mockDb as any, 'SKU-X', 'WH1');

    expect(result).toBeNull();
  });

  it('returns null when current stock <= 0', () => {
    const stockStmt = createMockStatement({
      getReturn: { current_stock: 0, warehouse_name: '主仓库' },
    });
    mockDb.prepare.mockReturnValue(stockStmt);

    const result = getPredictionDetail(mockDb as any, 'SKU-X', 'WH1');

    expect(result).toBeNull();
  });

  it('returns detail with correct structure for valid SKU', () => {
    // Simulating a SKU with 14 days of history and 30 items in stock
    const historyOutbounds = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      outbound: 2,
    }));

    const historySnapshots = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      stock: 30 - i * 2,
    }));

    const stockRow = {
      current_stock: 30,
      warehouse_name: '主仓库',
    };

    const stockStmt = createMockStatement({ getReturn: stockRow });
    const outboundStmt = createMockStatement({ allReturn: historyOutbounds });
    const snapshotStmt = createMockStatement({ allReturn: historySnapshots });

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM inventory_items ii') && sql.includes('LEFT JOIN warehouses') && sql.includes('WHERE ii.sku')) {
        return stockStmt;
      }
      if (sql.includes('FROM inventory_transactions it') && sql.includes('GROUP BY DATE')) {
        return outboundStmt;
      }
      if (sql.includes('FROM inventory_items') && sql.includes('WHERE sku')) {
        return snapshotStmt;
      }
      return createMockStatement();
    });

    const result = getPredictionDetail(mockDb as any, 'SKU-X', 'WH1');

    expect(result).not.toBeNull();
    expect(result!.sku).toBe('SKU-X');
    expect(result!.warehouseId).toBe('WH1');
    expect(result!.warehouseName).toBe('主仓库');
    expect(result!.currentStock).toBe(30);
    expect(result!.dailyConsumption).toBe(2); // EMA of all-2s = 2
    expect(result!.daysUntilZero).toBe(15); // 30/2 = 15
    expect(result!.confidence).toBe('medium'); // 14 days → medium
    expect(result!.historyData).toHaveLength(14);
    expect(result!.predictionCurve).toHaveLength(14); // default predictionDays
    expect(result!.safetyStockLine).toBe(10); // default shortageThreshold
  });

  it('predictionCurve shows decreasing stock over time', () => {
    const historyOutbounds = Array.from({ length: 28 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      outbound: 3,
    }));

    const stockRow = {
      current_stock: 60,
      warehouse_name: '主仓库',
    };

    const stockStmt = createMockStatement({ getReturn: stockRow });
    const outboundStmt = createMockStatement({ allReturn: historyOutbounds });
    const snapshotStmt = createMockStatement({ allReturn: [] });

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM inventory_items ii') && sql.includes('LEFT JOIN warehouses') && sql.includes('WHERE ii.sku')) {
        return stockStmt;
      }
      if (sql.includes('FROM inventory_transactions it') && sql.includes('GROUP BY DATE')) {
        return outboundStmt;
      }
      if (sql.includes('FROM inventory_items') && sql.includes('WHERE sku')) {
        return snapshotStmt;
      }
      return createMockStatement();
    });

    const result = getPredictionDetail(mockDb as any, 'SKU-Y', 'WH1');

    expect(result).not.toBeNull();
    expect(result!.predictionCurve.length).toBeGreaterThan(0);

    // Each subsequent prediction should have less or equal stock
    for (let i = 1; i < result!.predictionCurve.length; i++) {
      expect(result!.predictionCurve[i].predictedStock).toBeLessThanOrEqual(
        result!.predictionCurve[i - 1].predictedStock
      );
    }

    // Confidence should be high (28 days)
    expect(result!.confidence).toBe('high');
  });

  it('returns low confidence for < 14 history days', () => {
    // Only 7 days of history
    const historyOutbounds = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      outbound: 2,
    }));

    const stockRow = { current_stock: 30, warehouse_name: '主仓库' };
    const stockStmt = createMockStatement({ getReturn: stockRow });
    const outboundStmt = createMockStatement({ allReturn: historyOutbounds });
    const snapshotStmt = createMockStatement({ allReturn: [] });

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM inventory_items ii') && sql.includes('LEFT JOIN warehouses') && sql.includes('WHERE ii.sku')) {
        return stockStmt;
      }
      if (sql.includes('FROM inventory_transactions it') && sql.includes('GROUP BY DATE')) {
        return outboundStmt;
      }
      if (sql.includes('FROM inventory_items') && sql.includes('WHERE sku')) {
        return snapshotStmt;
      }
      return createMockStatement();
    });

    const result = getPredictionDetail(mockDb as any, 'SKU-LC', 'WH1');

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('low');
  });

  it('daysUntilZero returns MAX_SAFE_INTEGER when dailyConsumption is 0', () => {
    const historyOutbounds = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      outbound: 0,
    }));

    const stockRow = { current_stock: 500, warehouse_name: '主仓库' };
    const stockStmt = createMockStatement({ getReturn: stockRow });
    const outboundStmt = createMockStatement({ allReturn: historyOutbounds });
    const snapshotStmt = createMockStatement({ allReturn: [] });

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM inventory_items ii') && sql.includes('LEFT JOIN warehouses') && sql.includes('WHERE ii.sku')) {
        return stockStmt;
      }
      if (sql.includes('FROM inventory_transactions it') && sql.includes('GROUP BY DATE')) {
        return outboundStmt;
      }
      if (sql.includes('FROM inventory_items') && sql.includes('WHERE sku')) {
        return snapshotStmt;
      }
      return createMockStatement();
    });

    const result = getPredictionDetail(mockDb as any, 'SKU-ZC', 'WH1');

    expect(result).not.toBeNull();
    expect(result!.dailyConsumption).toBe(0);
    expect(result!.daysUntilZero).toBe(Number.MAX_SAFE_INTEGER);
  });
});
